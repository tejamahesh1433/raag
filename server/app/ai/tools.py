"""AI tool definitions + executors — the model's bridge to the real library.

Every executor runs through authenticated service-layer queries with validated
arguments. Tools can only *read* the library or create content for the calling
user; playback itself is applied client-side via emitted `action` events.
"""
from __future__ import annotations

import json

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session as DbSession

from ..models import Album, Artist, Playlist, PlaylistTrack, Track, User

MAX_SEARCH_RESULTS = 25

# OpenAI tool schemas ---------------------------------------------------------
TOOLS_SPEC: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "search_library",
            "description": (
                "Search the user's music library by title, artist, album or genre. "
                "Returns matching tracks with ids. Always use this before acting on "
                "tracks so ids are real — never invent tracks."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Free-text search"},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 50},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "library_overview",
            "description": "Counts, top genres and most-played artists — grounding about the library.",
            "parameters": {"type": "object", "properties": {}},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "play_tracks",
            "description": (
                "Play tracks now or queue them. Requires real track ids (from "
                "search_library). mode 'replace' plays immediately, 'queue' appends."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "track_ids": {"type": "array", "items": {"type": "integer"}},
                    "mode": {"type": "string", "enum": ["replace", "queue"]},
                },
                "required": ["track_ids"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_playlist",
            "description": "Create a playlist in the user's library from track ids.",
            "parameters": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "track_ids": {"type": "array", "items": {"type": "integer"}},
                },
                "required": ["name", "track_ids"],
            },
        },
    },
]


def _track_summary(t: Track) -> dict:
    return {
        "id": t.id,
        "title": t.title,
        "artist": t.artist_name,
        "album": t.album_title,
        "duration": t.duration,
        "year": t.year,
        "genre": t.genre,
        "play_count": t.play_count,
    }


def _action_track(t: Track) -> dict:
    """Full TrackOut-compatible shape so the client can queue it directly."""
    return {
        "id": t.id,
        "title": t.title,
        "artist": t.artist_name,
        "album": t.album_title,
        "album_artist": t.album_artist,
        "genre": t.genre,
        "year": t.year,
        "track_no": t.track_no,
        "disc_no": t.disc_no,
        "duration": t.duration,
        "bitrate": t.bitrate,
        "sample_rate": t.sample_rate,
        "format": t.format,
        "play_count": t.play_count,
        "added_at": t.added_at.isoformat() if t.added_at else None,
        "album_id": t.album_id,
        "artist_id": t.artist_id,
        "is_favorite": False,
    }


def _load_tracks(db: DbSession, track_ids: list) -> list[Track]:
    ids = [int(i) for i in track_ids][:200]
    if not ids:
        raise HTTPException(status_code=400, detail="track_ids must not be empty")
    rows = db.query(Track).filter(Track.id.in_(ids)).all()
    by_id = {t.id: t for t in rows}
    missing = [i for i in ids if i not in by_id]
    if missing:
        raise HTTPException(status_code=404, detail=f"Unknown track ids: {missing[:10]}")
    return [by_id[i] for i in ids]


def execute_tool(
    name: str, args: dict, db: DbSession, user: User
) -> tuple[dict, dict | None]:
    """Run one tool call. Returns (result_for_model, action_or_None).

    `action` is forwarded to the client as an SSE `action` event so the
    frontend can apply playback/playlist changes (playback lives client-side).
    """
    if name == "search_library":
        query = str(args.get("query") or "").strip()
        if not query:
            raise HTTPException(status_code=400, detail="query is required")
        limit = min(int(args.get("limit") or 15), MAX_SEARCH_RESULTS)
        like = f"%{query}%"
        rows = (
            db.query(Track)
            .filter(
                (Track.title.ilike(like))
                | (Track.artist_name.ilike(like))
                | (Track.album_title.ilike(like))
                | (Track.genre.ilike(like))
            )
            .order_by(Track.play_count.desc(), Track.title.asc())
            .limit(limit)
            .all()
        )
        return {"tracks": [_track_summary(t) for t in rows], "count": len(rows)}, None

    if name == "library_overview":
        total = db.query(func.count(Track.id)).scalar() or 0
        artists = db.query(func.count(Artist.id)).scalar() or 0
        albums = db.query(func.count(Album.id)).scalar() or 0
        genres = (
            db.query(Track.genre, func.count(Track.id))
            .filter(Track.genre != "")
            .group_by(Track.genre)
            .order_by(func.count(Track.id).desc())
            .limit(10)
            .all()
        )
        top_artists = (
            db.query(Track.artist_name, func.count(Track.id), func.sum(Track.play_count))
            .group_by(Track.artist_name)
            .order_by(func.sum(Track.play_count).desc(), func.count(Track.id).desc())
            .limit(8)
            .all()
        )
        return {
            "tracks": total,
            "artists": artists,
            "albums": albums,
            "top_genres": [{"genre": g, "count": c} for g, c in genres],
            "top_artists": [
                {"artist": a, "tracks": c, "plays": int(p or 0)} for a, c, p in top_artists
            ],
        }, None

    if name == "play_tracks":
        tracks = _load_tracks(db, args.get("track_ids") or [])
        mode = str(args.get("mode") or "replace")
        payload_tracks = [_action_track(t) for t in tracks]
        action = {
            "type": "play",
            "mode": mode if mode in ("replace", "queue") else "replace",
            "tracks": payload_tracks,
        }
        return {
            "playing": len(payload_tracks),
            "tracks": payload_tracks,
            "note": "Client applies playback now.",
        }, action

    if name == "create_playlist":
        pl_name = str(args.get("name") or "").strip()[:256]
        if not pl_name:
            raise HTTPException(status_code=400, detail="Playlist name is required")
        tracks = _load_tracks(db, args.get("track_ids") or [])
        playlist = Playlist(
            name=pl_name,
            description=str(args.get("description") or "")[:1000],
            kind="manual",
            owner_id=user.id,
        )
        db.add(playlist)
        db.flush()
        for pos, t in enumerate(tracks):
            db.add(PlaylistTrack(playlist_id=playlist.id, track_id=t.id, position=pos))
        db.commit()
        return {
            "playlist_id": playlist.id,
            "name": playlist.name,
            "track_count": len(tracks),
        }, {
            "type": "playlist_created",
            "playlist_id": playlist.id,
            "name": playlist.name,
            "track_count": len(tracks),
        }

    raise HTTPException(status_code=400, detail=f"Unknown tool: {name}")


def tool_event(name: str, args: dict, result: dict) -> dict:
    """Compact, UI-friendly summary of a tool call for the SSE `tool` event."""
    summary = json.dumps(result, ensure_ascii=False)
    if len(summary) > 400:
        count = result.get("count", result.get("playing", result.get("track_count")))
        summary = f"{count} result(s)" if count is not None else summary[:400] + "…"
    return {"name": name, "args": args, "summary": summary}

