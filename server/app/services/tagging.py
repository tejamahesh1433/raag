"""Heuristic (+ optional LLM) tag cleanup suggestions — never auto-written."""
from __future__ import annotations

import json
import re
from pathlib import Path

from sqlalchemy.orm import Session as DbSession

from ..ai import gateway
from ..ai.gateway import ProviderUnavailable
from ..models import Job, Setting, TagSuggestion, Track, utcnow
from .tags import write_track_tags

_UNKNOWN = {"", "unknown", "unknown artist", "unknown album", "various", "va"}


def _title_case(value: str) -> str:
    small = {"a", "an", "the", "and", "or", "of", "in", "on", "to", "for", "vs", "vs."}
    words = re.split(r"(\s+|-)", value.strip())
    out = []
    for i, w in enumerate(words):
        if not w or w.isspace() or w == "-":
            out.append(w)
            continue
        lower = w.lower()
        if i > 0 and lower in small:
            out.append(lower)
        else:
            out.append(w[:1].upper() + w[1:].lower() if len(w) > 1 else w.upper())
    return "".join(out)


def _clean_spaces(value: str) -> str:
    return re.sub(r"\s+", " ", value.replace("_", " ").strip())


def propose_heuristic(track: Track) -> tuple[dict, str] | None:
    """Return (proposed_fields, rationale) or None if tags look fine."""
    proposed: dict[str, object] = {}
    reasons: list[str] = []

    title = track.title or ""
    artist = track.artist_name or ""
    album = track.album_title or ""
    stem = Path(track.path).stem

    # Filename "Artist - Title"
    if " - " in stem and (
        artist.lower() in _UNKNOWN or title.lower() == stem.lower() or "_" in title
    ):
        left, right = stem.split(" - ", 1)
        left, right = _clean_spaces(left), _clean_spaces(right)
        if left and right:
            if artist.lower() in _UNKNOWN:
                proposed["artist"] = _title_case(left)
                reasons.append("artist from filename")
            if title.lower() in {stem.lower(), stem.replace("_", " ").lower()} or "_" in title:
                proposed["title"] = _title_case(right)
                reasons.append("title from filename")

    cleaned_title = _clean_spaces(title)
    if cleaned_title and cleaned_title != title:
        proposed.setdefault("title", _title_case(cleaned_title))
        reasons.append("normalize title spaces/underscores")
    elif title.isupper() and len(title) > 3:
        proposed["title"] = _title_case(title)
        reasons.append("fix ALL-CAPS title")
    elif title.islower() and len(title) > 3:
        proposed["title"] = _title_case(title)
        reasons.append("fix all-lowercase title")

    cleaned_artist = _clean_spaces(artist)
    if artist.lower() in _UNKNOWN:
        # already handled via filename when possible
        if "artist" not in proposed:
            reasons.append("missing artist")
    elif cleaned_artist != artist:
        proposed["artist"] = _title_case(cleaned_artist)
        reasons.append("normalize artist")
    elif artist.isupper() and len(artist) > 3:
        proposed["artist"] = _title_case(artist)
        reasons.append("fix ALL-CAPS artist")

    cleaned_album = _clean_spaces(album)
    if album.lower() in _UNKNOWN:
        reasons.append("missing album")
    elif cleaned_album != album:
        proposed["album"] = _title_case(cleaned_album)
        reasons.append("normalize album")
    elif album.isupper() and len(album) > 3:
        proposed["album"] = _title_case(album)
        reasons.append("fix ALL-CAPS album")

    if not proposed:
        return None
    return proposed, "; ".join(reasons)


def _ai_cfg(db: DbSession) -> dict:
    row = db.query(Setting).filter(Setting.key == "ai").first()
    if not row or not row.value:
        return {}
    try:
        return json.loads(row.value)
    except json.JSONDecodeError:
        return {}


