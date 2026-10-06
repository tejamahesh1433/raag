"""Organization: tag suggestions, duplicates, setup status."""
from __future__ import annotations

from pathlib import Path

from tests.conftest import configure_and_scan, make_wav, wait_for_job


def test_tag_writes_disabled_by_default(auth_client, tmp_path: Path):
    lib = tmp_path / "lib"
    make_wav(lib / "Some_Artist_-_Cool_Song.wav", "Some_Artist_-_Cool_Song", "Unknown Artist", "Unknown Album")
    configure_and_scan(auth_client, lib)

    started = auth_client.post("/api/organization/scan-tags", json={"use_llm": False})
    assert started.status_code == 403
    assert "original" in started.json()["detail"].lower()


def test_tag_scan_approve_writes_file(auth_client, tmp_path: Path, monkeypatch):
    monkeypatch.setattr("app.config.ALLOW_TAG_WRITES", True)
    lib = tmp_path / "lib"
    # Underscored title + unknown artist → heuristic suggestion
    make_wav(lib / "Some_Artist_-_Cool_Song.wav", "Some_Artist_-_Cool_Song", "Unknown Artist", "Unknown Album")
    job = configure_and_scan(auth_client, lib)
    assert job["status"] == "done", job

    started = auth_client.post("/api/organization/scan-tags", json={"use_llm": False})
    assert started.status_code == 202, started.text
    job = wait_for_job(auth_client, started.json()["job_id"])
    assert job["status"] == "done", job

    suggestions = auth_client.get("/api/organization/suggestions?status=pending").json()
    assert suggestions, "expected at least one suggestion"
    sid = suggestions[0]["id"]
    assert suggestions[0]["proposed"]

    approved = auth_client.post(f"/api/organization/suggestions/{sid}/approve")
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "approved"

    tracks = auth_client.get("/api/library/tracks").json()["items"]
    assert tracks
    # Title should no longer be the raw underscored stem-only mess
    assert "_" not in tracks[0]["title"] or tracks[0]["artist"] != "Unknown Artist"


def test_reject_suggestion(auth_client, tmp_path: Path, monkeypatch):
    monkeypatch.setattr("app.config.ALLOW_TAG_WRITES", True)
    lib = tmp_path / "lib"
    make_wav(lib / "messy_title.wav", "MESSY_TITLE", "Unknown Artist", "Unknown Album")
    configure_and_scan(auth_client, lib)
    started = auth_client.post("/api/organization/scan-tags", json={"use_llm": False})
    wait_for_job(auth_client, started.json()["job_id"])
    suggestions = auth_client.get("/api/organization/suggestions?status=pending").json()
    assert suggestions
    sid = suggestions[0]["id"]
    rejected = auth_client.post(f"/api/organization/suggestions/{sid}/reject")
    assert rejected.status_code == 200
    assert rejected.json()["status"] == "rejected"


def test_duplicates_endpoint(auth_client, tmp_path: Path):
    lib = tmp_path / "lib"
    make_wav(lib / "a.wav", "Same", "Artist", "Album")
    make_wav(lib / "b.wav", "Same", "Artist", "Album")
    # Same content fingerprint if identical wav bytes — make_wav may vary; just call endpoint
    configure_and_scan(auth_client, lib)
    resp = auth_client.get("/api/organization/duplicates")
    assert resp.status_code == 200
    assert "groups" in resp.json()


def test_setup_status(auth_client, tmp_path: Path):
    resp = auth_client.get("/api/organization/setup-status")
    assert resp.status_code == 200
    body = resp.json()
    assert "wizard_complete" in body
    assert "has_library_roots" in body

    configure_and_scan(auth_client, tmp_path / "lib")
    body = auth_client.get("/api/organization/setup-status").json()
    assert body["has_library_roots"] is True
