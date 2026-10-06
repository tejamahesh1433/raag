"""Duplicate detection using the same content fingerprint as the scanner."""
from __future__ import annotations

from collections import defaultdict

from sqlalchemy.orm import Session as DbSession

from ..models import Track
from .scanner import _fingerprint_for_track


def find_duplicate_groups(db: DbSession, limit_groups: int = 50) -> list[dict]:
    """Groups of tracks that share a content fingerprint (or title+artist+duration)."""
    tracks = db.query(Track).all()
    by_fp: dict[str, list[Track]] = defaultdict(list)
    for track in tracks:
        try:
            fp = _fingerprint_for_track(track)
        except Exception:
            fp = f"meta:{track.title.lower()}|{track.artist_name.lower()}|{track.duration}"
        by_fp[fp].append(track)

    groups = []
    for fp, members in by_fp.items():
        if len(members) < 2:
            continue
        groups.append(
            {
                "fingerprint": fp,
                "count": len(members),
                "tracks": [
                    {
                        "id": t.id,
                        "title": t.title,
                        "artist": t.artist_name,
                        "album": t.album_title,
                        "path": t.path,
                        "duration": t.duration,
                    }
                    for t in sorted(members, key=lambda x: x.path)
                ],
            }
        )
        if len(groups) >= limit_groups:
            break
    groups.sort(key=lambda g: g["count"], reverse=True)
    return groups
