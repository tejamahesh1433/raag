"""HTTP-range audio streaming with optional ffmpeg transcoding for exotic formats."""
from __future__ import annotations

import re
import shutil
import subprocess
from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import Response, StreamingResponse

from .. import config

CHUNK_SIZE = 256 * 1024  # 256 KB — fewer round-trips through Cloudflare tunnel

_ffmpeg_available: bool | None = None  # cached after first check

_CONTENT_TYPES = {
    "mp3": "audio/mpeg",
    "flac": "audio/flac",
    "m4a": "audio/mp4",
    "mp4": "audio/mp4",
    "ogg": "audio/ogg",
    "oga": "audio/ogg",
    "opus": "audio/opus",
    "wav": "audio/wav",
    "aac": "audio/aac",
    "wma": "audio/x-ms-wma",
    "aiff": "audio/aiff",
    "aif": "audio/aiff",
    "wv": "audio/x-wavpack",
}

# Formats most browsers can play natively without help.
NATIVE_BROWSER_FORMATS = {
    "mp3",
    "flac",
    "m4a",
    "mp4",
    "ogg",
    "oga",
    "opus",
    "wav",
    "aac",
}

_RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")


def _content_type(path: Path) -> str:
    return _CONTENT_TYPES.get(path.suffix.lstrip(".").lower(), "application/octet-stream")


def ffmpeg_available() -> bool:
    global _ffmpeg_available
    if _ffmpeg_available is None:
        _ffmpeg_available = shutil.which(config.FFMPEG_PATH) is not None
    return _ffmpeg_available


def needs_transcode(path: Path) -> bool:
    return path.suffix.lstrip(".").lower() not in NATIVE_BROWSER_FORMATS


def _file_chunks(path: Path, start: int, end: int):
    with path.open("rb") as fh:
        fh.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            data = fh.read(min(CHUNK_SIZE, remaining))
            if not data:
                break
            remaining -= len(data)
            yield data


ALLOWED_BITRATES = {128, 192, 256, 320}


def stream_transcoded(path: Path, bitrate_kbps: int = 192) -> StreamingResponse:
    """Pipe file through ffmpeg → MP3. Seeking/Range not supported for this path."""
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Media file not found")
    if not ffmpeg_available():
        raise HTTPException(
            status_code=415,
            detail="Format needs ffmpeg transcoding, but ffmpeg was not found on PATH",
        )
    kbps = bitrate_kbps if bitrate_kbps in ALLOWED_BITRATES else 192

    cmd = [
        config.FFMPEG_PATH,
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(path),
        "-vn",
        "-acodec",
        "libmp3lame",
        "-ab",
        f"{kbps}k",
        "-f",
        "mp3",
        "pipe:1",
    ]
    try:
        proc = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
    except FileNotFoundError as exc:
        raise HTTPException(status_code=415, detail="ffmpeg not found") from exc

    def _gen():
        assert proc.stdout is not None
        try:
            while True:
                chunk = proc.stdout.read(CHUNK_SIZE)
                if not chunk:
                    break
                yield chunk
        finally:
            try:
                proc.stdout.close()
            except Exception:
                pass
            proc.wait(timeout=30)

    return StreamingResponse(
        _gen(),
        status_code=200,
        media_type="audio/mpeg",
        headers={
            "Accept-Ranges": "none",
            "X-Raag-Transcode": f"ffmpeg-mp3-{kbps}k",
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
        },
    )


def stream_file(path: Path, range_header: str | None) -> Response:
    """Return 200/206 streaming response honoring a single-range Range header.

    Raises 404 if the file vanished and 416 for unsatisfiable ranges.
    """
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Media file not found")

    stat = path.stat()
    file_size = stat.st_size
    content_type = _content_type(path)
    etag = f'"{int(stat.st_mtime)}-{file_size}"'
    base_headers = {
        "Accept-Ranges": "bytes",
        "ETag": etag,
        "Cache-Control": "private, max-age=3600",
        "X-Accel-Buffering": "no",  # prevent nginx buffering — critical for low latency
    }

    if not range_header:
        return StreamingResponse(
            _file_chunks(path, 0, file_size - 1),
            status_code=200,
            media_type=content_type,
            headers={**base_headers, "Content-Length": str(file_size)},
        )

    match = _RANGE_RE.match(range_header.strip())
    if not match or (match.group(1) == "" and match.group(2) == ""):
        raise HTTPException(status_code=416, detail="Malformed Range header")

    start_raw, end_raw = match.group(1), match.group(2)
    if start_raw == "":  # suffix range: last N bytes
        suffix = int(end_raw)
        if suffix <= 0:
            raise HTTPException(status_code=416, detail="Unsatisfiable Range")
        start = max(0, file_size - suffix)
        end = file_size - 1
    else:
        start = int(start_raw)
        end = int(end_raw) if end_raw else file_size - 1
        if start >= file_size or start > end:
            raise HTTPException(status_code=416, detail="Unsatisfiable Range")
        end = min(end, file_size - 1)

    return StreamingResponse(
        _file_chunks(path, start, end),
        status_code=206,
        media_type=content_type,
        headers={
            **base_headers,
            "Content-Length": str(end - start + 1),
            "Content-Range": f"bytes {start}-{end}/{file_size}",
        },
    )


def stream_track_file(
    path: Path,
    range_header: str | None,
    *,
    transcode: bool,
    quality: str | None = None,
) -> Response:
    """Stream native bytes, or ffmpeg→mp3 when enabled / quality requests a bitrate.

    quality: original | 128 | 192 | 256 | 320
    """
    q = (quality or "original").strip().lower()
    if q in {"128", "192", "256", "320"}:
        if not ffmpeg_available():
            raise HTTPException(
                status_code=415,
                detail="Quality transcoding needs ffmpeg on PATH",
            )
        return stream_transcoded(path, int(q))
    if transcode and needs_transcode(path):
        return stream_transcoded(path, 192)
    return stream_file(path, range_header)
