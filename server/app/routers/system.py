"""Settings, background jobs, and health status."""
import ipaddress
import json
import platform
import shutil
import socket
import urllib.parse

import httpx
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session as DbSession

from .. import config
from ..deps import get_current_user, get_db
from ..models import Job, Setting, Track, User
from ..schemas import JobOut, MessageOut, SettingsOut, SettingsUpdate
from ..services.scanner import normalize_library_roots
from ..services.streaming import ffmpeg_available

router = APIRouter(prefix="/api", tags=["system"])

AI_DEFAULT_URLS = {
    "ollama": "http://127.0.0.1:11434/v1",
    "lm-studio": "http://127.0.0.1:1234/v1",
}


def _setting_json(db: DbSession, key: str, default):
    row = db.query(Setting).filter(Setting.key == key).first()
    if not row or row.value in (None, ""):
        return default
    try:
        return json.loads(row.value)
    except json.JSONDecodeError:
        return default


def _upsert_setting(db: DbSession, key: str, value) -> None:
    setting = db.query(Setting).filter(Setting.key == key).first()
    if setting is None:
        setting = Setting(key=key)
        db.add(setting)
    setting.value = json.dumps(value)
    # Settings changed on disk -> drop in-process caches so reads are fresh.
    from . import discovery as _discovery
    from . import library as _library

    _library.invalidate_settings_cache()
    _discovery.invalidate_ai_cfg_cache()


_SETTINGS_KEYS = {"library_roots", "ai", "scan_interval_hours", "transcode_enabled", "scrobble", "discord", "acoustid"}


def _get_settings(db: DbSession) -> SettingsOut:
    # One query for all settings instead of 7 separate ones.
    raw: dict[str, object] = {}
    for row in db.query(Setting).filter(Setting.key.in_(_SETTINGS_KEYS)).all():
        if row.value:
            try:
                raw[row.key] = json.loads(row.value)
            except json.JSONDecodeError:
                raw[row.key] = None
    roots = raw.get("library_roots") or []
    ai = raw.get("ai") or {}
    hours = raw.get("scan_interval_hours") or 0
    try:
        hours = int(hours)
    except (TypeError, ValueError):
        hours = 0
    transcode = bool(raw.get("transcode_enabled") or False)
    scrobble = raw.get("scrobble") or {}
    discord = raw.get("discord") or {}
    acoustid = raw.get("acoustid") or {}
    return SettingsOut(
        library_roots=roots if isinstance(roots, list) else [],
        ai=ai if isinstance(ai, dict) else {},
        scan_interval_hours=max(0, hours),
        transcode_enabled=transcode,
        scrobble=scrobble if isinstance(scrobble, dict) else {},
        discord=discord if isinstance(discord, dict) else {},
        acoustid=acoustid if isinstance(acoustid, dict) else {},
    )


def _save_settings(db: DbSession, payload: SettingsUpdate, current: SettingsOut) -> SettingsOut:
    if payload.library_roots is not None:
        _upsert_setting(db, "library_roots", normalize_library_roots(payload.library_roots))
    if payload.ai is not None:
        _upsert_setting(db, "ai", {**current.ai, **payload.ai})
    if payload.scan_interval_hours is not None:
        _upsert_setting(db, "scan_interval_hours", int(payload.scan_interval_hours))
    if payload.transcode_enabled is not None:
        _upsert_setting(db, "transcode_enabled", bool(payload.transcode_enabled))
    if payload.scrobble is not None:
        _upsert_setting(db, "scrobble", {**current.scrobble, **payload.scrobble})
    if payload.discord is not None:
        _upsert_setting(db, "discord", {**current.discord, **payload.discord})
    if payload.acoustid is not None:
        _upsert_setting(db, "acoustid", {**current.acoustid, **payload.acoustid})
    db.commit()
    return _get_settings(db)


@router.get("/settings", response_model=SettingsOut)
def get_settings(db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    return _get_settings(db)


_SSRF_BLOCKED_NETS = [
    ipaddress.ip_network(n)
    for n in (
        "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16",
        "127.0.0.0/8", "169.254.0.0/16",
        "::1/128", "fc00::/7", "fe80::/10",
    )
]


def _validate_ai_base_url(url: str) -> None:
    if not url:
        return
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="ai.base_url must use http or https")
    hostname = parsed.hostname or ""
    try:
        for info in socket.getaddrinfo(hostname, None):
            addr = ipaddress.ip_address(info[4][0])
            if any(addr in net for net in _SSRF_BLOCKED_NETS):
                raise HTTPException(
                    status_code=400,
                    detail="ai.base_url must not target private or reserved addresses",
                )
    except socket.gaierror:
        pass


