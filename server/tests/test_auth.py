"""Auth flows through the HTTP API seam."""
from conftest import ADMIN


def test_setup_required_initially(client):
    resp = client.get("/api/auth/setup-required")
    assert resp.status_code == 200
    assert resp.json()["required"] is True
    assert resp.json()["auth_required"] is True


def test_setup_creates_admin_and_session(client):
    resp = client.post("/api/auth/setup", json=ADMIN)
    assert resp.status_code == 201
    body = resp.json()
    assert body["username"] == "admin"
    assert body["is_admin"] is True

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["username"] == "admin"

    status = client.get("/api/auth/setup-required").json()
    assert status["required"] is False


def test_setup_forbidden_after_first_user(client):
    assert client.post("/api/auth/setup", json=ADMIN).status_code == 201
    second = client.post("/api/auth/setup", json={"username": "root", "password": "another-pass"})
    assert second.status_code == 403


def test_login_and_logout_roundtrip(client):
    client.post("/api/auth/setup", json=ADMIN)
    assert client.post("/api/auth/logout").status_code == 200

    # Cookie cleared -> unauthenticated
    assert client.get("/api/auth/me").status_code == 401

    ok = client.post("/api/auth/login", json=ADMIN)
    assert ok.status_code == 200
    assert client.get("/api/auth/me").status_code == 200


def test_wrong_password_rejected(client):
    client.post("/api/auth/setup", json=ADMIN)
    client.post("/api/auth/logout")
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "wrong-pass"})
    assert resp.status_code == 401


def test_unauthenticated_library_access_denied(client):
    assert client.get("/api/library/tracks").status_code == 401
    assert client.get("/api/playlists").status_code == 401
    assert client.post("/api/library/scan").status_code == 401


def test_login_rate_limit(client):
    client.post("/api/auth/setup", json=ADMIN)
    client.post("/api/auth/logout")
    for _ in range(5):
        resp = client.post("/api/auth/login", json={"username": "admin", "password": "nope-nope"})
        assert resp.status_code == 401
    blocked = client.post("/api/auth/login", json={"username": "admin", "password": "nope-nope"})
    assert blocked.status_code == 429


def test_session_revoke(client):
    client.post("/api/auth/setup", json=ADMIN)
    sessions = client.get("/api/auth/sessions").json()
    assert len(sessions) == 1
    token = sessions[0]["token"]

    assert client.delete(f"/api/auth/sessions/{token}").status_code == 200
    # Revoked server-side -> cookie no longer valid
    assert client.get("/api/auth/me").status_code == 401


def test_open_access_guest_no_login(client, monkeypatch):
    """Product default: library works without creating an account."""
    monkeypatch.setattr("app.config.AUTH_REQUIRED", False)
    status = client.get("/api/auth/setup-required").json()
    assert status["required"] is False
    assert status["auth_required"] is False

    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["username"] == "guest"
    assert me.json()["is_admin"] is True

    assert client.get("/api/library/tracks").status_code == 200
    assert client.get("/api/playlists").status_code == 200
