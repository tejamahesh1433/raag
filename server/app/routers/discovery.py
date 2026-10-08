"""Discovery + lyrics API: embeddings index, similar tracks, semantic search, lyrics."""
from __future__ import annotations

import json
import threading
import time

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
from .library import _artwork_map_for_tracks, _favorite_ids, _tracks_to_out, track_out

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


_AI_CFG_CACHE: tuple[dict, float] | None = None
_AI_CFG_TTL = 60.0


def _ai_cfg(db: DbSession) -> dict:
    global _AI_CFG_CACHE
    now = time.monotonic()
    if _AI_CFG_CACHE is not None and (now - _AI_CFG_CACHE[1]) < _AI_CFG_TTL:
        return _AI_CFG_CACHE[0]
    row = db.query(Setting).filter(Setting.key == "ai").first()
    value: dict = {}
    if row and row.value:
        try:
            value = json.loads(row.value)
        except json.JSONDecodeError:
            pass
    _AI_CFG_CACHE = (value, now)
    return value


def invalidate_ai_cfg_cache() -> None:
    """Call whenever the `ai` Setting row changes (PUT settings, DB reseed)."""
    global _AI_CFG_CACHE
    _AI_CFG_CACHE = None


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
    art_map = _artwork_map_for_tracks(db, list(rows.values()))
    out: list[SimilarOut] = []
    for tid, score in scored:
        row = rows.get(tid)
        if row:
            out.append(SimilarOut(track=track_out(row, favs, art_map), score=round(score, 4)))
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
    art_map = _artwork_map_for_tracks(db, list(rows.values()))
    out: list[SimilarOut] = []
    for tid, score in scored:
        row = rows.get(tid)
        if row:
            out.append(SimilarOut(track=track_out(row, favs, art_map), score=round(score, 4)))
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


@router.post("/discovery/radio/{track_id}", response_model=list[TrackOut])
def generate_radio(
    track_id: int,
    limit: int = Query(25, ge=5, le=100),
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Generate an endless radio queue based on a seed track."""
    seed = db.get(Track, track_id)
    if not seed:
        raise HTTPException(status_code=404, detail="Seed track not found")

    favs = _favorite_ids(db, user)
    model = _embed_model(db)
    scored = emb.similar_tracks(db, model, track_id, limit=limit)
    
    similar_ids = [tid for tid, _ in scored if tid != track_id]
    results: list[Track] = []
    
    if similar_ids:
        results = db.query(Track).filter(Track.id.in_(similar_ids)).all()
        
    # Fallback to same artist or genre if not enough vector similarities
    if len(results) < limit:
        needed = limit - len(results)
        existing_ids = {seed.id} | {t.id for t in results}
        q = db.query(Track).filter(~Track.id.in_(existing_ids))
        if seed.artist_name:
            q = q.filter((Track.artist_name == seed.artist_name) | (Track.genre == seed.genre))
        elif seed.genre:
            q = q.filter(Track.genre == seed.genre)
        fallback_tracks = q.limit(needed).all()
        results.extend(fallback_tracks)

    return _tracks_to_out(db, [seed] + results, favs)


class StatsOut(BaseModel):
    total_tracks: int
    total_duration_seconds: float
    top_artists: list[dict]
    top_genres: list[dict]


@router.get("/discovery/stats", response_model=StatsOut)
def listening_stats(
    db: DbSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Get overall library listening & collection analytics."""
    from sqlalchemy import func

    total_tracks = db.query(func.count(Track.id)).scalar() or 0
    total_duration = db.query(func.sum(Track.duration)).scalar() or 0.0

    artist_counts = (
        db.query(Track.artist_name, func.count(Track.id).label("count"))
        .filter(Track.artist_name != "")
        .group_by(Track.artist_name)
        .order_by(func.count(Track.id).desc())
        .limit(10)
        .all()
    )

    genre_counts = (
        db.query(Track.genre, func.count(Track.id).label("count"))
        .filter(Track.genre != "")
        .group_by(Track.genre)
        .order_by(func.count(Track.id).desc())
        .limit(10)
        .all()
    )

    return StatsOut(
        total_tracks=total_tracks,
        total_duration_seconds=round(float(total_duration), 1),
        top_artists=[{"artist": a, "count": c} for a, c in artist_counts],
        top_genres=[{"genre": g, "count": c} for g, c in genre_counts],
    )


