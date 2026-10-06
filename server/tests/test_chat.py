"""AI chat through the HTTP API seam, with the fake provider as the AI seam."""
import json

from conftest import build_library, configure_and_scan, parse_sse, point_ai_at


def _tokens(events) -> str:
    return "".join(d["text"] for e, d in events if e == "token")


def test_chat_requires_auth(client, fake_provider):
    # No login: chat must be rejected regardless of provider state.
    resp = client.post("/api/chat", json={"message": "hi"})
    assert resp.status_code == 401


def test_chat_provider_unreachable_returns_503(auth_client):
    # Point at a port where nothing listens.
    point_ai_at(auth_client, "http://127.0.0.1:1/v1")
    resp = auth_client.post("/api/chat", json={"message": "hello"})
    assert resp.status_code == 503
    assert "unreachable" in resp.json()["detail"].lower()


def test_chat_plain_answer_persists_history(auth_client, fake_provider):
    fake_provider.script = [{"kind": "text", "text": "Hello listener, nice taste."}]
    point_ai_at(auth_client, fake_provider.base_url)

    resp = auth_client.post("/api/chat", json={"message": "hi ai"})
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")

    events = parse_sse(resp.text)
    names = [e for e, _ in events]
    assert "token" in names and "done" in names
    assert "error" not in names
    assert _tokens(events) == "Hello listener, nice taste."

    history = auth_client.get("/api/chat/history").json()
    assert [m["role"] for m in history] == ["user", "assistant"]
    assert history[0]["content"] == "hi ai"
    assert history[1]["content"] == "Hello listener, nice taste."


def test_chat_tool_search_library(auth_client, fake_provider, tmp_path):
    build_library(tmp_path)
    configure_and_scan(auth_client, tmp_path)
    fake_provider.script = [
        {"kind": "tool_call", "name": "search_library", "arguments": {"query": "Rock"}},
        {"kind": "text", "text": "You have rock tracks in Concrete."},
    ]
    point_ai_at(auth_client, fake_provider.base_url)

    resp = auth_client.post("/api/chat", json={"message": "any rock music?"})
    events = parse_sse(resp.text)
    tool_events = [d for e, d in events if e == "tool"]
    assert len(tool_events) == 1
    assert tool_events[0]["name"] == "search_library"
    assert '"count": 2' in tool_events[0]["summary"]
    assert "Concrete" in _tokens(events)

    # The provider saw the tool result fed back before answering.
    requests = fake_provider.requests
    assert len(requests) == 2
    tool_msgs = [m for m in requests[1]["messages"] if m.get("role") == "tool"]
    assert len(tool_msgs) == 1
    assert json.loads(tool_msgs[0]["content"])["count"] == 2


def test_chat_play_tracks_emits_action(auth_client, fake_provider, tmp_path):
    build_library(tmp_path)
    configure_and_scan(auth_client, tmp_path)
    tracks = auth_client.get("/api/library/tracks?limit=2").json()["items"]
    ids = [t["id"] for t in tracks]

    fake_provider.script = [
        {"kind": "tool_call", "name": "play_tracks",
         "arguments": {"track_ids": ids, "mode": "replace"}},
        {"kind": "text", "text": "Playing your tracks now."},
    ]
    point_ai_at(auth_client, fake_provider.base_url)

    resp = auth_client.post("/api/chat", json={"message": "play something"})
    events = parse_sse(resp.text)
    actions = [d for e, d in events if e == "action"]
    assert len(actions) == 1
    assert actions[0]["type"] == "play"
    assert actions[0]["mode"] == "replace"
    assert [t["id"] for t in actions[0]["tracks"]] == ids
    assert _tokens(events) == "Playing your tracks now."

    done = [d for e, d in events if e == "done"][0]
    assert done["actions"][0]["type"] == "play"


def test_chat_create_playlist_actually_creates(auth_client, fake_provider, tmp_path):
    build_library(tmp_path)
    configure_and_scan(auth_client, tmp_path)
    tracks = auth_client.get("/api/library/tracks?limit=3").json()["items"]
    ids = [t["id"] for t in tracks]

    fake_provider.script = [
        {"kind": "tool_call", "name": "create_playlist",
         "arguments": {"name": "AI Mix", "track_ids": ids}},
        {"kind": "text", "text": "Created playlist AI Mix."},
    ]
    point_ai_at(auth_client, fake_provider.base_url)

    resp = auth_client.post("/api/chat", json={"message": "make me a mix"})
    events = parse_sse(resp.text)
    actions = [d for e, d in events if e == "action"]
    assert actions and actions[0]["type"] == "playlist_created"
    assert actions[0]["name"] == "AI Mix"

    playlists = auth_client.get("/api/playlists").json()
    mix = next(p for p in playlists if p["name"] == "AI Mix")
    assert mix["track_count"] == 3
    rows = auth_client.get(f"/api/playlists/{mix['id']}/tracks").json()
    assert len(rows) == 3


def test_chat_tool_error_does_not_crash_stream(auth_client, fake_provider, tmp_path):
    build_library(tmp_path)
    configure_and_scan(auth_client, tmp_path)
    fake_provider.script = [
        {"kind": "tool_call", "name": "play_tracks", "arguments": {"track_ids": [999999]}},
        {"kind": "text", "text": "Sorry, those tracks were not found."},
    ]
    point_ai_at(auth_client, fake_provider.base_url)

    resp = auth_client.post("/api/chat", json={"message": "play ids 999999"})
    events = parse_sse(resp.text)
    names = [e for e, _ in events]
    assert "error" not in names  # tool errors go back to the model, not the client
    tool_events = [d for e, d in events if e == "tool"]
    assert "Unknown track ids" in tool_events[0]["summary"]
    assert "not found" in _tokens(events)


def test_chat_provider_http_error_yields_error_event(auth_client, fake_provider):
    fake_provider.script = [{"kind": "error"}]
    point_ai_at(auth_client, fake_provider.base_url)
    resp = auth_client.post("/api/chat", json={"message": "hi"})
    events = parse_sse(resp.text)
    errors = [d for e, d in events if e == "error"]
    assert errors and "500" in errors[0]["detail"]


def test_chat_history_clear_and_scoping(auth_client, fake_provider):
    fake_provider.script = [
        {"kind": "text", "text": "one"},
        {"kind": "text", "text": "two"},
    ]
    point_ai_at(auth_client, fake_provider.base_url)
    auth_client.post("/api/chat", json={"message": "first"})
    auth_client.post("/api/chat", json={"message": "second"})
    assert len(auth_client.get("/api/chat/history").json()) == 4

    assert auth_client.delete("/api/chat/history").status_code == 200
    assert auth_client.get("/api/chat/history").json() == []

