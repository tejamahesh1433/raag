"""Library scan/browse/search flows through the HTTP API seam."""
from pathlib import Path

from conftest import build_library, configure_and_scan, wait_for_job


def test_scan_requires_roots(auth_client):
    resp = auth_client.post("/api/library/scan")
    assert resp.status_code == 400
    assert "roots" in resp.json()["detail"].lower()


def test_scan_indexes_fixture_library(auth_client, tmp_path):
    build_library(tmp_path)
    summary = configure_and_scan(auth_client, tmp_path)
    assert summary["status"] == "done"
    assert summary["message"].startswith("Scan complete")
    assert auth_client.get("/api/health").json()["tracks"] == 5

    tracks = auth_client.get("/api/library/tracks?limit=100").json()
    assert tracks["total"] == 5
    titles = {t["title"] for t in tracks["items"]}
    assert titles == {"First Light", "Second Dawn", "Red Line", "Blue Shift", "Night Drive"}

    # Tag metadata made it through mutagen -> DB
    first = next(t for t in tracks["items"] if t["title"] == "First Light")
    assert first["artist"] == "Aurora"
    assert first["album"] == "Northern Skies"
    assert first["genre"] == "Ambient"
    assert first["year"] == 2020
    assert first["track_no"] == 1
    assert first["duration"] >= 0


def test_rescan_is_incremental(auth_client, tmp_path):
    build_library(tmp_path)
    first = configure_and_scan(auth_client, tmp_path)
    assert "5 added" in first["message"]

    second_summary = configure_and_scan(auth_client, tmp_path)
    assert "0 added" in second_summary["message"]
    assert "5 unchanged" in second_summary["message"]
    assert auth_client.get("/api/health").json()["tracks"] == 5


def test_rescan_removes_deleted_files(auth_client, tmp_path):
    build_library(tmp_path)
    configure_and_scan(auth_client, tmp_path)
    (tmp_path / "c1" / "five.wav").unlink()
    summary = configure_and_scan(auth_client, tmp_path)
    assert "1 removed" in summary["message"]
    assert auth_client.get("/api/health").json()["tracks"] == 4


def test_scan_skips_duplicate_copies_across_roots(auth_client, tmp_path):
    """Same tagged song in two folders must only appear once in the library."""
    from conftest import make_wav
    from pathlib import Path

    nested = tmp_path / "Downloads" / "Aurora" / "Northern Skies"
    flat = tmp_path / "All Songs"
    make_wav(nested / "one.wav", "First Light", "Aurora", "Northern Skies", "Ambient", "2020", "1")
    # Identical tags + same byte length (same duration fixture) => duplicate fingerprint.
    make_wav(flat / "one.wav", "First Light", "Aurora", "Northern Skies", "Ambient", "2020", "1")

    resp = auth_client.put(
        "/api/settings",
        json={"library_roots": [str(tmp_path / "Downloads"), str(flat)]},
    )
    assert resp.status_code == 200, resp.text
    roots = resp.json()["library_roots"]
    assert len(roots) == 2

    resp = auth_client.post("/api/library/scan")
    assert resp.status_code == 202, resp.text
    job = wait_for_job(auth_client, resp.json()["job_id"])
    assert job["status"] == "done"
    assert "duplicates skipped" in job["message"]

    tracks = auth_client.get("/api/library/tracks?limit=100").json()
    assert tracks["total"] == 1
    only = tracks["items"][0]
    assert only["title"] == "First Light"
    assert only["artist"] == "Aurora"
    assert only["album"] == "Northern Skies"

def test_settings_drops_duplicate_and_nested_roots(auth_client, tmp_path):
    nested = tmp_path / "music" / "inner"
    nested.mkdir(parents=True)
    (tmp_path / "music").mkdir(exist_ok=True)
    resp = auth_client.put(
        "/api/settings",
        json={
            "library_roots": [
                str(tmp_path / "music"),
                str(tmp_path / "music"),
                str(nested),
            ]
        },
    )
    assert resp.status_code == 200, resp.text
    roots = resp.json()["library_roots"]
    assert len(roots) == 1
    assert Path(roots[0]).resolve() == (tmp_path / "music").resolve()


def test_browse_artists_and_albums(auth_client, tmp_path):
    build_library(tmp_path)
    configure_and_scan(auth_client, tmp_path)

    artists = auth_client.get("/api/library/artists").json()
    assert {a["name"] for a in artists} == {"Aurora", "Basement", "Cassette"}
    aurora = next(a for a in artists if a["name"] == "Aurora")
    assert aurora["track_count"] == 2
    assert aurora["album_count"] == 1

    albums = auth_client.get("/api/library/albums").json()
    assert {a["title"] for a in albums} == {"Northern Skies", "Concrete", "Neon City"}
    northern = next(a for a in albums if a["title"] == "Northern Skies")
    assert northern["track_count"] == 2
    assert northern["year"] == 2020

    album_tracks = auth_client.get(f"/api/library/albums/{northern['id']}/tracks").json()
    assert [t["track_no"] for t in album_tracks] == [1, 2]

    genres = auth_client.get("/api/library/genres").json()
    assert {g["genre"] for g in genres} == {"Ambient", "Rock", "Synthwave"}

