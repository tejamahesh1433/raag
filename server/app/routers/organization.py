"""Organization: tag review queue, duplicates, MusicBrainz enrichment."""
from __future__ import annotations

import json
import threading
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session as DbSession

from ..deps import get_current_user, get_db
from ..models import Album, Artist, Job, TagSuggestion, Track, User, utcnow
from ..schemas import TrackOut
from ..services import duplicates as dup_svc
from ..services import enrichment as enrich_svc
from ..services import tagging as tag_svc
from .library import _favorite_ids, track_out

router = APIRouter(prefix="/api/organization", tags=["organization"])


class SuggestionOut(BaseModel):
    id: int
    track_id: int
    status: str
    proposed: dict
    original: dict
    rationale: str
    created_at: datetime
    track: TrackOut | None = None

    model_config = {"from_attributes": True}


class ScanTagsIn(BaseModel):
    use_llm: bool = False


def _suggestion_out(db: DbSession, row: TagSuggestion, favs: set[int]) -> SuggestionOut:
    track = db.get(Track, row.track_id)
    return SuggestionOut(
        id=row.id,
        track_id=row.track_id,
        status=row.status,
        proposed=json.loads(row.proposed or "{}"),
        original=json.loads(row.original or "{}"),
        rationale=row.rationale or "",
        created_at=row.created_at,
        track=track_out(track, favs) if track else None,
    )


