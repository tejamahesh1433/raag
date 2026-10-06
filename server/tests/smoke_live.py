"""End-to-end smoke test against a live server (run after starting uvicorn)."""
import sys
import time

import httpx

BASE = "http://127.0.0.1:8765"


def main() -> int:
    c = httpx.Client(base_url=BASE, timeout=10.0)
    for _ in range(40):
        try:
            if c.get("/api/health").status_code == 200:
                break
        except httpx.TransportError:
            time.sleep(0.25)
    else:
        print("FAIL: server never came up")
        return 1

    # 1. First-run setup (or login when the account already exists)
    resp = c.post("/api/auth/setup", json={"username": "teja", "password": "demo-pass-1"})
    if resp.status_code == 403:  # setup already completed on a previous run
        resp = c.post("/api/auth/login", json={"username": "teja", "password": "demo-pass-1"})
    assert resp.status_code == 200, resp.text
    me = c.get("/api/auth/me")
    assert me.status_code == 200, me.text
    print("1. auth OK:", me.json()["username"])

    # 2. Configure roots + scan
    import pathlib

    root = pathlib.Path(__file__).resolve().parent.parent.parent / "demo-library"
    r = c.put("/api/settings", json={"library_roots": [str(root.resolve())]})
    assert r.status_code == 200, r.text
    r = c.post("/api/library/scan")
    assert r.status_code == 202, r.text
    job_id = r.json()["job_id"]
    for _ in range(120):
        job = c.get(f"/api/jobs/{job_id}").json()
        if job["status"] in ("done", "error"):
            break
        time.sleep(0.1)
    print("2. scan:", job["status"], "-", job["message"])
    assert job["status"] == "done"

    # 3. Browse
    tracks = c.get("/api/library/tracks").json()
    assert tracks["total"] == 5, tracks
    artists = c.get("/api/library/artists").json()
    print(f"3. browse OK: {tracks['total']} tracks, {len(artists)} artists")

    # 4. Search (FTS)
    found = c.get("/api/library/search", params={"q": "Night Drive"}).json()
    assert any(t["title"] == "Night Drive" for t in found["tracks"])
    print("4. FTS search OK")

    # 5. Range streaming
    tid = tracks["items"][0]["id"]
    full = c.get(f"/api/tracks/{tid}/stream")
    assert full.status_code == 200, full.status_code
    part = c.get(f"/api/tracks/{tid}/stream", headers={"Range": "bytes=0-99"})
    assert part.status_code == 206, part.status_code
    assert part.content == full.content[:100]
    print(f"5. streaming OK: 200 full ({len(full.content)}B) + 206 range")

    # 6. Playlist + favorite + history
    pl = c.post("/api/playlists", json={"name": "Smoke"}).json()
    c.post(f"/api/playlists/{pl['id']}/tracks", json={"track_ids": [t["id"] for t in tracks["items"]]})
    c.post(f"/api/tracks/{tid}/favorite")
    c.post(f"/api/tracks/{tid}/played")
    assert c.get("/api/me/favorites").json()[0]["id"] == tid
    assert c.get(f"/api/playlists/{pl['id']}").json()["track_count"] == 5
    print("6. playlists + favorites + history OK")

    # 7. Health detail (AI probe — expected offline, must not crash)
    hd = c.get("/api/health/detail")
    assert hd.status_code == 200
    print("7. health detail OK, ai reachable =", hd.json()["ai"]["reachable"])

    print("\nSMOKE TEST PASSED ✅")
    return 0


if __name__ == "__main__":
    sys.exit(main())
