"""Unit + API tests for embeddings cosine math, lyrics parsing, discovery routes."""
from __future__ import annotations

from pathlib import Path

import pytest

from app.services.embeddings import cosine, pack, unpack
from app.services.lyrics import parse_lrc
from tests.conftest import configure_and_scan, make_wav, wait_for_job
from tests.fake_openai import FakeProvider


def test_pack_unpack_roundtrip():
    vec = [0.1, -0.5, 2.0, 0.0]
    assert list(unpack(pack(vec))) == [pytest.approx(v) for v in vec]


def test_cosine_identical_is_one():
    a = [1.0, 2.0, 3.0]
    assert abs(cosine(a, a) - 1.0) < 1e-6


def test_cosine_orthogonal_is_zero():
    assert abs(cosine([1.0, 0.0], [0.0, 1.0])) < 1e-6


def test_parse_lrc_lines():
    text = "[00:12.50]First line\n[1:02]Second\nnot a stamp\n[01:03.001]Third"
    lines = parse_lrc(text)
    assert len(lines) == 3
    assert lines[0]["text"] == "First line"
    assert abs(lines[0]["t"] - 12.5) < 0.01
    assert lines[1]["text"] == "Second"
    assert abs(lines[1]["t"] - 62.0) < 0.01


def test_lyrics_from_sidecar(auth_client, tmp_path: Path):
    lib = tmp_path / "lib"
    make_wav(lib / "song.wav", "Hello", "Artist", "Album")
    (lib / "song.lrc").write_text(
        "[00:01.00]Hello world\n[00:05.00]Line two\n", encoding="utf-8"
    )
    job = configure_and_scan(auth_client, lib)
    assert job["status"] == "done", job

    tracks = auth_client.get("/api/library/tracks").json()["items"]
    assert tracks
    tid = tracks[0]["id"]

    resp = auth_client.get(f"/api/tracks/{tid}/lyrics")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "Hello world" in body["plain"]
    assert body["source"] == "sidecar"
    assert body["synced"][0]["text"] == "Hello world"


def test_embed_index_and_similar(auth_client, tmp_path: Path):
    fake = FakeProvider()
    fake.start()
    try:
        auth_client.put(
            "/api/settings",
            json={
                "ai": {
                    "provider": "custom",
                    "base_url": fake.base_url,
                    "chat_model": "fake-model",
                    "embed_model": "fake-embed",
                    "online_enrichment": False,
                }
            },
        )
        lib = tmp_path / "lib"
        make_wav(lib / "a.wav", "Red Line", "Basement", "Night", genre="indie")
        make_wav(lib / "b.wav", "Blue Line", "Basement", "Night", genre="indie")
        make_wav(lib / "c.wav", "Jazz Only", "Other", "Day", genre="jazz")
        job = configure_and_scan(auth_client, lib)
        assert job["status"] == "done", job

        status = auth_client.get("/api/discovery/status").json()
        assert status["total"] == 3
        assert status["indexed"] == 0

        started = auth_client.post("/api/discovery/embed")
        assert started.status_code == 202, started.text
        job = wait_for_job(auth_client, started.json()["job_id"])
        assert job["status"] == "done", job

        status = auth_client.get("/api/discovery/status").json()
        assert status["indexed"] == 3
        assert status["ready"] is True

        tracks = auth_client.get("/api/library/tracks").json()["items"]
        tid = next(t["id"] for t in tracks if t["title"] == "Red Line")
        similar = auth_client.get(f"/api/discovery/similar/{tid}").json()
        assert similar
        titles = [row["track"]["title"] for row in similar]
        assert "Blue Line" in titles

        semantic = auth_client.get(
            "/api/discovery/search", params={"q": "indie basement night"}
        )
        assert semantic.status_code == 200, semantic.text
        assert len(semantic.json()) >= 1
    finally:
        fake.stop()
