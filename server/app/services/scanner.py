"""Filesystem library scanner with incremental updates, dedupe, and job progress."""
import hashlib
import logging
from pathlib import Path

from ..models import Album, Artist, Artwork, Job, Track, utcnow
from .tags import SUPPORTED_EXTENSIONS, read_track_meta

log = logging.getLogger(__name__)


def normalize_library_roots(roots: list[str]) -> list[str]:
    """Resolve, uniquify, and drop roots nested under another configured root."""
    resolved: list[Path] = []
    seen: set[str] = set()
    for raw in roots:
        text = (raw or "").strip()
        if not text:
            continue
        try:
            path = Path(text).expanduser().resolve()
        except OSError:
            continue
        key = str(path).casefold()
        if key in seen:
            continue
        seen.add(key)
        resolved.append(path)

    kept: list[str] = []
    for path in resolved:
        under_another = False
        for other in resolved:
            if path == other:
                continue
            try:
                path.relative_to(other)
                under_another = True
                break
            except ValueError:
                pass
        if not under_another:
            kept.append(str(path))
    return kept


def content_fingerprint(
    title: str,
    artist: str,
    album: str,
    size: int,
    duration: int,
) -> str:
    """Stable identity for the same song copied into multiple folders."""
    raw = "|".join(
        [
            (title or "").casefold().strip(),
            (artist or "").casefold().strip(),
            (album or "").casefold().strip(),
            str(int(size or 0)),
            str(int(duration or 0)),
        ]
    )
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()


def _path_score(path: Path) -> tuple[int, int, str]:
    """Prefer deeper artist/album layouts; on ties prefer the longer (more specific) path."""
    text = str(path)
    return (len(path.parts), len(text), text.casefold())


def _under_any_root(path_str: str, roots: list[str]) -> bool:
    try:
        path = Path(path_str).resolve()
    except OSError:
        return False
    for root in roots:
        try:
            path.relative_to(Path(root).resolve())
            return True
        except ValueError:
            continue
    return False


def _iter_audio_files(roots: list[str]):
    for root in roots:
        root_path = Path(root)
        if not root_path.is_dir():
            continue
        for path in root_path.rglob("*"):
            if any(part.startswith(".") for part in path.parts):
                continue
            if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS:
                yield path


def _get_or_create_artist(db, name: str) -> Artist:
    artist = db.query(Artist).filter(Artist.name == name).first()
    if artist is None:
        artist = Artist(name=name)
        db.add(artist)
        db.flush()
    return artist


def _get_or_create_album(db, title: str, artist_id: int, year: int | None) -> Album:
    album = (
        db.query(Album)
        .filter(Album.title == title, Album.artist_id == artist_id)
        .first()
    )
    if album is None:
        album = Album(title=title, artist_id=artist_id, year=year)
        db.add(album)
        db.flush()
    elif year and not album.year:
        album.year = year
    return album


def _store_artwork(db, data: bytes, mime: str) -> Artwork | None:
    sha1 = hashlib.sha1(data).hexdigest()
    art = db.query(Artwork).filter(Artwork.sha1 == sha1).first()
    if art is None:
        import base64

        art = Artwork(sha1=sha1, mime=mime, data=base64.b64encode(data).decode("ascii"))
        db.add(art)
        db.flush()
    return art


def _fingerprint_for_track(track: Track) -> str:
    return content_fingerprint(
        track.title,
        track.artist_name,
        track.album_title,
        track.size,
        track.duration,
    )


