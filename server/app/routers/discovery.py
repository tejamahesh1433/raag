"""Discovery + lyrics API: embeddings index, similar tracks, semantic search, lyrics."""
from __future__ import annotations

import json
import threading

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session as DbSession

from ..ai import gateway
from ..ai.gateway import ProviderUnavailable
from ..deps import get_current_user, get_db
from ..models import Job, Setting, Track, User
from ..schemas import TrackOut
from ..services import embeddings as emb
from ..services.lyrics import resolve_lyrics
from .library import _favorite_ids, track_out

router = APIRouter(prefix="/api", tags=["discovery"])


class SimilarOut(BaseModel):
    track: TrackOut
    score: float


class EmbedStatusOut(BaseModel):
    indexed: int
    total: int
    model: str
    ready: bool


class LyricsOut(BaseModel):
    plain: str = ""
    synced: list[dict] = Field(default_factory=list)
    source: str = ""


def _ai_cfg(db: DbSession) -> dict:
    row = db.query(Setting).filter(Setting.key == "ai").first()
    if not row or not row.value:
        return {}
    try:
        return json.loads(row.value)
    except json.JSONDecodeError:
        return {}


def _embed_model(db: DbSession) -> str:
    return gateway.resolve_model(_ai_cfg(db), "embed")


@router.get("/discovery/status", response_model=EmbedStatusOut)
def discovery_status(
    db: DbSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    return emb.embedding_status(db, _embed_model(db))


@router.post("/discovery/embed", status_code=202)
def start_embed(
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    job = Job(kind="embed", status="running", message="Starting embed index")
    db.add(job)
    db.commit()
    db.refresh(job)

    def _run():
        from ..db import SessionLocal

        with SessionLocal() as bg:
            target = bg.query(Job).filter(Job.id == job.id).first()
            try:
                emb.run_embed_index(bg, target)
            except ProviderUnavailable as exc:
                if target:
                    target.status = "error"
                    target.message = str(exc)
                    bg.commit()
            except Exception as exc:  # pragma: no cover
                if target:
                    target.status = "error"
                    target.message = f"Embed failed: {exc}"
                    bg.commit()

    threading.Thread(target=_run, daemon=True).start()
    return {"job_id": job.id, "status": job.status}


@router.get("/discovery/similar/{track_id}", response_model=list[SimilarOut])
def similar(
    track_id: int,
    limit: int = Query(12, ge=1, le=50),
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    track = db.get(Track, track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    model = _embed_model(db)
    scored = emb.similar_tracks(db, model, track_id, limit=limit)
    if not scored:
        return []
    favs = _favorite_ids(db, user)
    ids = [tid for tid, _ in scored]
    rows = {t.id: t for t in db.query(Track).filter(Track.id.in_(ids)).all()}
    out: list[SimilarOut] = []
    for tid, score in scored:
        row = rows.get(tid)
        if row:
            out.append(SimilarOut(track=track_out(row, favs), score=round(score, 4)))
    return out


@router.get("/discovery/search", response_model=list[SimilarOut])
def semantic_search(
    q: str = Query(..., min_length=1),
    limit: int = Query(20, ge=1, le=50),
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ai_cfg = _ai_cfg(db)
    model = gateway.resolve_model(ai_cfg, "embed")
    status = emb.embedding_status(db, model)
    if status["indexed"] == 0:
        raise HTTPException(
            status_code=409,
            detail="No embeddings yet — run Index embeddings in Settings",
        )
    try:
        vectors = gateway.embed(ai_cfg, [q.strip()])
    except ProviderUnavailable as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    scored = emb.semantic_search(db, model, vectors[0], limit=limit)
    favs = _favorite_ids(db, user)
    ids = [tid for tid, _ in scored]
    rows = {t.id: t for t in db.query(Track).filter(Track.id.in_(ids)).all()}
    out: list[SimilarOut] = []
    for tid, score in scored:
        row = rows.get(tid)
        if row:
            out.append(SimilarOut(track=track_out(row, favs), score=round(score, 4)))
    return out


@router.get("/tracks/{track_id}/lyrics", response_model=LyricsOut)
def get_lyrics(
    track_id: int,
    db: DbSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    track = db.get(Track, track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    found = resolve_lyrics(db, track, _ai_cfg(db))
    if not found:
        raise HTTPException(status_code=404, detail="No lyrics found")
    return LyricsOut(**found)


@router.post("/tracks/{track_id}/lyrics", response_model=LyricsOut)
def fetch_lyrics(
    track_id: int,
    db: DbSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Force resolve (sidecar → cache → optional LRCLIB)."""
    track = db.get(Track, track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    # Clear cache so resolve re-checks sidecar / online
    from ..models import TrackLyrics

    row = db.get(TrackLyrics, track_id)
    if row:
        db.delete(row)
        db.commit()
    found = resolve_lyrics(db, track, _ai_cfg(db))
    if not found:
        raise HTTPException(status_code=404, detail="No lyrics found")
    return LyricsOut(**found)
