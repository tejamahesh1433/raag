"""Last.fm and ListenBrainz scrobbling."""
from __future__ import annotations

import hashlib
import logging
import time
from typing import Any

import httpx

from ..models import Track

log = logging.getLogger("raag.scrobble")

LASTFM_API = "https://ws.audioscrobbler.com/2.0/"
LISTENBRAINZ_API = "https://api.listenbrainz.org/1/submit-listens"


def _lastfm_sign(params: dict[str, str], secret: str) -> str:
    pieces = "".join(f"{k}{params[k]}" for k in sorted(params) if k != "format")
    return hashlib.md5(f"{pieces}{secret}".encode()).hexdigest()


def scrobble_lastfm(track: Track, cfg: dict[str, Any]) -> None:
    api_key = (cfg.get("lastfm_api_key") or "").strip()
    secret = (cfg.get("lastfm_api_secret") or "").strip()
    session = (cfg.get("lastfm_session_key") or "").strip()
    if not (api_key and secret and session):
        return
    params = {
        "method": "track.scrobble",
        "api_key": api_key,
        "sk": session,
        "artist": track.artist_name or "Unknown",
        "track": track.title or "Unknown",
        "timestamp": str(int(time.time())),
        "album": track.album_title or "",
    }
    if track.duration:
        params["duration"] = str(int(track.duration))
    params["api_sig"] = _lastfm_sign(params, secret)
    params["format"] = "json"
    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.post(LASTFM_API, data=params)
            if resp.status_code >= 400:
                log.warning("Last.fm scrobble failed: %s %s", resp.status_code, resp.text[:200])
    except Exception as exc:
        log.warning("Last.fm scrobble error: %s", exc)


def scrobble_listenbrainz(track: Track, cfg: dict[str, Any]) -> None:
    token = (cfg.get("listenbrainz_token") or "").strip()
    if not token:
        return
    payload = {
        "listen_type": "single",
        "payload": [
            {
                "listened_at": int(time.time()),
                "track_metadata": {
                    "artist_name": track.artist_name or "Unknown",
                    "track_name": track.title or "Unknown",
                    "release_name": track.album_title or "",
                    "additional_info": {
                        "listening_from": "Raag",
                        "duration_ms": int((track.duration or 0) * 1000) or None,
                    },
                },
            }
        ],
    }
    # Drop nulls in additional_info
    add = payload["payload"][0]["track_metadata"]["additional_info"]
    payload["payload"][0]["track_metadata"]["additional_info"] = {
        k: v for k, v in add.items() if v is not None
    }
    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.post(
                LISTENBRAINZ_API,
                json=payload,
                headers={"Authorization": f"Token {token}"},
            )
            if resp.status_code >= 400:
                log.warning("ListenBrainz failed: %s %s", resp.status_code, resp.text[:200])
    except Exception as exc:
        log.warning("ListenBrainz error: %s", exc)


def scrobble_track(track: Track, cfg: dict[str, Any] | None) -> None:
    if not cfg or not isinstance(cfg, dict):
        return
    if cfg.get("lastfm_enabled"):
        scrobble_lastfm(track, cfg)
    if cfg.get("listenbrainz_enabled"):
        scrobble_listenbrainz(track, cfg)


def lastfm_get_session(api_key: str, secret: str, username: str, password: str) -> str:
    """Mobile session auth — returns session key."""
    params = {
        "method": "auth.getMobileSession",
        "api_key": api_key.strip(),
        "username": username.strip(),
        "password": password,
    }
    params["api_sig"] = _lastfm_sign(params, secret.strip())
    params["format"] = "json"
    with httpx.Client(timeout=10.0) as client:
        resp = client.post(LASTFM_API, data=params)
        data = resp.json()
        if resp.status_code >= 400 or "session" not in data:
            detail = data.get("message") or data.get("error") or resp.text[:200]
            raise RuntimeError(str(detail))
        return str(data["session"]["key"])
