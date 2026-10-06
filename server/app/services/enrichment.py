"""Online enrichment: MusicBrainz artist/album cache (toggleable air-gap)."""
from __future__ import annotations

import json
from typing import Any

import httpx
from sqlalchemy.orm import Session as DbSession

from ..models import Album, Artist, EnrichmentCache, Job, Setting, utcnow

_UA = {"User-Agent": "Raag/0.3 (self-hosted music; contact: local)"}
_MB = "https://musicbrainz.org/ws/2"


def _ai_cfg(db: DbSession) -> dict:
    row = db.query(Setting).filter(Setting.key == "ai").first()
    if not row or not row.value:
        return {}
    try:
        return json.loads(row.value)
    except json.JSONDecodeError:
        return {}


def _online_allowed(db: DbSession) -> bool:
    return bool(_ai_cfg(db).get("online_enrichment", True))


def _get_cached(db: DbSession, kind: str, key: str) -> dict | None:
    row = (
        db.query(EnrichmentCache)
        .filter(EnrichmentCache.kind == kind, EnrichmentCache.key == key)
        .first()
    )
    if not row or not row.payload:
        return None
    try:
        return json.loads(row.payload)
    except json.JSONDecodeError:
        return None


def _put_cache(db: DbSession, kind: str, key: str, source: str, payload: dict) -> EnrichmentCache:
    row = (
        db.query(EnrichmentCache)
        .filter(EnrichmentCache.kind == kind, EnrichmentCache.key == key)
        .first()
    )
    if row is None:
        row = EnrichmentCache(kind=kind, key=key)
        db.add(row)
    row.source = source
    row.payload = json.dumps(payload, ensure_ascii=False)
    row.updated_at = utcnow()
    db.commit()
    db.refresh(row)
    return row


def _mb_get(path: str, params: dict[str, Any]) -> dict | None:
    params = {**params, "fmt": "json"}
    try:
        with httpx.Client(timeout=12.0, headers=_UA) as client:
            resp = client.get(f"{_MB}/{path}", params=params)
            if resp.status_code != 200:
                return None
            return resp.json()
    except (httpx.HTTPError, ValueError):
        return None


def fetch_artist_info(db: DbSession, artist: Artist, force: bool = False) -> dict | None:
    key = artist.name.strip().lower()
    if not force:
        cached = _get_cached(db, "artist", key)
        if cached:
            return cached
    if not _online_allowed(db):
        return _get_cached(db, "artist", key)

    data = _mb_get("artist", {"query": f'artist:"{artist.name}"', "limit": 1})
    if not data:
        return None
    artists = data.get("artists") or []
    if not artists:
        return None
    hit = artists[0]
    payload = {
        "name": hit.get("name") or artist.name,
        "mbid": hit.get("id"),
        "type": hit.get("type"),
        "country": hit.get("country"),
        "disambiguation": hit.get("disambiguation") or "",
        "tags": [t.get("name") for t in (hit.get("tags") or [])[:8] if t.get("name")],
        "score": hit.get("score"),
    }
    _put_cache(db, "artist", key, "musicbrainz", payload)
    return payload


def fetch_album_info(db: DbSession, album: Album, artist_name: str, force: bool = False) -> dict | None:
    key = f"{artist_name.strip().lower()}::{album.title.strip().lower()}"
    if not force:
        cached = _get_cached(db, "album", key)
        if cached:
            return cached
    if not _online_allowed(db):
        return _get_cached(db, "album", key)

    query = f'release:"{album.title}" AND artist:"{artist_name}"'
    data = _mb_get("release", {"query": query, "limit": 1})
    if not data:
        return None
    releases = data.get("releases") or []
    if not releases:
        return None
    hit = releases[0]
    date = hit.get("date") or ""
    year = None
    if len(date) >= 4 and date[:4].isdigit():
        year = int(date[:4])
    payload = {
        "title": hit.get("title") or album.title,
        "mbid": hit.get("id"),
        "date": date,
        "year": year,
        "country": hit.get("country"),
        "status": hit.get("status"),
        "artist": artist_name,
    }
    _put_cache(db, "album", key, "musicbrainz", payload)
    return payload


def run_enrichment(db: DbSession, job: Job | None = None, limit: int = 40) -> dict:
    """Background: enrich a batch of artists then albums (rate-friendly)."""
    if not _online_allowed(db):
        if job:
            job.status = "error"
            job.message = "Online enrichment disabled in Settings"
            db.commit()
        return {"artists": 0, "albums": 0, "skipped": True}

    artists = db.query(Artist).order_by(Artist.name).limit(limit).all()
    albums = db.query(Album).order_by(Album.title).limit(limit).all()
    total = len(artists) + len(albums)
    if job:
        job.kind = "enrich"
        job.total = total
        job.progress = 0
        job.status = "running"
        job.message = "Enriching from MusicBrainz"
        db.commit()

    a_ok = 0
    for i, artist in enumerate(artists):
        if fetch_artist_info(db, artist):
            a_ok += 1
        if job:
            job.progress = i + 1
            job.message = f"Artists {i + 1}/{len(artists)}"
            db.commit()

    b_ok = 0
    for j, album in enumerate(albums):
        artist = db.get(Artist, album.artist_id)
        name = artist.name if artist else ""
        if fetch_album_info(db, album, name):
            b_ok += 1
        if job:
            job.progress = len(artists) + j + 1
            job.message = f"Albums {j + 1}/{len(albums)}"
            db.commit()

    if job:
        job.status = "done"
        job.message = f"Enriched {a_ok} artists, {b_ok} albums"
        db.commit()
    return {"artists": a_ok, "albums": b_ok, "skipped": False}
