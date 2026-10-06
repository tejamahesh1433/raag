"""Playlists (manual + smart), favorites, and play history via the API."""
import json

from conftest import build_library, configure_and_scan


def _track_ids(client, n: int | None = None) -> list[int]:
    tracks = client.get("/api/library/tracks?limit=100&order=artist").json()["items"]
    ids = [t["id"] for t in tracks]
    return ids if n is None else ids[:n]


def test_manual_playlist_lifecycle(auth_client, tmp_path):
    build_library(tmp_path)
    configure_and_scan(auth_client, tmp_path)
    ids = _track_ids(auth_client)

    created = auth_client.post(
        "/api/playlists",
        json={"name": "Road Trip", "description": "windows down", "kind": "manual"},
    )
    assert created.status_code == 201
    playlist = created.json()
    assert playlist["track_count"] == 0

    added = auth_client.post(
        f"/api/playlists/{playlist['id']}/tracks", json={"track_ids": ids[:3]}
    )
    assert added.status_code == 200
    assert added.json()["track_count"] == 3

    rows = auth_client.get(f"/api/playlists/{playlist['id']}/tracks").json()
    assert [r["id"] for r in rows] == ids[:3]

    # Reorder: reverse the queue
    reversed_ids = list(reversed(ids[:3]))
    auth_client.put(
        f"/api/playlists/{playlist['id']}/tracks/order", json={"track_ids": reversed_ids}
    )
    rows = auth_client.get(f"/api/playlists/{playlist['id']}/tracks").json()
    assert [r["id"] for r in rows] == reversed_ids

    # Remove one, then delete the playlist
    auth_client.delete(f"/api/playlists/{playlist['id']}/tracks/{reversed_ids[0]}")
    assert auth_client.get(f"/api/playlists/{playlist['id']}/tracks").json() is not None
    assert (
        auth_client.delete(f"/api/playlists/{playlist['id']}").status_code == 200
    )
    assert auth_client.get("/api/playlists").json() == []


def test_playlist_m3u_export(auth_client, tmp_path):
    build_library(tmp_path)
    configure_and_scan(auth_client, tmp_path)
    ids = _track_ids(auth_client, 2)
    playlist = auth_client.post("/api/playlists", json={"name": "Export Me"}).json()
    auth_client.post(f"/api/playlists/{playlist['id']}/tracks", json={"track_ids": ids})

    resp = auth_client.get(f"/api/playlists/{playlist['id']}/export")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("audio/x-mpegurl")
    body = resp.text
    assert body.startswith("#EXTM3U")
    assert body.count("#EXTINF:") == 2


def test_smart_playlist_rules(auth_client, tmp_path):
    build_library(tmp_path)
    configure_and_scan(auth_client, tmp_path)

    rules = {"match": "all", "rules": [{"field": "genre", "op": "contains", "value": "Rock"}]}
    created = auth_client.post(
        "/api/playlists",
        json={"name": "All Rock", "kind": "smart", "rules": rules},
    )
    assert created.status_code == 201
    playlist = created.json()
    assert playlist["kind"] == "smart"
    assert playlist["track_count"] == 2  # Red Line, Blue Shift

    rows = auth_client.get(f"/api/playlists/{playlist['id']}/tracks").json()
    assert {r["title"] for r in rows} == {"Red Line", "Blue Shift"}

    # Smart playlists reject manual track mutation
    ids = _track_ids(auth_client, 1)
    blocked = auth_client.post(
        f"/api/playlists/{playlist['id']}/tracks", json={"track_ids": ids}
    )
    assert blocked.status_code == 400


def test_smart_playlist_any_match(auth_client, tmp_path):
    build_library(tmp_path)
    configure_and_scan(auth_client, tmp_path)

    rules = {
        "match": "any",
        "rules": [
            {"field": "genre", "op": "eq", "value": "Synthwave"},
            {"field": "artist", "op": "contains", "value": "aurora"},
        ],
    }
    playlist = auth_client.post(
        "/api/playlists", json={"name": "Two Ways", "kind": "smart", "rules": rules}
    ).json()
    rows = auth_client.get(f"/api/playlists/{playlist['id']}/tracks").json()
    assert len(rows) == 3  # Night Drive + both Aurora tracks (case-insensitive)


def test_favorites_and_history(auth_client, tmp_path):
    build_library(tmp_path)
    configure_and_scan(auth_client, tmp_path)
    ids = _track_ids(auth_client)

    fav = auth_client.post(f"/api/tracks/{ids[0]}/favorite")
    assert fav.status_code == 200
    assert fav.json()["is_favorite"] is True

    favorites = auth_client.get("/api/me/favorites").json()
    assert [f["id"] for f in favorites] == [ids[0]]

    # Play tracking bumps count and populates history
    auth_client.post(f"/api/tracks/{ids[0]}/played")
    auth_client.post(f"/api/tracks/{ids[0]}/played")
    track = auth_client.get(f"/api/tracks/{ids[0]}").json()
    assert track["play_count"] == 2

    history = auth_client.get("/api/me/history").json()
    assert ids[0] in [h["id"] for h in history]

    unfav = auth_client.delete(f"/api/tracks/{ids[0]}/favorite")
    assert unfav.json()["is_favorite"] is False
    assert auth_client.get("/api/me/favorites").json() == []


def test_playlists_are_private_per_user(auth_client, tmp_path):
    build_library(tmp_path)
    configure_and_scan(auth_client, tmp_path)
    playlist = auth_client.post("/api/playlists", json={"name": "Mine"}).json()

    # Second user cannot see or touch the first user's playlist
    other = auth_client.post(
        "/api/auth/login",
        json={"username": "admin", "password": "s3cret-pass"},
    )
    # (single-user M1: simulate a second account properly)
    from app.db import SessionLocal
    from app.models import User
    from app.security import hash_password

    with SessionLocal() as db:
        db.add(User(username="spouse", password_hash=hash_password("spouse-pass1")))
        db.commit()

    auth_client.post("/api/auth/logout")
    assert auth_client.post(
        "/api/auth/login", json={"username": "spouse", "password": "spouse-pass1"}
    ).status_code == 200

    assert auth_client.get("/api/playlists").json() == []
    assert auth_client.get(f"/api/playlists/{playlist['id']}").status_code == 403
