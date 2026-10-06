"""Tests for POST /api/playlists/import (M3U import)."""
import io
import tempfile
from pathlib import Path

import pytest

from conftest import build_library, configure_and_scan


@pytest.fixture()
def seeded(auth_client):
    """Authenticated client with a scanned 5-track library."""
    root = Path(tempfile.mkdtemp(prefix="m3u-test-lib-"))
    build_library(root)
    configure_and_scan(auth_client, root)
    r = auth_client.get("/api/library/tracks?limit=5")
    assert r.status_code == 200
    tracks = r.json()["items"]
    return auth_client, tracks


def _upload(client, content: str, filename="test.m3u"):
    return client.post(
        "/api/playlists/import",
        files={"file": (filename, io.BytesIO(content.encode()), "audio/x-mpegurl")},
    )


def test_import_empty_m3u(auth_client):
    """An empty M3U creates a playlist with zero tracks."""
    r = _upload(auth_client, "#EXTM3U\n")
    assert r.status_code == 201
    body = r.json()
    assert body["kind"] == "manual"
    assert body["track_count"] == 0


def test_import_m3u_name_from_filename(auth_client):
    r = _upload(auth_client, "#EXTM3U\n", filename="My Mix.m3u")
    assert r.status_code == 201
    assert r.json()["name"] == "My Mix"


def test_import_m3u_extinf_title_artist_match(seeded):
    """Tracks matched by EXTINF title+artist are included."""
    auth_client, tracks = seeded
    t = tracks[0]
    title, artist = t.get("title", ""), t.get("artist", "")
    if not title or not artist:
        pytest.skip("track has no title/artist")
    m3u = f"#EXTM3U\n#EXTINF:180,{artist} - {title}\n/no/such/file.mp3\n"
    r = _upload(auth_client, m3u)
    assert r.status_code == 201
    assert r.json()["track_count"] >= 1


def test_import_m3u_exact_path_match(seeded):
    """Tracks matched by exact path in the M3U are included."""
    auth_client, tracks = seeded
    t = tracks[0]
    # We don't expose path via API, so use a roundabout: import via EXTINF+basename.
    # Instead, export from a known playlist and reimport to verify path matching.
    # Create a manual playlist with the track first.
    pl_r = auth_client.post("/api/playlists", json={"name": "Export Test", "kind": "manual"})
    assert pl_r.status_code == 201
    pl_id = pl_r.json()["id"]
    auth_client.post(f"/api/playlists/{pl_id}/tracks", json={"track_ids": [t["id"]]})
    # Export to M3U (this embeds the real server path).
    exp_r = auth_client.get(f"/api/playlists/{pl_id}/export")
    assert exp_r.status_code == 200
    m3u_content = exp_r.text
    # Import the exported M3U back.
    imp_r = _upload(auth_client, m3u_content, filename="reimport.m3u")
    assert imp_r.status_code == 201
    body = imp_r.json()
    assert body["track_count"] == 1
    assert body["name"] == "reimport"


def test_import_creates_manual_playlist(auth_client):
    r = _upload(auth_client, "#EXTM3U\n# comment\n")
    assert r.status_code == 201
    assert r.json()["kind"] == "manual"
