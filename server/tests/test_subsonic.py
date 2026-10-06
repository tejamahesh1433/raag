"""Unit + integration tests for Subsonic API compatibility layer."""
from pathlib import Path
from tests.conftest import configure_and_scan, make_wav


def test_subsonic_ping(auth_client):
    resp = auth_client.get("/rest/ping?f=json")
    assert resp.status_code == 200
    data = resp.json()["subsonic-response"]
    assert data["status"] == "ok"
    assert data["openSubsonic"] is True


def test_subsonic_ping_xml(auth_client):
    resp = auth_client.get("/rest/ping.view?f=xml")
    assert resp.status_code == 200
    assert "subsonic-response" in resp.text
    assert 'status="ok"' in resp.text


def test_subsonic_get_license(auth_client):
    resp = auth_client.get("/rest/getLicense.view")
    assert resp.status_code == 200
    assert resp.json()["subsonic-response"]["license"]["valid"] is True


def test_subsonic_get_music_folders(auth_client):
    resp = auth_client.get("/rest/getMusicFolders.view")
    assert resp.status_code == 200
    folders = resp.json()["subsonic-response"]["musicFolders"]["musicFolder"]
    assert isinstance(folders, list)


def test_subsonic_library_flow(auth_client, tmp_path: Path):
    lib = tmp_path / "lib"
    make_wav(lib / "track1.wav", "Subsonic Track", "Subsonic Artist", "Subsonic Album", genre="Rock")
    job = configure_and_scan(auth_client, lib)
    assert job["status"] == "done"

    # Search
    search_resp = auth_client.get("/rest/search3.view?query=Subsonic")
    assert search_resp.status_code == 200
    songs = search_resp.json()["subsonic-response"]["searchResult3"]["song"]
    assert len(songs) >= 1
    song_id = songs[0]["id"]

    # Get song
    song_resp = auth_client.get(f"/rest/getSong.view?id={song_id}")
    assert song_resp.status_code == 200
    assert song_resp.json()["subsonic-response"]["song"]["title"] == "Subsonic Track"

    # Stream
    stream_resp = auth_client.get(f"/rest/stream.view?id={song_id}")
    assert stream_resp.status_code in (200, 206)
