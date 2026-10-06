"""Settings, background jobs, and health status."""
import json
import platform
import shutil

import httpx
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DbSession

from .. import config
from ..deps import get_current_user, get_db
from ..models import Job, Setting, Track, User
from ..schemas import JobOut, MessageOut, SettingsOut, SettingsUpdate
from ..services.scanner import normalize_library_roots

router = APIRouter(prefix="/api", tags=["system"])

AI_DEFAULT_URLS = {
    "ollama": "http://127.0.0.1:11434/v1",
    "lm-studio": "http://127.0.0.1:1234/v1",
}


def _get_settings(db: DbSession) -> SettingsOut:
    rows = {s.key: s for s in db.query(Setting).all()}
    roots = json.loads(rows["library_roots"].value) if "library_roots" in rows else []
    ai = json.loads(rows["ai"].value) if "ai" in rows else {}
    return SettingsOut(library_roots=roots, ai=ai)


def _save_settings(db: DbSession, payload: SettingsUpdate, current: SettingsOut) -> SettingsOut:
    if payload.library_roots is not None:
        setting = db.query(Setting).filter(Setting.key == "library_roots").first()
        if setting is None:
            setting = Setting(key="library_roots")
            db.add(setting)
        # Resolve, uniquify, drop nested roots so the same songs aren't scanned twice.
        setting.value = json.dumps(normalize_library_roots(payload.library_roots))
    if payload.ai is not None:
        merged = {**current.ai, **payload.ai}
        setting = db.query(Setting).filter(Setting.key == "ai").first()
        if setting is None:
            setting = Setting(key="ai")
            db.add(setting)
        setting.value = json.dumps(merged)
    db.commit()
    return _get_settings(db)


@router.get("/settings", response_model=SettingsOut)
def get_settings(db: DbSession = Depends(get_db), user: User = Depends(get_current_user)):
    return _get_settings(db)


@router.put("/settings", response_model=SettingsOut)
def update_settings(
    payload: SettingsUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    current = _get_settings(db)
    return _save_settings(db, payload, current)


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
