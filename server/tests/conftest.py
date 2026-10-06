"""Test fixtures: temp DB, fixture music library, authenticated API clients.

The two approved seams:
1. HTTP API — everything is tested through FastAPI TestClient.
2. AI provider — fake OpenAI-compatible server (tests/ai_stub.py), used from M3.
"""
import json
import os
import tempfile
import time
import wave
from pathlib import Path

# MUST run before any `app.*` import: config reads env at import time.
_TMP = Path(tempfile.mkdtemp(prefix="musicapp-tests-"))
os.environ["MUSIC_DATA_DIR"] = str(_TMP)
os.environ["MUSIC_DB_PATH"] = str(_TMP / "test.db")
os.environ["MUSIC_COOKIE_SECURE"] = "0"
os.environ["MUSIC_LOGIN_MAX_ATTEMPTS"] = "5"
os.environ["MUSIC_LOGIN_WINDOW_SECONDS"] = "300"
# Tests cover the gated-auth path; product default is open access (AUTH_REQUIRED=0).
os.environ["MUSIC_AUTH_REQUIRED"] = "1"
os.environ["MUSIC_ALLOW_TAG_WRITES"] = "0"
os.environ.pop("MUSIC_ADMIN_USER", None)
os.environ.pop("MUSIC_ADMIN_PASSWORD", None)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.db import Base, engine, init_db  # noqa: E402
from app.main import create_app  # noqa: E402

ADMIN = {"username": "admin", "password": "s3cret-pass"}


def reset_db() -> None:
    """Full data wipe between tests: drop tables + FTS, reseed settings."""
    from app.security import rate_limiter

    rate_limiter._attempts.clear()  # global in-process state must not leak
    with engine.begin() as conn:
        conn.exec_driver_sql("DROP TABLE IF EXISTS tracks_fts")
    Base.metadata.drop_all(engine)
    init_db()


@pytest.fixture()
def client():
    """Fresh unauthenticated API client (and clean DB) per test."""
    reset_db()
    app = create_app()
    with TestClient(app) as c:
        yield c


@pytest.fixture()
def auth_client(client):
    """API client with a first-run admin session cookie."""
    resp = client.post("/api/auth/setup", json=ADMIN)
    assert resp.status_code == 201, resp.text
    return client


def make_wav(
    path: Path,
    title: str,
    artist: str,
    album: str,
    genre: str = "",
    year: str = "",
    track_no: str = "",
    seconds: float = 0.5,
) -> Path:
    """Write a small silent WAV with real ID3 tags (verified mutagen round-trip)."""
    from mutagen.id3 import TALB, TCON, TDRC, TIT2, TPE1, TRCK
    from mutagen.wave import WAVE

    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(8000)
        w.writeframes(b"\x00\x00" * int(8000 * seconds))

    audio = WAVE(str(path))
    if audio.tags is None:
        audio.add_tags()
    audio.tags.add(TIT2(encoding=3, text=[title]))
    audio.tags.add(TPE1(encoding=3, text=[artist]))
    audio.tags.add(TALB(encoding=3, text=[album]))
    if genre:
        audio.tags.add(TCON(encoding=3, text=[genre]))
    if year:
        audio.tags.add(TDRC(encoding=3, text=[year]))
    if track_no:
        audio.tags.add(TRCK(encoding=3, text=[track_no]))
    audio.save()
    return path


def build_library(root: Path) -> dict:
    """Create a deterministic 5-track fixture library under root."""
    make_wav(root / "a1" / "one.wav", "First Light", "Aurora", "Northern Skies", "Ambient", "2020", "1")
    make_wav(root / "a1" / "two.wav", "Second Dawn", "Aurora", "Northern Skies", "Ambient", "2020", "2")
    make_wav(root / "b1" / "three.wav", "Red Line", "Basement", "Concrete", "Rock", "2019", "1")
    make_wav(root / "b1" / "four.wav", "Blue Shift", "Basement", "Concrete", "Rock", "2019", "2")
    make_wav(root / "c1" / "five.wav", "Night Drive", "Cassette", "Neon City", "Synthwave", "2022", "1")
    return {"root": root}


def wait_for_job(client: TestClient, job_id: int, timeout: float = 15.0) -> dict:
    """Poll a background job through the API until it finishes (the seam)."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        resp = client.get(f"/api/jobs/{job_id}")
        assert resp.status_code == 200, resp.text
        job = resp.json()
        if job["status"] in ("done", "error"):
            return job
        time.sleep(0.05)
    raise TimeoutError(f"job {job_id} did not finish in {timeout}s")


def configure_and_scan(client: TestClient, root: Path) -> dict:
    """Set library root via settings API, run a scan, wait for completion."""
    resp = client.put("/api/settings", json={"library_roots": [str(root)]})
    assert resp.status_code == 200, resp.text
    resp = client.post("/api/library/scan")
    assert resp.status_code == 202, resp.text
    return wait_for_job(client, resp.json()["job_id"])


@pytest.fixture()
def fake_provider():
    """The AI seam: a programmable OpenAI-compatible server on a real port."""
    from fake_openai import FakeProvider

    fp = FakeProvider()
    fp.start()
    try:
        yield fp
    finally:
        fp.stop()


def point_ai_at(client: TestClient, base_url: str) -> None:
    """Configure the app's AI settings to target a specific endpoint."""
    resp = client.put(
        "/api/settings",
        json={
            "ai": {
                "provider": "custom",
                "base_url": base_url,
                "chat_model": "fake-model",
                "embed_model": "fake-model",
            }
        },
    )
    assert resp.status_code == 200, resp.text


def parse_sse(text: str) -> list[tuple[str, dict]]:
    """Parse an SSE body into (event, data) tuples."""
    events: list[tuple[str, dict]] = []
    for block in text.split("\n\n"):
        if not block.strip():
            continue
        name = None
        data = None
        for line in block.splitlines():
            if line.startswith("event: "):
                name = line[len("event: "):].strip()
            elif line.startswith("data: "):
                data = json.loads(line[len("data: "):])
        if name is not None:
            events.append((name, data))
    return events