def _llm_refine(ai_cfg: dict, track: Track, proposed: dict) -> dict | None:
    """Optional LLM polish — returns refined proposed dict or None."""
    prompt = (
        "You fix messy music tags. Reply with ONLY a JSON object of fields to change "
        "(title, artist, album, album_artist, genre, year). Keep original language. "
        f"Current: title={track.title!r} artist={track.artist_name!r} "
        f"album={track.album_title!r} genre={track.genre!r}. "
        f"Heuristic proposal: {json.dumps(proposed)}. "
        "If the heuristic is good, return it unchanged."
    )
    try:
        resp = gateway.chat_once(
            ai_cfg,
            [
                {"role": "system", "content": "You output JSON only."},
                {"role": "user", "content": prompt},
            ],
        )
        content = resp["choices"][0]["message"].get("content") or ""
    except (ProviderUnavailable, KeyError, IndexError, TypeError):
        return None
    match = re.search(r"\{.*\}", content, re.S)
    if not match:
        return None
    try:
        data = json.loads(match.group())
    except json.JSONDecodeError:
        return None
    allowed = {"title", "artist", "album", "album_artist", "genre", "year", "track_no"}
    cleaned = {k: v for k, v in data.items() if k in allowed and v not in (None, "")}
    return cleaned or None


def scan_tag_suggestions(db: DbSession, job: Job | None = None, use_llm: bool = False) -> dict:
    tracks = db.query(Track).order_by(Track.id).all()
    total = len(tracks)
    if job:
        job.kind = "tag"
        job.total = total
        job.progress = 0
        job.status = "running"
        job.message = "Scanning tags"
        db.commit()

    ai_cfg = _ai_cfg(db) if use_llm else {}
    created = 0
    for i, track in enumerate(tracks):
        result = propose_heuristic(track)
        if job and i % 25 == 0:
            job.progress = i
            job.message = f"Scanned {i}/{total}"
            db.commit()
        if not result:
            continue
        proposed, rationale = result
        if use_llm and ai_cfg and gateway.check_reachable(ai_cfg, timeout=2.0):
            refined = _llm_refine(ai_cfg, track, proposed)
            if refined:
                proposed = refined
                rationale = f"{rationale} (LLM refined)"

        # Skip if identical pending suggestion already exists
        existing = (
            db.query(TagSuggestion)
            .filter(
                TagSuggestion.track_id == track.id,
                TagSuggestion.status == "pending",
            )
            .first()
        )
        original = {
            "title": track.title,
            "artist": track.artist_name,
            "album": track.album_title,
            "album_artist": track.album_artist,
            "genre": track.genre,
            "year": track.year,
            "track_no": track.track_no,
        }
        # Only keep fields that actually change
        proposed = {
            k: v
            for k, v in proposed.items()
            if str(v) != str(original.get(k) if original.get(k) is not None else "")
        }
        if not proposed:
            continue
        if existing:
            existing.proposed = json.dumps(proposed)
            existing.original = json.dumps(original)
            existing.rationale = rationale
        else:
            db.add(
                TagSuggestion(
                    track_id=track.id,
                    status="pending",
                    proposed=json.dumps(proposed),
                    original=json.dumps(original),
                    rationale=rationale,
                )
            )
            created += 1
    db.commit()
    if job:
        job.progress = total
        job.status = "done"
        job.message = f"Created/updated suggestions ({created} new)"
        db.commit()
    return {"created": created, "scanned": total}


def apply_suggestion(db: DbSession, suggestion: TagSuggestion) -> Track:
    track = db.get(Track, suggestion.track_id)
    if track is None:
        raise ValueError("Track missing")
    proposed = json.loads(suggestion.proposed or "{}")
    path = Path(track.path)
    if not path.is_file():
        raise FileNotFoundError(track.path)

    write_track_tags(path, proposed)

    if "title" in proposed:
        track.title = str(proposed["title"])
    if "artist" in proposed:
        track.artist_name = str(proposed["artist"])
    if "album" in proposed:
        track.album_title = str(proposed["album"])
    if "album_artist" in proposed:
        track.album_artist = str(proposed["album_artist"])
    if "genre" in proposed:
        track.genre = str(proposed["genre"])
    if "year" in proposed:
        try:
            track.year = int(proposed["year"])
        except (TypeError, ValueError):
            pass
    if "track_no" in proposed:
        try:
            track.track_no = int(proposed["track_no"])
        except (TypeError, ValueError):
            pass

    suggestion.status = "approved"
    suggestion.resolved_at = utcnow()
    db.commit()
    db.refresh(track)
    return track
