"""Audio tag extraction via mutagen (MP3/ID3, FLAC, M4A, OGG, Opus, WAV, AAC)."""
import base64
import re
from dataclasses import dataclass, field
from pathlib import Path

import mutagen
from mutagen.flac import Picture

SUPPORTED_EXTENSIONS = {
    ".mp3",
    ".flac",
    ".m4a",
    ".mp4",
    ".ogg",
    ".oga",
    ".opus",
    ".wav",
    ".aac",
    ".wma",
    ".aiff",
    ".aif",
    ".wv",
}


@dataclass
class TrackMeta:
    title: str = ""
    artist: str = ""
    album: str = ""
    album_artist: str = ""
    genre: str = ""
    year: int | None = None
    track_no: int | None = None
    disc_no: int | None = None
    duration: int = 0
    bitrate: int = 0
    sample_rate: int = 0
    format: str = ""
    artwork_data: bytes | None = field(default=None, repr=False)
    artwork_mime: str = "image/jpeg"


def _first_text(tags, keys: list[str]) -> str:
    """Return the first non-empty text value among candidate keys (ID3/Vorbis/MP4)."""
    if tags is None:
        return ""
    for key in keys:
        try:
            value = tags.get(key)
        except Exception:
            value = None
        if value is None:
            continue
        # mutagen IDs (ID3 frames): .text list; Vorbis/MP4: str or list
        text = getattr(value, "text", value)
        if isinstance(text, (list, tuple)):
            text = text[0] if text else ""
        text = str(text).strip()
        if text:
            return text
    return ""


def _first_int(tags, keys: list[str]) -> int | None:
    raw = _first_text(tags, keys)
    if not raw:
        return None
    # Handle "3/12" style values; take the first integer found.
    match = re.search(r"\d+", raw)
    return int(match.group()) if match else None


def _year(tags) -> int | None:
    raw = _first_text(tags, ["TDRC", "TYER", "TDOR", "DATE", "©day", "originalyear"])
    match = re.search(r"\b(19|20)\d{2}\b", raw)
    return int(match.group()) if match else None


def _artwork_from_tags(tags) -> tuple[bytes | None, str]:
    if tags is None:
        return None, "image/jpeg"
    try:
        # MP3 / general ID3 APIC frames
        apics = tags.getall("APIC") if hasattr(tags, "getall") else []
        if apics:
            pic = apics[0]
            return bytes(pic.data), pic.mime or "image/jpeg"
    except Exception:
        pass
    try:
        # MP4 / M4A embedded covers (covr atom)
        covr = tags.get("covr") if hasattr(tags, "get") else None
        if covr:
            cover = covr[0]
            data = bytes(cover)
            # mutagen.mp4.MP4Cover.FORMAT_PNG == 14; JPEG == 13
            imageformat = getattr(cover, "imageformat", None)
            mime = "image/png" if imageformat == 14 else "image/jpeg"
            if data[:8] == b"\x89PNG\r\n\x1a\n":
                mime = "image/png"
            elif data[:2] == b"\xff\xd8":
                mime = "image/jpeg"
            return data, mime
    except Exception:
        pass
    try:
        # FLAC / Vorbis base64 pictures stored as tags
        pictures = tags.get("metadata_block_picture") if hasattr(tags, "get") else None
        if pictures:
            block = pictures[0] if isinstance(pictures, list) else pictures
            pic = Picture(base64.b64decode(block))
            return bytes(pic.data), pic.mime or "image/jpeg"
    except Exception:
        pass
    return None, "image/jpeg"


def _artwork_from_audio(audio) -> tuple[bytes | None, str]:
    """FLAC pictures live on the File object, not only in tags."""
    try:
        pictures = getattr(audio, "pictures", None) or []
        if pictures:
            pic = pictures[0]
            return bytes(pic.data), getattr(pic, "mime", None) or "image/jpeg"
    except Exception:
        pass
    return None, "image/jpeg"


_SIDECAR_NAMES = (
    "cover.jpg",
    "cover.jpeg",
    "cover.png",
    "folder.jpg",
    "folder.jpeg",
    "folder.png",
    "AlbumArt.jpg",
    "AlbumArt.jpeg",
    "front.jpg",
    "front.jpeg",
    "front.png",
)


def _sidecar_artwork(path: Path) -> tuple[bytes | None, str]:
    """Fall back to common cover files next to the track (Apple Music / freyr style)."""
    parent = path.parent
    for name in _SIDECAR_NAMES:
        candidate = parent / name
        if candidate.is_file():
            try:
                data = candidate.read_bytes()
            except OSError:
                continue
            if not data:
                continue
            mime = "image/png" if candidate.suffix.lower() == ".png" else "image/jpeg"
            return data, mime
    return None, "image/jpeg"


