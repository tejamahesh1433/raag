"""Live M3 test: real chat against the local Ollama instance (skip if absent)."""
import json
import sys

import httpx

BASE = "http://127.0.0.1:8765"


def parse_sse(text: str):
    events = []
    for block in text.split("\n\n"):
        if not block.strip():
            continue
        name, data = None, None
        for line in block.splitlines():
            if line.startswith("event: "):
                name = line[7:].strip()
            elif line.startswith("data: "):
                data = json.loads(line[6:])
        if name:
            events.append((name, data))
    return events


def main() -> int:
    c = httpx.Client(base_url=BASE, timeout=httpx.Timeout(300.0))
    # health
    for _ in range(40):
        try:
            if c.get("/api/health").status_code == 200:
                break
        except httpx.TransportError:
            import time

            time.sleep(0.25)
    else:
        print("FAIL: server not up")
        return 1

    c.post("/api/auth/login", json={"username": "teja", "password": "demo-pass-1"})
    detail = c.get("/api/health/detail").json()
    if not detail["ai"]["reachable"]:
        print("SKIP: Ollama not reachable")
        return 0
    models = detail["ai"]["models"]
    pick = next(
        (m for m in ("qwen2.5:7b", "qwen2.5:3b", "llama3.1:8b", "llama3.2:3b") if m in models),
        models[0],
    )
    print(f"using model: {pick}")

    # Point settings at a model that exists, then chat.
    cur = c.get("/api/settings").json()
    ai = {**cur["ai"], "chat_model": pick}
    assert c.put("/api/settings", json={"ai": ai}).status_code == 200

    # 1) plain streamed answer
    r = c.post("/api/chat", json={"message": "Reply with exactly: PONG from local AI"})
    assert r.status_code == 200, f"chat HTTP {r.status_code}: {r.text[:300]}"
    events = parse_sse(r.text)
    names = [e for e, _ in events]
    tokens = "".join(d["text"] for e, d in events if e == "token")
    print(f"1) events={names}")
    print(f"   answer: {tokens!r}")
    assert "done" in names and "error" not in names and tokens.strip(), events

    # 2) tool-calling round trip (real model decides)
    r2 = c.post("/api/chat", json={"message": "Search my library for Aurora and tell me what you find."})
    assert r2.status_code == 200, r2.text[:300]
    events2 = parse_sse(r2.text)
    tools = [d for e, d in events2 if e == "tool"]
    tokens2 = "".join(d["text"] for e, d in events2 if e == "token")
    print(f"2) tools used: {[t['name'] for t in tools]}")
    print(f"   answer: {tokens2[:200]!r}")
    assert "done" in [e for e, _ in events2]
    if tools:
        assert tools[0]["name"] == "search_library"
        print("   tool round-trip confirmed with REAL model ✅")
    else:
        print("   note: model answered without tools (still valid)")

    # history persisted
    hist = c.get("/api/chat/history").json()
    assert len(hist) >= 4, len(hist)
    print(f"3) history persisted: {len(hist)} messages")

    print("\nLIVE CHAT TEST PASSED ✅")
    return 0


if __name__ == "__main__":
    sys.exit(main())
