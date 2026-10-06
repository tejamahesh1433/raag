"""Vector embeddings: indexing, cosine similarity, semantic queries.

Vectors are packed float32 blobs in SQLite — simple, dependency-free, and
plenty fast for a household library (upgrade path: sqlite-vec, see spec M5).
"""
from __future__ import annotations

import json
import struct
from typing import Iterable

from sqlalchemy.orm import Session as DbSession

from ..ai import gateway
from ..ai.gateway import ProviderUnavailable
from ..models import Job, Setting, Track, TrackEmbedding, utcnow


def track_embedding_text(track: Track) -> str:
    parts = [track.title, track.artist_name, track.album_title]
    if track.genre:
        parts.append(track.genre)
    if track.year:
        parts.append(str(track.year))
    return " — ".join(p for p in parts if p)


def pack(vector: list[float]) -> bytes:
    return struct.pack(f"<{len(vector)}f", *vector)


def unpack(blob: bytes) -> tuple[float, ...]:
    return struct.unpack(f"<{len(blob) // 4}f", blob)


def cosine(a: Iterable[float], b: Iterable[float]) -> float:
    dot = na = nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na**0.5 * nb**0.5)


def upsert_embedding(
    db: DbSession, track_id: int, model: str, vector: list[float]
) -> None:
    row = db.get(TrackEmbedding, track_id)
    if row is None:
        row = TrackEmbedding(track_id=track_id)
        db.add(row)
    row.model = model
    row.dim = len(vector)
    row.vector = pack(vector)
    row.updated_at = utcnow()


def embedding_status(db: DbSession, model: str) -> dict:
    total = db.query(Track).count()
    indexed = (
        db.query(TrackEmbedding).filter(TrackEmbedding.model == model).count()
    )
    return {
        "indexed": indexed,
        "total": total,
        "model": model,
        "ready": total > 0 and indexed >= total,
    }


def _load_all(db: DbSession, model: str) -> list[tuple[int, tuple[float, ...]]]:
    rows = db.query(TrackEmbedding).filter(TrackEmbedding.model == model).all()
    return [(r.track_id, unpack(r.vector)) for r in rows]


def similar_tracks(
    db: DbSession, model: str, track_id: int, limit: int = 10
) -> list[tuple[int, float]]:
    """Top-N cosine neighbours of a track (excluding itself)."""
    query_row = db.get(TrackEmbedding, track_id)
    if query_row is None:
        return []
    query_vec = unpack(query_row.vector)
    scored = []
    for other_id, vec in _load_all(db, model):
        if other_id == track_id:
            continue
        scored.append((other_id, cosine(query_vec, vec)))
    scored.sort(key=lambda pair: pair[1], reverse=True)
    return scored[:limit]


def semantic_search(
    db: DbSession, model: str, query_vector: list[float], limit: int = 20
) -> list[tuple[int, float]]:
    scored = [
        (tid, cosine(query_vector, vec)) for tid, vec in _load_all(db, model)
    ]
    scored.sort(key=lambda pair: pair[1], reverse=True)
    return scored[:limit]


def _ai_cfg(db: DbSession) -> dict:
    row = db.query(Setting).filter(Setting.key == "ai").first()
    if not row or not row.value:
        return {}
    try:
        return json.loads(row.value)
    except json.JSONDecodeError:
        return {}


def run_embed_index(db: DbSession, job: Job | None = None, batch_size: int = 16) -> dict:
    """Embed every track via the configured local embeddings model."""
    ai_cfg = _ai_cfg(db)
    model = gateway.resolve_model(ai_cfg, "embed")
    tracks = db.query(Track).order_by(Track.id).all()
    total = len(tracks)
    if job:
        job.total = total
        job.progress = 0
        job.message = f"Embedding with {model}"
        job.status = "running"
        db.commit()

    if total == 0:
        if job:
            job.status = "done"
            job.message = "No tracks to embed"
            db.commit()
        return {"indexed": 0, "total": 0, "model": model}

    if not gateway.check_reachable(ai_cfg, timeout=3.0):
        msg = "AI provider unreachable — start Ollama/LM Studio and pull the embed model"
        if job:
            job.status = "error"
            job.message = msg
            db.commit()
        raise ProviderUnavailable(msg)

    indexed = 0
    try:
        for i in range(0, total, batch_size):
            batch = tracks[i : i + batch_size]
            texts = [track_embedding_text(t) for t in batch]
            vectors = gateway.embed(ai_cfg, texts)
            for track, vector in zip(batch, vectors):
                upsert_embedding(db, track.id, model, vector)
                indexed += 1
            db.commit()
            if job:
                job.progress = indexed
                job.message = f"Embedded {indexed}/{total}"
                db.commit()
    except Exception as exc:
        if job:
            job.status = "error"
            job.message = f"Embed failed: {exc}"
            db.commit()
        raise

    if job:
        job.status = "done"
        job.progress = indexed
        job.message = f"Indexed {indexed} tracks with {model}"
        db.commit()
    return {"indexed": indexed, "total": total, "model": model}