@router.put("/settings", response_model=SettingsOut)
def update_settings(
    payload: SettingsUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    if payload.ai and "base_url" in (payload.ai or {}):
        _validate_ai_base_url(str(payload.ai.get("base_url") or ""))
    current = _get_settings(db)
    return _save_settings(db, payload, current)


@router.post("/scrobble/lastfm-auth")
def lastfm_auth(
    payload: dict,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Exchange Last.fm username/password for a session key and store it."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    from ..services.scrobble import lastfm_get_session

    try:
        session_key = lastfm_get_session(
            str(payload.get("api_key") or ""),
            str(payload.get("api_secret") or ""),
            str(payload.get("username") or ""),
            str(payload.get("password") or ""),
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    current = _get_settings(db)
    scrobble = {
        **current.scrobble,
        "lastfm_api_key": str(payload.get("api_key") or current.scrobble.get("lastfm_api_key") or ""),
        "lastfm_api_secret": str(
            payload.get("api_secret") or current.scrobble.get("lastfm_api_secret") or ""
        ),
        "lastfm_session_key": session_key,
        "lastfm_enabled": True,
    }
    _upsert_setting(db, "scrobble", scrobble)
    db.commit()
    return {"session_key": session_key, "message": "Last.fm linked"}


@router.get("/jobs", response_model=list[JobOut])
def list_jobs(
    limit: int = 20,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return db.query(Job).order_by(Job.created_at.desc()).limit(limit).all()


@router.get("/jobs/{job_id}", response_model=JobOut)
def get_job(
    job_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    job = db.query(Job).filter(Job.id == job_id).first()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/health")
def health(db: DbSession = Depends(get_db)):
    """Public health probe (no secrets): liveness + basic counts."""
    track_count = db.query(Track).count()
    return {
        "status": "ok",
        "version": config.VERSION,
        "tracks": track_count,
        "platform": platform.system(),
    }


@router.get("/health/detail")
def health_detail(db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Owner-facing diagnostics: storage, last scan, AI provider reachability."""
    settings = _get_settings(db)
    data_free, data_total, data_used = shutil.disk_usage(config.DATA_DIR)
    last_scan = (
        db.query(Job).filter(Job.kind == "scan").order_by(Job.created_at.desc()).first()
    )

    ai_cfg = settings.ai or {}
    provider = ai_cfg.get("provider", "ollama")
    base_url = ai_cfg.get("base_url") or AI_DEFAULT_URLS.get(provider, "")
    ai_status = {"provider": provider, "base_url": base_url, "reachable": False, "models": []}
    if base_url:
        try:
            with httpx.Client(timeout=2.0) as client:
                resp = client.get(f"{base_url.rstrip('/')}/models")
                if resp.status_code == 200:
                    data = resp.json().get("data", [])
                    ai_status["reachable"] = True
                    ai_status["models"] = [m.get("id") for m in data]
        except Exception:
            pass

    return {
        "storage": {"free_bytes": data_free, "total_bytes": data_total},
        "last_scan": JobOut.model_validate(last_scan) if last_scan else None,
        "ai": ai_status,
        "library_roots": settings.library_roots,
        "scan_interval_hours": settings.scan_interval_hours,
        "transcode_enabled": settings.transcode_enabled,
        "ffmpeg_available": ffmpeg_available(),
    }


@router.post("/settings/backup", response_model=MessageOut)
def backup_db(user: User = Depends(get_current_user)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    import sqlite3
    from datetime import datetime

    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = config.DATA_DIR / f"backup-{stamp}.db"
    config.DATA_DIR.mkdir(parents=True, exist_ok=True)
    src = sqlite3.connect(str(config.DB_PATH))
    dst = sqlite3.connect(str(backup_path))
    with dst:
        src.backup(dst)
    src.close()
    dst.close()
    return MessageOut(message=f"backup written to {backup_path.name}")


@router.post("/settings/restore", response_model=MessageOut)
async def restore_db(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    if not file.filename or not file.filename.endswith(".db"):
        raise HTTPException(status_code=400, detail="Must be a .db file")
    import sqlite3, tempfile, os
    from pathlib import Path as FSPath

    # Write upload to a temp file, validate it's a SQLite DB, then copy over live DB
    data = await file.read()
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp:
        tmp.write(data)
        tmp_path = FSPath(tmp.name)
    try:
        # Validate: try opening as SQLite
        conn = sqlite3.connect(str(tmp_path))
        conn.execute("SELECT name FROM sqlite_master LIMIT 1")
        conn.close()
        # Atomic replace: backup current, then copy upload over it
        import sqlite3 as _sq
        src = _sq.connect(str(tmp_path))
        dst = _sq.connect(str(config.DB_PATH))
        with dst:
            src.backup(dst)
        src.close()
        dst.close()
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid database file: {exc}") from exc
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
    return MessageOut(message="Database restored. Restart the server to reload all caches.")
