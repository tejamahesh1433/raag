"""Library: scan, browse, search, stream, artwork, favorites, play history."""
import base64
import json
import re
import time
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session as DbSession

# In-process settings cache — avoids repeated DB hits on every stream request.
_SETTINGS_CACHE: dict[str, tuple[str | None, float]] = {}
_SETTINGS_TTL = 60.0  # seconds


def _cached_setting(db: DbSession, key: str) -> str | None:
    entry = _SETTINGS_CACHE.get(key)
    if entry is not None and (time.monotonic() - entry[1]) < _SETTINGS_TTL:
        return entry[0]
    row = db.query(Setting).filter(Setting.key == key).first()
    value = row.value if row else None
    _SETTINGS_CACHE[key] = (value, time.monotonic())
    return value


def invalidate_settings_cache() -> None:
    """Call whenever any Setting row changes (PUT settings, DB reseed)."""
    _SETTINGS_CACHE.clear()

from ..deps import get_current_user, get_db
from ..models import Album, Artist, Favorite, Job, PlayEvent, Setting, Track, User, utcnow
from ..schemas import AlbumOut, ArtistOut, MessageOut, PageOut, SearchOut, TrackOut
from ..services.scan_jobs import queue_library_scan
from ..services.streaming import stream_track_file

router = APIRouter(prefix="/api", tags=["library"])


# Serialization helpers --------------------------------------------------------
def _artwork_map_for_tracks(db: DbSession, tracks: list[Track]) -> dict[int, int | None]:
    album_ids = {t.album_id for t in tracks if t.album_id is not None}
    if not album_ids:
        return {}
    rows = db.query(Album.id, Album.artwork_id).filter(Album.id.in_(album_ids)).all()
    return {r[0]: r[1] for r in rows}


def track_out(
    track: Track,
    favorite_ids: set[int] | None = None,
    artwork_map: dict[int, int | None] | None = None,
    db: DbSession | None = None,
) -> TrackOut:
    art_id = None
    if artwork_map is not None:
        art_id = artwork_map.get(track.album_id) if track.album_id else None
    elif db is not None and track.album_id:
        album_row = db.query(Album.artwork_id).filter(Album.id == track.album_id).first()
        art_id = album_row[0] if album_row else None
    return TrackOut(
        id=track.id,
        title=track.title,
        artist=track.artist_name,
        album=track.album_title,
        album_artist=track.album_artist,
        genre=track.genre,
        year=track.year,
        track_no=track.track_no,
        disc_no=track.disc_no,
        duration=track.duration,
        bitrate=track.bitrate,
        sample_rate=track.sample_rate,
        format=track.format,
        play_count=track.play_count,
        added_at=track.added_at,
        album_id=track.album_id,
        artist_id=track.artist_id,
        artwork_id=art_id,
        is_favorite=track.id in (favorite_ids or set()),
    )


def _tracks_to_out(db: DbSession, tracks: list[Track], favorite_ids: set[int] | None = None) -> list[TrackOut]:
    if not tracks:
        return []
    art_map = _artwork_map_for_tracks(db, tracks)
    return [track_out(t, favorite_ids, art_map) for t in tracks]


def _favorite_ids(db: DbSession, user: User) -> set[int]:
    rows = db.query(Favorite.track_id).filter(Favorite.user_id == user.id).all()
    return {r[0] for r in rows}


def album_out(db: DbSession, album: Album) -> AlbumOut:
    artist = db.query(Artist).filter(Artist.id == album.artist_id).first()
    stats = (
        db.query(func.count(Track.id), func.coalesce(func.sum(Track.duration), 0))
        .filter(Track.album_id == album.id)
        .first()
    )
    return AlbumOut(
        id=album.id,
        title=album.title,
        artist=artist.name if artist else "Unknown Artist",
        artist_id=album.artist_id,
        year=album.year,
        track_count=stats[0] or 0,
        duration=stats[1] or 0,
        artwork_id=album.artwork_id,
    )


