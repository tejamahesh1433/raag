"""Lyrics resolution: local sidecar files first, then free LRCLIB (optional).

Sidecar lookup is always allowed (local files). The online LRCLIB fetch only
happens when the `online_enrichment` setting is enabled — air-gapped mode
performs zero outbound calls (spec story #51).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

import httpx

from ..models import Track, TrackLyrics, utcnow

_LRC_LINE = re.compile(r"\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]\s?(.*)")


def parse_lrc(text: str) -> list[dict]:
    """Parse LRC text into [{"t": seconds, "text": line}, ...]."""
    out = []
    for raw in text.splitlines():
        match = _LRC_LINE.match(raw.strip())
        if not match:
            continue
        minutes, seconds, frac, content = match.groups()
        frac_val = int((frac or "0").ljust(3, "0")[:3]) / 1000.0
        t = int(minutes) * 60 + int(seconds) + frac_val
        if content.strip():
            out.append({"t": round(t, 3), "text": content.strip()})
    out.sort(key=lambda row: row["t"])
    return out


def _read_sidecar(track: Track) -> tuple[str, str, str] | None:
    """Return (plain, synced_json, source) from a neighboring .lrc/.txt file."""
    base = Path(track.path)
    for suffix, is_lrc in ((".lrc", True), (".txt", False)):
        candidate = base.with_suffix(suffix)
        try:
            if not candidate.is_file() or candidate.stat().st_size >= 512_000:
                continue
            content = candidate.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        if not content.strip():
            continue
        if is_lrc:
            synced = parse_lrc(content)
            plain = "\n".join(row["text"] for row in synced)
            return plain, json.dumps(synced, ensure_ascii=False), "sidecar"
        return content, "", "sidecar"
    return None


def _fetch_lrclib(track: Track, timeout: float = 8.0) -> tuple[str, str, str] | None:
    """Query lrclib.net (free, no key). Returns None on any miss/error."""
    params = {
        "track_name": track.title,
        "artist_name": track.artist_name,
        "album_name": track.album_title,
        "duration": str(int(track.duration or 0)),
    }
    try:
        with httpx.Client(timeout=timeout, headers={"User-Agent": "Raag/0.3 (self-hosted music)"}) as client:
            resp = client.get("https://lrclib.net/api/get", params=params)
            if resp.status_code == 404:
                resp = client.get(
                    "https://lrclib.net/api/search",
                    params={"track_name": track.title, "artist_name": track.artist_name},
                )
                if resp.status_code != 200:
                    return None
                results = resp.json()
                if not results:
                    return None
                data = results[0]
            elif resp.status_code == 200:
                data = resp.json()
            else:
                return None
    except (httpx.HTTPError, ValueError):
        return None

    plain = data.get("plainLyrics") or ""
    synced_text = data.get("syncedLyrics") or ""
    synced_json = ""
    if synced_text:
        synced = parse_lrc(synced_text)
        synced_json = json.dumps(synced, ensure_ascii=False)
        if not plain:
            plain = "\n".join(row["text"] for row in synced)
    if not plain and not synced_json:
        return None
    return plain, synced_json, "lrclib"


def resolve_lyrics(db, track: Track, ai_cfg: dict) -> dict | None:
    """Sidecar -> cached -> optional LRCLIB. Saves what it finds."""
    row = db.get(TrackLyrics, track.id)

    found = _read_sidecar(track)
    if found:
        plain, synced_json, source = found
    elif row and (row.plain or row.synced):
        return {
            "plain": row.plain or "",
            "synced": json.loads(row.synced) if row.synced else [],
            "source": row.source,
        }
    elif ai_cfg.get("online_enrichment", True):
        fetched = _fetch_lrclib(track)
        if not fetched:
            return None
        plain, synced_json, source = fetched
    else:
        return None  # air-gapped: no sidecar, no cache, online disabled

    if row is None:
        row = TrackLyrics(track_id=track.id)
        db.add(row)
    row.plain = plain
    row.synced = synced_json
    row.source = source
    row.updated_at = utcnow()
    db.commit()
    return {
        "plain": plain,
        "synced": json.loads(synced_json) if synced_json else [],
        "source": source,
    }
