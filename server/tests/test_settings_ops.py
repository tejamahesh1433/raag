"""Scheduled rescan + playback settings."""
from pathlib import Path

from conftest import build_library, configure_and_scan


def test_scan_interval_and_transcode_settings(auth_client):
    s = auth_client.get("/api/settings").json()
    assert s["scan_interval_hours"] == 0
    assert s["transcode_enabled"] is False

    updated = auth_client.put(
        "/api/settings",
        json={"scan_interval_hours": 6, "transcode_enabled": True},
    )
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["scan_interval_hours"] == 6
    assert body["transcode_enabled"] is True

    detail = auth_client.get("/api/health/detail").json()
    assert detail["scan_interval_hours"] == 6
    assert detail["transcode_enabled"] is True
    assert "ffmpeg_available" in detail


def test_scheduler_tick_queues_when_due(auth_client, tmp_path, monkeypatch):
    build_library(tmp_path)
    configure_and_scan(auth_client, tmp_path)
    auth_client.put("/api/settings", json={"scan_interval_hours": 1})

    from app.services import scheduler

    monkeypatch.setattr(scheduler, "_last_scan_age_seconds", lambda: 99999)
    queued: dict = {}

    def fake_queue(db, *, message="Starting scan"):
        queued["message"] = message
        return type("Job", (), {"id": 99})()

    monkeypatch.setattr(scheduler, "queue_library_scan", fake_queue)
    assert scheduler.tick() is True
    assert "Scheduled" in queued["message"]

    # Interval off → no queue
    auth_client.put("/api/settings", json={"scan_interval_hours": 0})
    assert scheduler.tick() is False


def test_native_stream_unchanged(auth_client, tmp_path):
    build_library(tmp_path)
    configure_and_scan(auth_client, tmp_path)
    tracks = auth_client.get("/api/library/tracks").json()["items"]
    tid = tracks[0]["id"]
    resp = auth_client.get(f"/api/tracks/{tid}/stream")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("audio/")


def test_needs_transcode_helper():
    from app.services.streaming import needs_transcode

    assert needs_transcode(Path("song.wma")) is True
    assert needs_transcode(Path("song.mp3")) is False
    assert needs_transcode(Path("song.flac")) is False
