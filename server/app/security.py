"""Password hashing (stdlib scrypt) and session token helpers."""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from . import config

_SCRYPT_N = 2**14
_SCRYPT_R = 8
_SCRYPT_P = 1


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=_SCRYPT_N, r=_SCRYPT_R, p=_SCRYPT_P, dklen=32
    )
    return f"scrypt${_SCRYPT_N}${_SCRYPT_R}${_SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, n, r, p, salt_hex, hash_hex = stored.split("$")
        if scheme != "scrypt":
            return False
        digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=bytes.fromhex(salt_hex),
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=32,
        )
        return hmac.compare_digest(digest.hex(), hash_hex)
    except (ValueError, TypeError):
        return False


def new_session_token() -> str:
    return secrets.token_urlsafe(32)


def session_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=config.SESSION_TTL_DAYS)


class LoginRateLimiter:
    """Sliding-window limiter keyed by username+ip, in-process (single server)."""

    def __init__(self, max_attempts: int | None = None, window: int | None = None):
        self.max_attempts = max_attempts or config.LOGIN_MAX_ATTEMPTS
        self.window = window or config.LOGIN_WINDOW_SECONDS
        self._attempts: dict[str, list[float]] = {}

    def check(self, key: str) -> bool:
        """Return True if the attempt is allowed."""
        import time

        now = time.time()
        hits = [t for t in self._attempts.get(key, []) if now - t < self.window]
        self._attempts[key] = hits
        return len(hits) < self.max_attempts

    def record_failure(self, key: str) -> None:
        import time

        self._attempts.setdefault(key, []).append(time.time())

    def reset(self, key: str) -> None:
        self._attempts.pop(key, None)


rate_limiter = LoginRateLimiter()