def run_scan(db, roots: list[str], job: Job | None = None) -> dict:
    """Scan roots, upsert tracks, skip content duplicates, remove missing ones."""

    def _progress(done: int, total: int, message: str = ""):
        if job is not None:
            job.progress = done
            job.total = total
            job.message = message
            job.updated_at = utcnow()

    roots = normalize_library_roots(roots)
    # Preferred (more nested) paths first so flat copies of the same song lose.
    files = sorted(_iter_audio_files(roots), key=_path_score, reverse=True)
    seen_paths: set[str] = set()
    seen_fps: set[str] = set()
    added = updated = unchanged = skipped_dup = 0

    for index, path in enumerate(files):
        path_str = str(path.resolve())
        try:
            stat = path.stat()
        except OSError:
            continue

        existing = db.query(Track).filter(Track.path == path_str).first()
        file_unchanged = (
            existing is not None
            and existing.size == stat.st_size
            and existing.mtime == int(stat.st_mtime)
        )

        needs_artwork = False
        if file_unchanged and existing is not None and existing.album_id is not None:
            album_row = db.query(Album).filter(Album.id == existing.album_id).first()
            needs_artwork = album_row is not None and album_row.artwork_id is None

        if file_unchanged and not needs_artwork and existing is not None:
            fp = _fingerprint_for_track(existing)
            if fp in seen_fps:
                db.delete(existing)
                skipped_dup += 1
                _progress(index + 1, len(files), f"Duplicate skipped: {path.name}")
                if (index + 1) % 25 == 0:
                    db.commit()
                continue
            seen_fps.add(fp)
            seen_paths.add(path_str)
            unchanged += 1
            _progress(index + 1, len(files), f"Unchanged: {path.name}")
            if (index + 1) % 25 == 0:
                db.commit()
            continue

        meta = read_track_meta(path)
        fp = content_fingerprint(
            meta.title, meta.artist, meta.album, stat.st_size, meta.duration
        )
        if fp in seen_fps:
            if existing is not None:
                db.delete(existing)
            skipped_dup += 1
            _progress(index + 1, len(files), f"Duplicate skipped: {path.name}")
            if (index + 1) % 25 == 0:
                db.commit()
            continue

        artist = _get_or_create_artist(db, meta.artist)
        album_artist = _get_or_create_artist(db, meta.album_artist)
        album = _get_or_create_album(db, meta.album, album_artist.id, meta.year)

        if meta.artwork_data and album.artwork_id is None:
            artwork_row = _store_artwork(db, meta.artwork_data, meta.artwork_mime)
            if artwork_row is not None:
                album.artwork_id = artwork_row.id

        if needs_artwork and file_unchanged and existing is not None:
            seen_fps.add(fp)
            seen_paths.add(path_str)
            unchanged += 1
            _progress(index + 1, len(files), f"Artwork: {path.name}")
            if (index + 1) % 25 == 0:
                db.commit()
            continue

        if existing:
            track = existing
            updated += 1
        else:
            track = Track(path=path_str)
            db.add(track)
            added += 1

        track.size = stat.st_size
        track.mtime = int(stat.st_mtime)
        track.title = meta.title
        track.artist_name = meta.artist
        track.album_title = meta.album
        track.album_artist = meta.album_artist
        track.genre = meta.genre
        track.year = meta.year
        track.track_no = meta.track_no
        track.disc_no = meta.disc_no
        track.duration = meta.duration
        track.bitrate = meta.bitrate
        track.sample_rate = meta.sample_rate
        track.format = meta.format
        track.artist_id = artist.id
        track.album_id = album.id
        track.added_at = track.added_at or utcnow()

        seen_fps.add(fp)
        seen_paths.add(path_str)
        _progress(index + 1, len(files), f"Indexed: {track.title}")
        if (index + 1) % 25 == 0:
            db.commit()

    # Drop anything not kept under the configured roots, plus orphans outside roots.
    removed = 0
    for track in list(db.query(Track).all()):
        keep = track.path in seen_paths and _under_any_root(track.path, roots)
        if not keep:
            db.delete(track)
            removed += 1
    db.flush()

    # Collapse leftover content duplicates (legacy rows / race leftovers).
    by_fp: dict[str, list[Track]] = {}
    for track in db.query(Track).all():
        by_fp.setdefault(_fingerprint_for_track(track), []).append(track)
    for group in by_fp.values():
        if len(group) < 2:
            continue
        group.sort(key=lambda t: _path_score(Path(t.path)), reverse=True)
        for extra in group[1:]:
            db.delete(extra)
            skipped_dup += 1
            removed += 1
    db.flush()
    summary = {
        "scanned": len(files),
        "added": added,
        "updated": updated,
        "unchanged": unchanged,
        "removed": removed,
        "duplicates_skipped": skipped_dup,
    }
    if job is not None:
        job.status = "done"
        job.progress = len(files)
        job.total = len(files)
        job.message = (
            f"Scan complete: {added} added, {updated} updated, "
            f"{unchanged} unchanged, {removed} removed"
            + (f", {skipped_dup} duplicates skipped" if skipped_dup else "")
        )
        job.updated_at = utcnow()
    db.commit()
    log.info("scan summary: %s", summary)
    return summary
