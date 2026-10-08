"""POST /api/playlists/ai/generate — NL playlist creation via the AI seam."""
from conftest import build_library, configure_and_scan, point_ai_at


def test_ai_generate_requires_auth(client, fake_provider):
    resp = client.post(
        "/api/playlists/ai/generate", json={"description": "chill evening"}
    )
    assert resp.status_code == 401


def test_ai_generate_provider_down_503(auth_client):
    point_ai_at(auth_client, "http://127.0.0.1:1/v1")
    resp = auth_client.post(
        "/api/playlists/ai/generate", json={"description": "chill evening"}
    )
    assert resp.status_code == 503
    assert "unreachable" in resp.json()["detail"].lower()


def test_ai_generate_creates_playlist(auth_client, fake_provider, tmp_path):
    build_library(tmp_path)
    configure_and_scan(auth_client, tmp_path)
    tracks = auth_client.get("/api/library/tracks?limit=100").json()["items"]
    by_title = {t["title"]: t["id"] for t in tracks}
    pick = [by_title["Red Line"], by_title["Night Drive"]]

    fake_provider.script = [
        {
            "kind": "text",
            "text": (
                '{"track_ids": [' + ", ".join(map(str, pick))
                + '], "rationale": "Night drive energy"}'
            ),
        }
    ]
    point_ai_at(auth_client, fake_provider.base_url)

    resp = auth_client.post(
        "/api/playlists/ai/generate",
        json={"description": "upbeat songs to drive to", "name": "Road Tape", "limit": 5},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["kind"] == "ai"
    assert body["name"] == "Road Tape"
    assert body["track_count"] == 2
    assert "Night drive energy" in body["description"]

    rows = auth_client.get(f"/api/playlists/{body['id']}/tracks").json()
    assert [r["id"] for r in rows] == pick

    # The model actually received the candidate list.
    sent = fake_provider.requests[0]["messages"][-1]["content"]
    assert "Candidates:" in sent and '"Red Line"' in sent


def test_ai_generate_invalid_ids_fall_back_to_keywords(auth_client, fake_provider, tmp_path):
    build_library(tmp_path)
    configure_and_scan(auth_client, tmp_path)
    # Model hallucinates ids -> keyword fallback on "rock" must rescue it.
    fake_provider.script = [
        {"kind": "text", "text": '{"track_ids": [999999], "rationale": "bad ids"}'}
    ]
    point_ai_at(auth_client, fake_provider.base_url)

    resp = auth_client.post(
        "/api/playlists/ai/generate",
        json={"description": "rock songs", "name": "Rock Rescue"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    rows = auth_client.get(f"/api/playlists/{body['id']}/tracks").json()
    titles = {r["title"] for r in rows}
    assert {"Red Line", "Blue Shift"} <= titles
    assert "keyword fallback" in body["description"]


def test_ai_generate_provider_error_502(auth_client, fake_provider, tmp_path):
    build_library(tmp_path)
    configure_and_scan(auth_client, tmp_path)
    fake_provider.script = [{"kind": "error"}]
    point_ai_at(auth_client, fake_provider.base_url)
    resp = auth_client.post(
        "/api/playlists/ai/generate", json={"description": "anything"}
    )
    assert resp.status_code == 502


def test_ai_generate_empty_library_400(auth_client, fake_provider):
    point_ai_at(auth_client, fake_provider.base_url)
    resp = auth_client.post(
        "/api/playlists/ai/generate", json={"description": "anything"}
    )
    assert resp.status_code == 400
