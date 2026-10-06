"""Discord webhook now-playing / scrobble notifications."""
from __future__ import annotations

import logging
from typing import Any

import httpx

from ..models import Track

log = logging.getLogger("raag.discord")


def notify_discord(track: Track, cfg: dict[str, Any] | None, *, base_url: str = "") -> None:
    if not cfg or not cfg.get("enabled"):
        return
    url = (cfg.get("webhook_url") or "").strip()
    if not url.startswith("https://discord.com/api/webhooks/") and not url.startswith(
        "https://discordapp.com/api/webhooks/"
    ):
        return
    title = track.title or "Unknown"
    artist = track.artist_name or "Unknown"
    album = track.album_title or ""
    content = cfg.get("content") or "Now playing on Raag"
    embed = {
        "title": title,
        "description": f"**{artist}**" + (f" · {album}" if album else ""),
        "color": 0xFB7185,
        "footer": {"text": "Raag"},
    }
    if base_url and track.id:
        embed["url"] = f"{base_url.rstrip('/')}/"
    payload = {"content": content, "embeds": [embed], "username": "Raag"}
    try:
        with httpx.Client(timeout=8.0) as client:
            resp = client.post(url, json=payload)
            if resp.status_code >= 400:
                log.warning("Discord webhook failed: %s %s", resp.status_code, resp.text[:200])
    except Exception as exc:
        log.warning("Discord webhook error: %s", exc)