def read_track_meta(path: Path) -> TrackMeta:
    meta = TrackMeta(format=path.suffix.lstrip(".").lower())
    meta.title = path.stem
    try:
        audio = mutagen.File(str(path))
    except Exception:
        return meta
    if audio is None:
        return meta

    tags = audio.tags
    meta.title = _first_text(tags, ["TIT2", "TITLE", "©nam"]) or path.stem
    meta.artist = _first_text(tags, ["TPE1", "ARTIST", "©ART"]) or "Unknown Artist"
    meta.album = _first_text(tags, ["TALB", "ALBUM", "©alb"]) or "Unknown Album"
    meta.album_artist = _first_text(tags, ["TPE2", "ALBUMARTIST", "ALBUM ARTIST", "aART"]) or meta.artist
    meta.genre = _first_text(tags, ["TCON", "GENRE", "©gen", "gnre"])
    meta.year = _year(tags)
    meta.track_no = _first_int(tags, ["TRCK", "TRACKNUMBER", "trkn"])
    meta.disc_no = _first_int(tags, ["TPOS", "DISCNUMBER", "disk"])

    info = getattr(audio, "info", None)
    if info is not None:
        meta.duration = int(getattr(info, "length", 0) or 0)
        meta.bitrate = int(getattr(info, "bitrate", 0) or 0)
        meta.sample_rate = int(getattr(info, "sample_rate", 0) or 0)

    data, mime = _artwork_from_tags(tags)
    if not data:
        data, mime = _artwork_from_audio(audio)
    if not data:
        data, mime = _sidecar_artwork(path)
    meta.artwork_data, meta.artwork_mime = data, mime
    return meta


def write_track_tags(path: Path, updates: dict[str, object]) -> None:
    """Write approved tag fields back to the audio file (never silent).

    Supports common ID3 / Vorbis / MP4 keys. Raises OSError / mutagen errors
    to the caller — organization layer records them.
    """
    audio = mutagen.File(str(path), easy=False)
    if audio is None:
        raise OSError(f"Unsupported or unreadable file: {path}")

    # Prefer EasyID3-style where available for MP3.
    easy = None
    try:
        from mutagen.easyid3 import EasyID3
        from mutagen.id3 import ID3NoHeaderError
        from mutagen.mp3 import MP3

        if isinstance(audio, MP3) or path.suffix.lower() == ".mp3":
            try:
                easy = EasyID3(str(path))
            except ID3NoHeaderError:
                easy = EasyID3()
                easy.save(str(path))
                easy = EasyID3(str(path))
    except Exception:
        easy = None

    mapping_easy = {
        "title": "title",
        "artist": "artist",
        "album": "album",
        "album_artist": "albumartist",
        "genre": "genre",
        "year": "date",
        "track_no": "tracknumber",
    }

    if easy is not None:
        for field, easy_key in mapping_easy.items():
            if field not in updates:
                continue
            value = updates[field]
            if value is None or value == "":
                if easy_key in easy:
                    del easy[easy_key]
            else:
                easy[easy_key] = [str(value)]
        easy.save(str(path))
        return

    # Generic / FLAC / MP4 fallback via mutagen File tags
    if audio.tags is None:
        try:
            audio.add_tags()
        except Exception as exc:
            raise OSError(f"Cannot create tags for {path}: {exc}") from exc

    tags = audio.tags
    suffix = path.suffix.lower()

    def _set_vorbis(key: str, value: object) -> None:
        if value is None or value == "":
            if key in tags:
                del tags[key]
        else:
            tags[key] = [str(value)]

    def _set_mp4(key: str, value: object) -> None:
        if value is None or value == "":
            if key in tags:
                del tags[key]
        else:
            if key == "trkn":
                tags[key] = [(int(value), 0)]
            else:
                tags[key] = [str(value)]

    if suffix in {".flac", ".ogg", ".oga", ".opus"}:
        key_map = {
            "title": "TITLE",
            "artist": "ARTIST",
            "album": "ALBUM",
            "album_artist": "ALBUMARTIST",
            "genre": "GENRE",
            "year": "DATE",
            "track_no": "TRACKNUMBER",
        }
        for field, key in key_map.items():
            if field in updates:
                _set_vorbis(key, updates[field])
    elif suffix in {".m4a", ".mp4", ".aac"}:
        key_map = {
            "title": "©nam",
            "artist": "©ART",
            "album": "©alb",
            "album_artist": "aART",
            "genre": "©gen",
            "year": "©day",
            "track_no": "trkn",
        }
        for field, key in key_map.items():
            if field in updates:
                _set_mp4(key, updates[field])
    else:
        # Best-effort ID3-like frames on other formats
        from mutagen.id3 import TALB, TCON, TDRC, TIT2, TPE1, TPE2, TRCK

        id3_map = {
            "title": (TIT2, "TIT2"),
            "artist": (TPE1, "TPE1"),
            "album": (TALB, "TALB"),
            "album_artist": (TPE2, "TPE2"),
            "genre": (TCON, "TCON"),
            "year": (TDRC, "TDRC"),
            "track_no": (TRCK, "TRCK"),
        }
        for field, (frame_cls, key) in id3_map.items():
            if field not in updates:
                continue
            value = updates[field]
            try:
                if value is None or value == "":
                    tags.delall(key)
                else:
                    tags.setall(key, [frame_cls(encoding=3, text=str(value))])
            except Exception:
                pass

    audio.save()
