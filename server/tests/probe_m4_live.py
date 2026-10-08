"""Read-mostly live probe of M4 endpoints against the running server."""
import sys

import httpx

BASE = "http://127.0.0.1:8765"


def main() -> int:
    c = httpx.Client(base_url=BASE, timeout=15.0)
    for _ in range(60):
        try:
            if c.get("/api/health").status_code == 200:
                break
        except httpx.TransportError:
            import time

            time.sleep(0.25)
    else:
        print("FAIL: server not up")
        return 1

    # Auth (works whether AUTH_REQUIRED is on or off)
    r = c.post("/api/auth/login", json={"username": "teja", "password": "demo-pass-1"})
    print(f"0) health OK, login: {r.status_code}")

    # 1) Discovery: embeddings status + library stats
    st = c.get("/api/discovery/status")
    print(f"1) discovery/status -> {st.status_code} {st.json()}")
    stats = c.get("/api/discovery/stats")
    if stats.status_code == 200:
        print(f"   discovery/stats -> {str(stats.json())[:140]}")
    else:
        print(f"   discovery/stats -> {stats.status_code} {stats.text[:100]}")

    # 2) Similar tracks for a real track (needs embeddings; 4xx acceptable = not indexed)
    tracks = c.get("/api/library/tracks?limit=1").json()
    if tracks["total"] == 0:
        print("2) library empty — skipping similar/lyrics checks")
        return 0
    tid = tracks["items"][0]["id"]
    sim = c.get(f"/api/discovery/similar/{tid}")
    print(f"2) similar/{tid} -> {sim.status_code} ({len(sim.json()) if sim.status_code == 200 else sim.json().get('detail', '')[:60]})")

    # 3) Lyrics endpoint (sidecar/cache/online depending on settings)
    ly = c.get(f"/api/tracks/{tid}/lyrics")
    if ly.status_code == 200:
        data = ly.json()
        print(f"3) lyrics -> source={data.get('source')} plain={len(data.get('plain', ''))} chars synced={len(data.get('synced') or [])}")
    else:
        print(f"3) lyrics -> {ly.status_code} (404 = none found is OK)")

    # 4) Organization: suggestions + flagged count
    sg = c.get("/api/organization/suggestions?status=pending")
    print(f"4) suggestions -> {sg.status_code} count={len(sg.json()) if sg.status_code == 200 else '?'}")

    # 5) AI playlist generation (real Ollama, may take a while)
    gen = c.post(
        "/api/playlists/ai/generate",
        json={"description": "upbeat songs to drive to", "name": "Probe Mix", "limit": 8},
        timeout=180.0,
    )
    if gen.status_code in (200, 201):
        body = gen.json()
        pl_id = body.get("id") or body.get("playlist_id")
        rows = c.get(f"/api/playlists/{pl_id}/tracks").json()
        print(f"5) AI playlist -> id={pl_id} tracks={len(rows)} rationale={str(body.get('description', ''))[:80]}")
        # cleanup probe playlist
        c.delete(f"/api/playlists/{pl_id}")
    else:
        print(f"5) AI playlist -> {gen.status_code} {gen.text[:160]}")

    print("\nM4 LIVE PROBE DONE")
    return 0


if __name__ == "__main__":
    sys.exit(main())