def _albums_out_bulk(db: DbSession, albums: list[Album]) -> list[AlbumOut]:
    """Serialize a list of albums with 2 queries total instead of 2 per album."""
    if not albums:
        return []
    artist_ids = {a.artist_id for a in albums if a.artist_id is not None}
    artists_by_id: dict[int, str] = {}
    if artist_ids:
        for row in db.query(Artist.id, Artist.name).filter(Artist.id.in_(artist_ids)).all():
            artists_by_id[row[0]] = row[1]
    album_ids = [a.id for a in albums]
    stats_map: dict[int, tuple[int, int]] = {}
    for aid, tc, dur in (
        db.query(Track.album_id, func.count(Track.id), func.coalesce(func.sum(Track.duration), 0))
        .filter(Track.album_id.in_(album_ids))
        .group_by(Track.album_id)
        .all()
    ):
        stats_map[aid] = (tc, dur)
    result = []
    for a in albums:
        tc, dur = stats_map.get(a.id, (0, 0))
        result.append(AlbumOut(
            id=a.id,
            title=a.title,
            artist=artists_by_id.get(a.artist_id, "Unknown Artist"),
            artist_id=a.artist_id,
            year=a.year,
            track_count=tc,
            duration=dur,
            artwork_id=a.artwork_id,
        ))
    return result


def artist_out(db: DbSession, artist: Artist) -> ArtistOut:
    track_count = db.query(func.count(Track.id)).filter(Track.artist_id == artist.id).scalar() or 0
    album_count = (
        db.query(func.count(func.distinct(Track.album_id)))
        .filter(Track.artist_id == artist.id)
        .scalar()
        or 0
    )
    return ArtistOut(id=artist.id, name=artist.name, track_count=track_count, album_count=album_count)


def _artists_out_bulk(db: DbSession, artists: list[Artist]) -> list[ArtistOut]:
    """Serialize a list of artists with 1 query total instead of 2 per artist."""
    if not artists:
        return []
    artist_ids = [a.id for a in artists]
    stats_map: dict[int, tuple[int, int]] = {}
    for aid, tc, ac in (
        db.query(
            Track.artist_id,
            func.count(Track.id),
            func.count(func.distinct(Track.album_id)),
        )
        .filter(Track.artist_id.in_(artist_ids))
        .group_by(Track.artist_id)
        .all()
    ):
        stats_map[aid] = (tc, ac)
    result = []
    for a in artists:
        tc, ac = stats_map.get(a.id, (0, 0))
        result.append(ArtistOut(id=a.id, name=a.name, track_count=tc, album_count=ac))
    return result