@router.get("/suggestions", response_model=list[SuggestionOut])
def list_suggestions(
    status: str = Query("pending", pattern="^(pending|approved|rejected|all)$"),
    limit: int = Query(100, ge=1, le=500),
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    q = db.query(TagSuggestion).order_by(TagSuggestion.created_at.desc())
    if status != "all":
        q = q.filter(TagSuggestion.status == status)
    rows = q.limit(limit).all()
    favs = _favorite_ids(db, user)
    return [_suggestion_out(db, r, favs) for r in rows]


@router.post("/scan-tags", status_code=202)
def start_tag_scan(
    payload: ScanTagsIn | None = None,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from .. import config

    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    if not config.ALLOW_TAG_WRITES:
        raise HTTPException(
            status_code=403,
            detail="Tag scanning is disabled — Raag keeps your audio files original",
        )
    use_llm = bool(payload.use_llm) if payload else False
    job = Job(kind="tag", status="running", message="Starting tag scan")
    db.add(job)
    db.commit()
    db.refresh(job)

    def _run():
        from ..db import SessionLocal

        with SessionLocal() as bg:
            target = bg.query(Job).filter(Job.id == job.id).first()
            try:
                tag_svc.scan_tag_suggestions(bg, target, use_llm=use_llm)
            except Exception as exc:  # pragma: no cover
                if target:
                    target.status = "error"
                    target.message = f"Tag scan failed: {exc}"
                    bg.commit()

    threading.Thread(target=_run, daemon=True).start()
    return {"job_id": job.id, "status": job.status}


@router.post("/suggestions/{suggestion_id}/approve", response_model=SuggestionOut)
def approve_suggestion(
    suggestion_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from .. import config

    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    if not config.ALLOW_TAG_WRITES:
        raise HTTPException(
            status_code=403,
            detail="Tag writes are disabled — Raag keeps your audio files original",
        )
    row = db.get(TagSuggestion, suggestion_id)
    if not row or row.status != "pending":
        raise HTTPException(status_code=404, detail="Suggestion not found")
    try:
        tag_svc.apply_suggestion(db, row)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Audio file missing on disk") from None
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Write failed: {exc}") from exc
    db.refresh(row)
    return _suggestion_out(db, row, _favorite_ids(db, user))


@router.post("/suggestions/{suggestion_id}/reject", response_model=SuggestionOut)
def reject_suggestion(
    suggestion_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    row = db.get(TagSuggestion, suggestion_id)
    if not row or row.status != "pending":
        raise HTTPException(status_code=404, detail="Suggestion not found")
    row.status = "rejected"
    row.resolved_at = utcnow()
    db.commit()
    db.refresh(row)
    return _suggestion_out(db, row, _favorite_ids(db, user))


@router.get("/duplicates")
def list_duplicates(
    db: DbSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return {"groups": dup_svc.find_duplicate_groups(db)}


@router.post("/enrich", status_code=202)
def start_enrich(
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    job = Job(kind="enrich", status="running", message="Starting enrichment")
    db.add(job)
    db.commit()
    db.refresh(job)

    def _run():
        from ..db import SessionLocal

        with SessionLocal() as bg:
            target = bg.query(Job).filter(Job.id == job.id).first()
            try:
                enrich_svc.run_enrichment(bg, target)
            except Exception as exc:  # pragma: no cover
                if target:
                    target.status = "error"
                    target.message = f"Enrich failed: {exc}"
                    bg.commit()

    threading.Thread(target=_run, daemon=True).start()
    return {"job_id": job.id, "status": job.status}


@router.get("/enrichment/artist/{artist_id}")
def artist_enrichment(
    artist_id: int,
    db: DbSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    artist = db.get(Artist, artist_id)
    if not artist:
        raise HTTPException(status_code=404, detail="Artist not found")
    info = enrich_svc.fetch_artist_info(db, artist)
    if not info:
        raise HTTPException(status_code=404, detail="No enrichment available")
    return info


@router.get("/enrichment/album/{album_id}")
def album_enrichment(
    album_id: int,
    db: DbSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    album = db.get(Album, album_id)
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    artist = db.get(Artist, album.artist_id)
    info = enrich_svc.fetch_album_info(db, album, artist.name if artist else "")
    if not info:
        raise HTTPException(status_code=404, detail="No enrichment available")
    return info


@router.get("/acoustid/status")
def acoustid_status(_user: User = Depends(get_current_user)):
    from ..services.acoustid import fpcalc_available

    return {"fpcalc_available": fpcalc_available()}


@router.post("/acoustid/identify/{track_id}")
def acoustid_identify(
    track_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Fingerprint a track and look up AcoustID matches (metadata only — no file writes)."""
    from pathlib import Path

    from ..models import Setting
    from ..services.acoustid import identify_path

    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    track = db.get(Track, track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    row = db.query(Setting).filter(Setting.key == "acoustid").first()
    cfg = json.loads(row.value) if row and row.value else {}
    api_key = (cfg.get("api_key") or "").strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="Set AcoustID API key in Settings")
    result = identify_path(Path(track.path), api_key)
    best = result.get("best")
    # Queue a tag suggestion when we have a confident match (review only).
    if best and float(best.get("score") or 0) >= 0.7:
        proposed = {
            "title": best.get("title") or track.title,
            "artist": best.get("artist") or track.artist_name,
            "album": best.get("album") or track.album_title,
        }
        if best.get("year"):
            proposed["year"] = best["year"]
        original = {
            "title": track.title,
            "artist": track.artist_name,
            "album": track.album_title,
            "year": track.year,
        }
        sug = TagSuggestion(
            track_id=track.id,
            status="pending",
            proposed=json.dumps(proposed),
            original=json.dumps(original),
            rationale=f"AcoustID match score {best.get('score'):.2f}",
            created_at=utcnow(),
        )
        db.add(sug)
        db.commit()
        result["suggestion_id"] = sug.id
    return result


@router.post("/acoustid/scan", status_code=202)
def acoustid_scan(
    limit: int = Query(25, ge=1, le=100),
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Background-identify poorly tagged tracks (Unknown / empty title/artist)."""
    from pathlib import Path

    from ..models import Setting
    from ..services.acoustid import identify_path

    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    row = db.query(Setting).filter(Setting.key == "acoustid").first()
    cfg = json.loads(row.value) if row and row.value else {}
    api_key = (cfg.get("api_key") or "").strip()
    if not api_key:
        raise HTTPException(status_code=400, detail="Set AcoustID API key in Settings")

    job = Job(kind="acoustid", status="pending", progress=0, total=0, message="Queued")
    db.add(job)
    db.commit()
    db.refresh(job)
    job_id = job.id

    def worker():
        from ..db import SessionLocal

        with SessionLocal() as s:
            j = s.get(Job, job_id)
            if not j:
                return
            j.status = "running"
            candidates = (
                s.query(Track)
                .filter(
                    (Track.title == "")
                    | (Track.title == "Unknown")
                    | (Track.artist_name == "")
                    | (Track.artist_name == "Unknown Artist")
                    | (Track.artist_name == "Unknown")
                )
                .limit(limit)
                .all()
            )
            j.total = len(candidates)
            j.message = f"Identifying {len(candidates)} tracks"
            s.commit()
            matched = 0
            for i, track in enumerate(candidates):
                result = identify_path(Path(track.path), api_key)
                best = result.get("best")
                if best and float(best.get("score") or 0) >= 0.7:
                    proposed = {
                        "title": best.get("title") or track.title,
                        "artist": best.get("artist") or track.artist_name,
                        "album": best.get("album") or track.album_title,
                    }
                    if best.get("year"):
                        proposed["year"] = best["year"]
                    sug = TagSuggestion(
                        track_id=track.id,
                        status="pending",
                        proposed=json.dumps(proposed),
                        original=json.dumps(
                            {
                                "title": track.title,
                                "artist": track.artist_name,
                                "album": track.album_title,
                                "year": track.year,
                            }
                        ),
                        rationale=f"AcoustID match score {best.get('score'):.2f}",
                        created_at=utcnow(),
                    )
                    s.add(sug)
                    matched += 1
                j.progress = i + 1
                j.message = f"{i + 1}/{len(candidates)} · {matched} matches"
                s.commit()
            j.status = "done"
            j.message = f"Done — {matched} AcoustID suggestions"
            s.commit()

    threading.Thread(target=worker, daemon=True).start()
    return {"job_id": job_id, "status": "pending"}


@router.get("/setup-status")
def setup_status(
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """First-run wizard checklist for the signed-in owner."""
    from ..models import Setting
    from ..services.embeddings import embedding_status
    from ..ai import gateway

    roots_row = db.query(Setting).filter(Setting.key == "library_roots").first()
    roots = json.loads(roots_row.value) if roots_row and roots_row.value else []
    tracks = db.query(Track).count()
    pending = db.query(TagSuggestion).filter(TagSuggestion.status == "pending").count()
    ai_row = db.query(Setting).filter(Setting.key == "ai").first()
    ai = json.loads(ai_row.value) if ai_row and ai_row.value else {}
    reachable = gateway.check_reachable(ai, timeout=1.5) if ai else False
    embed = embedding_status(db, gateway.resolve_model(ai, "embed"))
    return {
        "has_library_roots": len(roots) > 0,
        "library_roots": roots,
        "track_count": tracks,
        "ai_reachable": reachable,
        "embeddings_ready": embed.get("ready", False),
        "pending_tag_suggestions": pending,
        "online_enrichment": bool(ai.get("online_enrichment", True)),
        "is_admin": user.is_admin,
        "wizard_complete": len(roots) > 0 and tracks > 0,
    }
