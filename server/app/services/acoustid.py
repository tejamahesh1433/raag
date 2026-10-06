"""AcoustID / Chromaprint fingerprint lookup via fpcalc CLI."""
from __future__ import annotations

import json
import logging
import shutil
import subprocess
from pathlib import Path
from typing import Any

import httpx

from .. import config

log = logging.getLogger("raag.acoustid")

ACOUSTID_LOOKUP = "https://api.acoustid.org/v2/lookup"


def fpcalc_available() -> bool:
    return shutil.which(config.FPCALC_PATH) is not None


def fingerprint_file(path: Path) -> tuple[str, float] | None:
    """Return (fingerprint, duration_seconds) or None."""
    if not path.is_file() or not fpcalc_available():
        return None
    cmd = [config.FPCALC_PATH, "-json", "-length", "120", str(path)]
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60, check=False)
    except (FileNotFoundError, subprocess.TimeoutExpired) as exc:
        log.warning("fpcalc failed: %s", exc)
        return None
    if proc.returncode != 0 or not proc.stdout.strip():
        log.warning("fpcalc error: %s", (proc.stderr or "")[:200])
        return None
    try:
        data = json.loads(proc.stdout)
        fp = data.get("fingerprint")
        duration = float(data.get("duration") or 0)
        if not fp:
            return None
        return str(fp), duration
    except (json.JSONDecodeError, TypeError, ValueError):
        return None


def lookup_acoustid(fingerprint: str, duration: float, api_key: str) -> list[dict[str, Any]]:
    if not api_key.strip():
        return []
    params = {
        "client": api_key.strip(),
        "meta": "recordings+releases+compress",
        "duration": str(int(duration)),
        "fingerprint": fingerprint,
    }
    try:
        with httpx.Client(timeout=20.0) as client:
            resp = client.get(ACOUSTID_LOOKUP, params=params)
            data = resp.json()
    except Exception as exc:
        log.warning("AcoustID request failed: %s", exc)
        return []
    if data.get("status") != "ok":
        return []
    results = data.get("results") or []
    out: list[dict[str, Any]] = []
    for r in results:
        score = float(r.get("score") or 0)
        for rec in r.get("recordings") or []:
            title = rec.get("title") or ""
            artists = rec.get("artists") or []
            artist = artists[0].get("name") if artists else ""
            releases = rec.get("releases") or []
            album = releases[0].get("title") if releases else ""
            year = None
            if releases and releases[0].get("date"):
                year = releases[0]["date"].get("year")
            out.append(
                {
                    "score": score,
                    "title": title,
                    "artist": artist,
                    "album": album,
                    "year": year,
                    "recording_id": rec.get("id"),
                }
            )
    out.sort(key=lambda x: x["score"], reverse=True)
    return out[:5]


def identify_path(path: Path, api_key: str) -> dict[str, Any]:
    fp = fingerprint_file(path)
    if not fp:
        return {"ok": False, "error": "fingerprint_failed", "matches": []}
    fingerprint, duration = fp
    matches = lookup_acoustid(fingerprint, duration, api_key)
    return {
        "ok": True,
        "duration": duration,
        "matches": matches,
        "best": matches[0] if matches else None,
    }