# Scan ----------------------------------------------------------------------
@router.post("/library/scan", status_code=202)
def start_scan(
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    job = queue_library_scan(db)
    if job is None:
        # Distinguish no-roots vs already-running
        setting = db.query(Setting).filter(Setting.key == "library_roots").first()
        roots = json.loads(setting.value) if setting and setting.value else []
        if not roots:
            raise HTTPException(status_code=400, detail="No library roots configured")
        raise HTTPException(status_code=409, detail="A library scan is already running")
    return {"job_id": job.id, "status": job.status}


# Browse ---------------------------------------------------------------------
def _library_roots(db: DbSession) -> list[str]:
    setting = db.query(Setting).filter(Setting.key == "library_roots").first()
    if not setting or not setting.value:
        return []
    try:
        roots = json.loads(setting.value)
    except json.JSONDecodeError:
        return []
    return [str(r) for r in roots] if isinstance(roots, list) else []


def _folder_rel(path: str, roots: list[str]) -> str:
    """Folder path relative to a library root (forward slashes)."""
    resolved = Path(path).resolve()
    for root in roots:
        try:
            rel = resolved.relative_to(Path(root).resolve())
            parent = rel.parent
            return "." if str(parent) in ("", ".") else parent.as_posix()
        except ValueError:
            continue
    return Path(path).parent.as_posix()


@router.get("/library/tracks", response_model=PageOut)
def list_tracks(
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    order: str = Query("title", pattern="^(title|newest|added_desc|plays|artist|album)$"),
    album_id: int | None = None,
    artist_id: int | None = None,
    genre: str | None = None,
    folder: str | None = None,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(Track)
    if album_id is not None:
        query = query.filter(Track.album_id == album_id)
    if artist_id is not None:
        query = query.filter(Track.artist_id == artist_id)
    if genre:
        query = query.filter(Track.genre == genre)
    if folder is not None:
        roots = _library_roots(db)
        folder_norm = folder.strip().replace("\\", "/")
        ids = [
            tid
            for tid, path in query.with_entities(Track.id, Track.path).all()
            if _folder_rel(path, roots) == folder_norm
        ]
        query = db.query(Track).filter(Track.id.in_(ids if ids else [-1]))
    # Mobile clients use order=added_desc; treat it as newest-first.
    if order == "added_desc":
        order = "newest"
    total = query.count()
    order_by = {
        "title": (Track.title.asc(),),
        "newest": (Track.added_at.desc(),),
        "plays": (Track.play_count.desc(),),
        "artist": (Track.artist_name.asc(), Track.album_title.asc(), Track.track_no.asc()),
        "album": (Track.album_title.asc(), Track.track_no.asc()),
    }[order]
    rows = query.order_by(*order_by).offset(offset).limit(limit).all()
    favs = _favorite_ids(db, user)
    return PageOut(
        items=_tracks_to_out(db, rows, favs), total=total, offset=offset, limit=limit
    )


@router.get("/library/folders", response_model=list[dict])
def list_folders(
    db: DbSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    roots = _library_roots(db)
    counts: dict[str, int] = {}
    for (path,) in db.query(Track.path).all():
        key = _folder_rel(path, roots)
        counts[key] = counts.get(key, 0) + 1
    return [
        {"folder": folder, "count": count}
        for folder, count in sorted(counts.items(), key=lambda x: x[0].lower())
    ]


@router.get("/library/artists", response_model=list[ArtistOut])
def list_artists(
    offset: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = db.query(Artist).order_by(Artist.name.asc()).offset(offset).limit(limit).all()
    return _artists_out_bulk(db, rows)


@router.get("/library/artists/{artist_id}", response_model=ArtistOut)
def get_artist(
    artist_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    artist = db.query(Artist).filter(Artist.id == artist_id).first()
    if artist is None:
        raise HTTPException(status_code=404, detail="Artist not found")
    return artist_out(db, artist)


@router.get("/library/albums", response_model=list[AlbumOut])
def list_albums(
    offset: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=500),
    artist_id: int | None = None,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(Album)
    if artist_id is not None:
        query = query.filter(Album.artist_id == artist_id)
    rows = query.order_by(Album.title.asc()).offset(offset).limit(limit).all()
    return _albums_out_bulk(db, rows)


@router.get("/library/albums/{album_id}", response_model=AlbumOut)
def get_album(
    album_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    album = db.query(Album).filter(Album.id == album_id).first()
    if album is None:
        raise HTTPException(status_code=404, detail="Album not found")
    return album_out(db, album)


@router.get("/library/albums/{album_id}/tracks", response_model=list[TrackOut])
def album_tracks(
    album_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = (
        db.query(Track)
        .filter(Track.album_id == album_id)
        .order_by(
            Track.disc_no.asc().nulls_last(),
            Track.track_no.asc().nulls_last(),
            Track.title.asc(),
        )
        .all()
    )
    favs = _favorite_ids(db, user)
    return _tracks_to_out(db, rows, favs)


@router.get("/library/genres", response_model=list[dict])
def list_genres(
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = (
        db.query(Track.genre, func.count(Track.id))
        .filter(Track.genre != "")
        .group_by(Track.genre)
        .order_by(Track.genre.asc())
        .all()
    )
    return [{"genre": g, "count": c} for g, c in rows]


# Search ---------------------------------------------------------------------
def _sanitize_fts(query: str) -> str:
    tokens = re.findall(r"[\w']+", query, flags=re.UNICODE)
    if not tokens:
        return ""
    return " AND ".join(f'"{t}"' for t in tokens)


@router.get("/library/search", response_model=SearchOut)
def search(
    q: str = Query(min_length=1, max_length=200),
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    favs = _favorite_ids(db, user)
    match = _sanitize_fts(q)

    tracks: list[Track] = []
    if match:
        try:
            tracks = (
                db.query(Track)
                .join(text("tracks_fts ON tracks_fts.rowid = tracks.id"))
                .where(text("tracks_fts MATCH :match"))
                .params(match=match)
                .order_by(text("rank"))
                .limit(50)
                .all()
            )
        except Exception:
            tracks = []
    if not tracks:
        like = f"%{q}%"
        tracks = (
            db.query(Track)
            .filter(
                or_(
                    Track.title.ilike(like),
                    Track.artist_name.ilike(like),
                    Track.album_title.ilike(like),
                    Track.genre.ilike(like),
                )
            )
            .order_by(Track.title.asc())
            .limit(50)
            .all()
        )

    like = f"%{q}%"
    artists = (
        db.query(Artist).filter(Artist.name.ilike(like)).order_by(Artist.name.asc()).limit(20).all()
    )
    albums = (
        db.query(Album).filter(Album.title.ilike(like)).order_by(Album.title.asc()).limit(20).all()
    )
    return SearchOut(
        tracks=_tracks_to_out(db, tracks, favs),
        artists=_artists_out_bulk(db, artists),
        albums=_albums_out_bulk(db, albums),
    )


# Streaming / artwork ---------------------------------------------------------
@router.get("/tracks/{track_id}")
def get_track(
    track_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    track = db.query(Track).filter(Track.id == track_id).first()
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found")
    return track_out(track, _favorite_ids(db, user), db=db)


@router.get("/tracks/{track_id}/stream")
def stream_track(
    track_id: int,
    request: Request,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
    quality: str = Query("original"),
):
    track = db.query(Track).filter(Track.id == track_id).first()
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found")
    # Defense: only serve paths that live under a configured library root.
    if not _is_under_roots(track.path, db):
        raise HTTPException(status_code=403, detail="Track path outside configured roots")
    transcode_val = _cached_setting(db, "transcode_enabled")
    transcode = False
    try:
        transcode = bool(json.loads(transcode_val)) if transcode_val else False
    except (json.JSONDecodeError, TypeError):
        pass
    return stream_track_file(
        Path(track.path),
        request.headers.get("range"),
        transcode=transcode,
        quality=quality,
    )


def _is_under_roots(path: str, db: DbSession) -> bool:
    roots_val = _cached_setting(db, "library_roots")
    roots = json.loads(roots_val) if roots_val else []
    if not roots:
        return False
    resolved = Path(path).resolve()
    for root in roots:
        try:
            resolved.relative_to(Path(root).resolve())
            return True
        except ValueError:
            continue
    return False


@router.get("/artwork/{artwork_id}")
def get_artwork(
    artwork_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from ..models import Artwork

    art = db.query(Artwork).filter(Artwork.id == artwork_id).first()
    if art is None:
        raise HTTPException(status_code=404, detail="Artwork not found")
    data = base64.b64decode(art.data)
    from fastapi.responses import Response as RawResponse

    return RawResponse(
        content=data,
        media_type=art.mime,
        headers={"Cache-Control": "public, max-age=86400"},
    )


# Favorites / play history ----------------------------------------------------
@router.post("/tracks/{track_id}/favorite", response_model=TrackOut)
def add_favorite(
    track_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    track = db.query(Track).filter(Track.id == track_id).first()
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found")
    exists = (
        db.query(Favorite)
        .filter(Favorite.user_id == user.id, Favorite.track_id == track_id)
        .first()
    )
    if exists is None:
        db.add(Favorite(user_id=user.id, track_id=track_id))
        db.commit()
    return track_out(track, _favorite_ids(db, user), db=db)


@router.delete("/tracks/{track_id}/favorite", response_model=TrackOut)
def remove_favorite(
    track_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    track = db.query(Track).filter(Track.id == track_id).first()
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found")
    db.query(Favorite).filter(
        Favorite.user_id == user.id, Favorite.track_id == track_id
    ).delete()
    db.commit()
    return track_out(track, _favorite_ids(db, user), db=db)


@router.get("/me/favorites", response_model=list[TrackOut])
def list_favorites(
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = (
        db.query(Track)
        .join(Favorite, Favorite.track_id == Track.id)
        .filter(Favorite.user_id == user.id)
        .order_by(Favorite.created_at.desc())
        .all()
    )
    favs = _favorite_ids(db, user)
    return _tracks_to_out(db, rows, favs)


@router.post("/tracks/{track_id}/played", response_model=MessageOut)
def record_play(
    track_id: int,
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    track = db.query(Track).filter(Track.id == track_id).first()
    if track is None:
        raise HTTPException(status_code=404, detail="Track not found")
    track.play_count = (track.play_count or 0) + 1
    db.add(PlayEvent(user_id=user.id, track_id=track_id, played_at=utcnow()))
    db.commit()
    try:
        from ..services.scrobble import scrobble_track
        from ..services.discord_hook import notify_discord

        cfg_val = _cached_setting(db, "scrobble")
        cfg = json.loads(cfg_val) if cfg_val else {}
        scrobble_track(track, cfg if isinstance(cfg, dict) else {})

        discord_val = _cached_setting(db, "discord")
        discord_cfg = json.loads(discord_val) if discord_val else {}
        notify_discord(track, discord_cfg if isinstance(discord_cfg, dict) else {})
    except Exception:
        pass
    return MessageOut(message="played")


@router.get("/me/history", response_model=list[TrackOut])
def play_history(
    limit: int = Query(50, ge=1, le=200),
    db: DbSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = (
        db.query(Track)
        .join(PlayEvent, PlayEvent.track_id == Track.id)
        .filter(PlayEvent.user_id == user.id)
        .order_by(PlayEvent.played_at.desc())
        .limit(limit)
        .distinct()
        .all()
    )
    favs = _favorite_ids(db, user)
    return _tracks_to_out(db, rows, favs)
