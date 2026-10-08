"""AI mood tagging endpoints — bulk upload from the training script."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session as DbSession

from ..deps import get_current_user, get_db
from ..models import Track, User

router = APIRouter(prefix="/api/ai", tags=["ai-tags"])

VALID_MOODS = {"romantic", "devotional", "energetic", "sad", "happy", "chill", ""}


class MoodTagsIn(BaseModel):
    moods: dict[str, str]  # {"track_id": "mood"}


@router.put("/mood-tags")
def bulk_set_moods(
    payload: MoodTagsIn,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Bulk-set mood tags on tracks. Called by the training script after classification."""
    updated = 0
    skipped = 0
    for track_id_str, mood in payload.moods.items():
        mood = mood.lower().strip()
        if mood not in VALID_MOODS:
            skipped += 1
            continue
        try:
            tid = int(track_id_str)
        except ValueError:
            skipped += 1
            continue
        db.query(Track).filter(Track.id == tid).update({"mood": mood})
        updated += 1
    db.commit()
    return {"updated": updated, "skipped": skipped, "total": len(payload.moods)}


@router.get("/mood-tags/stats")
def mood_stats(
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Distribution of mood tags across the library."""
    from sqlalchemy import func
    rows = (
        db.query(Track.mood, func.count(Track.id))
        .group_by(Track.mood)
        .order_by(func.count(Track.id).desc())
        .all()
    )
    return {"moods": [{"mood": m or "untagged", "count": c} for m, c in rows]}
