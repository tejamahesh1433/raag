"""Application configuration from environment variables."""
import os
from pathlib import Path


def _env(key: str, default: str) -> str:
    return os.environ.get(key, default)


def _env_json_list(key: str) -> list:
    raw = os.environ.get(key, "")
    if not raw.strip():
        return []
    import json

    try:
        value = json.loads(raw)
        return value if isinstance(value, list) else []
    except json.JSONDecodeError:
        return [p.strip() for p in raw.split(os.pathsep) if p.strip()]


# Storage -------------------------------------------------------------------
DATA_DIR = Path(_env("MUSIC_DATA_DIR", "./data")).resolve()
DB_PATH = Path(_env("MUSIC_DB_PATH", str(DATA_DIR / "music.db")))

# Server --------------------------------------------------------------------
HOST = _env("MUSIC_HOST", "127.0.0.1")
PORT = int(_env("MUSIC_PORT", "8765"))
# "1" when served over HTTPS (production behind Caddy)
COOKIE_SECURE = _env("MUSIC_COOKIE_SECURE", "0") == "1"
CORS_ORIGINS = [o.strip() for o in _env("MUSIC_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",") if o.strip()]

# Auth ----------------------------------------------------------------------
# Default: open LAN access — no login. Set MUSIC_AUTH_REQUIRED=1 to gate APIs.
AUTH_REQUIRED = _env("MUSIC_AUTH_REQUIRED", "0") == "1"
SESSION_TTL_DAYS = int(_env("MUSIC_SESSION_TTL_DAYS", "30"))
LOGIN_MAX_ATTEMPTS = int(_env("MUSIC_LOGIN_MAX_ATTEMPTS", "5"))
LOGIN_WINDOW_SECONDS = int(_env("MUSIC_LOGIN_WINDOW_SECONDS", "300"))

# Optional bootstrap of the first admin account (Docker / headless setup)
BOOTSTRAP_ADMIN_USER = _env("MUSIC_ADMIN_USER", "")
BOOTSTRAP_ADMIN_PASSWORD = _env("MUSIC_ADMIN_PASSWORD", "")

# Never rewrite audio files unless explicitly enabled
ALLOW_TAG_WRITES = _env("MUSIC_ALLOW_TAG_WRITES", "0") == "1"

GUEST_USERNAME = "guest"

# Library -------------------------------------------------------------------
# Seed library roots from env (JSON list or os.pathsep separated); may also be
# managed at runtime through PUT /api/settings.
LIBRARY_ROOTS = _env_json_list("MUSIC_LIBRARY_ROOTS")
FFMPEG_PATH = _env("MUSIC_FFMPEG_PATH", "ffmpeg")
FPCALC_PATH = _env("MUSIC_FPCALC_PATH", "fpcalc")

# AI (persisted in settings; gateway lands in M3) ---------------------------
AI_PROVIDER = _env("MUSIC_AI_PROVIDER", "ollama")  # ollama | lm-studio | custom
AI_BASE_URL = _env("MUSIC_AI_BASE_URL", "")  # empty = provider default
AI_CHAT_MODEL = _env("MUSIC_AI_CHAT_MODEL", "qwen2.5:7b-instruct")
AI_EMBED_MODEL = _env("MUSIC_AI_EMBED_MODEL", "nomic-embed-text")
AI_TAG_MODEL = _env("MUSIC_AI_TAG_MODEL", "")

VERSION = "0.3.2"
APK_VERSION = "1.0.5"
