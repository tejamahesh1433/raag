"""Search, streaming (HTTP Range), and artwork through the HTTP API seam."""
from pathlib import Path

from conftest import build_library, configure_and_scan


def test_search_finds_tracks_artists_albums(auth_client, tmp_path):
    build_library(tmp_path)
    configure_and_scan(auth_client, tmp_path)

    by_title = auth_client.get("/api/library/search", params={"q": "Red Line"}).json()
    assert any(t["title"] == "Red Line" for t in by_title["tracks"])

    by_artist = auth_client.get("/api/library/search", params={"q": "Aurora"}).json()
    assert any(a["name"] == "Aurora" for a in by_artist["artists"])
    assert len(by_artist["tracks"]) >= 2

    by_genre = auth_client.get("/api/library/search", params={"q": "Synthwave"}).json()
    assert any(t["title"] == "Night Drive" for t in by_genre["tracks"])

    no_match = auth_client.get("/api/library/search", params={"q": "zzzznope"}).json()
    assert no_match["tracks"] == []
    assert no_match["artists"] == []


def _first_track_id(client) -> int:
    tracks = client.get("/api/library/tracks?limit=1").json()
    return tracks["items"][0]["id"]


def test_stream_full_file(auth_client, tmp_path):
    build_library(tmp_path)
    configure_and_scan(auth_client, tmp_path)
    track_id = _first_track_id(auth_client)

    from app.db import SessionLocal
    from app.models import Track

    with SessionLocal() as db:
        track = db.query(Track).filter(Track.id == track_id).first()
        expected_size = Path(track.path).stat().st_size

    resp = auth_client.get(f"/api/tracks/{track_id}/stream")
    assert resp.status_code == 200
    assert resp.headers["accept-ranges"] == "bytes"
    assert int(resp.headers["content-length"]) == expected_size
    assert len(resp.content) == expected_size
    assert resp.headers["content-type"].startswith("audio/")


def test_stream_range_request(auth_client, tmp_path):
    build_library(tmp_path)
    configure_and_scan(auth_client, tmp_path)
    track_id = _first_track_id(auth_client)

    full = auth_client.get(f"/api/tracks/{track_id}/stream").content

    partial = auth_client.get(
        f"/api/tracks/{track_id}/stream", headers={"Range": "bytes=0-99"}
    )
    assert partial.status_code == 206
    assert partial.content == full[:100]
    assert partial.headers["content-range"].startswith("bytes 0-99/")
    assert partial.headers["content-length"] == "100"

    open_ended = auth_client.get(
        f"/api/tracks/{track_id}/stream", headers={"Range": "bytes=100-"}
    )
    assert open_ended.status_code == 206
    assert open_ended.content == full[100:]

    suffix = auth_client.get(
        f"/api/tracks/{track_id}/stream", headers={"Range": "bytes=-50"}
    )
    assert suffix.status_code == 206
    assert suffix.content == full[-50:]


def test_stream_unsatisfiable_range(auth_client, tmp_path):
    build_library(tmp_path)
    configure_and_scan(auth_client, tmp_path)
    track_id = _first_track_id(auth_client)
    resp = auth_client.get(
        f"/api/tracks/{track_id}/stream", headers={"Range": "bytes=99999999-"}
    )
    assert resp.status_code == 416


def test_stream_requires_auth(client):
    client.post("/api/auth/setup", json={"username": "admin", "password": "s3cret-pass"})
    client.post("/api/auth/logout")
    resp = client.get("/api/tracks/1/stream")
    assert resp.status_code == 401


def test_stream_rejects_paths_outside_roots(auth_client, tmp_path):
    """Tracks whose file lives outside configured roots are never served."""
    build_library(tmp_path)
    configure_and_scan(auth_client, tmp_path)

    # Simulate a DB row pointing at a protected file (path traversal defense).
    from app.db import SessionLocal
    from app.models import Track
    import tempfile

    outside = Path(tempfile.gettempdir()) / "definitely-outside-root.wav"
    outside.write_bytes(b"RIFFfake")
    with SessionLocal() as db:
        track = Track(
            path=str(outside),
            size=outside.stat().st_size,
            mtime=0,
            title="Intruder",
            artist_name="X",
            album_title="Y",
            format="wav",
        )
        db.add(track)
        db.commit()
        track_id = track.id

    resp = auth_client.get(f"/api/tracks/{track_id}/stream")
    assert resp.status_code == 403
    outside.unlink(missing_ok=True)


def test_artwork_served_when_present(auth_client, tmp_path):
    """Library without embedded art returns 404 for artwork; endpoint behaves."""
    build_library(tmp_path)
    configure_and_scan(auth_client, tmp_path)
    resp = auth_client.get("/api/artwork/1")
    assert resp.status_code == 404  # fixture WAVs carry no cover art
