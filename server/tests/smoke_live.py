"""End-to-end smoke test against a live server (run after starting uvicorn).

NON-DESTRUCTIVE: the demo library is added to the configured roots for the
duration of the test and the original roots are restored afterwards (with a
rescan), so running this against a production library leaves it intact.
"""
import pathlib
import sys
import time

import httpx

BASE = "http://127.0.0.1:8765"
DEMO_ROOT = pathlib.Path(__file__).resolve().parent.parent.parent / "demo-library"


def _wait_job(c: httpx.Client, job_id: int, timeout: float = 60.0) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        job = c.get(f"/api/jobs/{job_id}").json()
        if job["status"] in ("done", "error"):
            return job
        time.sleep(0.1)
    raise TimeoutError(f"job {job_id} timed out")


def _scan(c: httpx.Client) -> dict:
    resp = c.post("/api/library/scan")
    assert resp.status_code == 202, resp.text
    return _wait_job(c, resp.json()["job_id"])


def _set_roots(c: httpx.Client, roots: list) -> None:
    resp = c.put("/api/settings", json={"library_roots": roots})
    assert resp.status_code == 200, resp.text


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
    print("1. auth OK:", c.get("/api/auth/me").json()["username"])

    # 2. Preserve original roots, add demo root, scan.
    original_roots = c.get("/api/settings").json()["library_roots"]
    demo_str = str(DEMO_ROOT.resolve())
    test_roots = [r for r in original_roots if r != demo_str] + [demo_str]
    _set_roots(c, test_roots)
    job = _scan(c)
    print("2. scan:", job["status"], "-", job["message"])
    assert job["status"] == "done"

    try:
        # 3. Demo tracks present (total also includes any production tracks).
        tracks = c.get("/api/library/tracks?limit=500").json()
        titles = {t["title"] for t in tracks["items"]}
        assert {"First Light", "Red Line", "Night Drive"} <= titles, sorted(titles)[:20]
        artists = c.get("/api/library/artists").json()
        print(f"3. browse OK: {tracks['total']} tracks, {len(artists)} artists")

        # 4. Search (FTS) finds a demo track
        found = c.get("/api/library/search", params={"q": "Night Drive"}).json()
        assert any(t["title"] == "Night Drive" for t in found["tracks"])
        print("4. FTS search OK")

        # 5. Range streaming on a demo track
        demo_track = next(t for t in tracks["items"] if t["title"] == "First Light")
        tid = demo_track["id"]
        full = c.get(f"/api/tracks/{tid}/stream")
        assert full.status_code == 200, full.status_code
        part = c.get(f"/api/tracks/{tid}/stream", headers={"Range": "bytes=0-99"})
        assert part.status_code == 206, part.status_code
        assert part.content == full.content[:100]
        print(f"5. streaming OK: 200 full ({len(full.content)}B) + 206 range")

        # 6. Playlist + favorite + history (against the demo track)
        pl = c.post("/api/playlists", json={"name": "Smoke"}).json()
        c.post(f"/api/playlists/{pl['id']}/tracks", json={"track_ids": [tid]})
        c.post(f"/api/tracks/{tid}/favorite")
        c.post(f"/api/tracks/{tid}/played")
        assert any(f["id"] == tid for f in c.get("/api/me/favorites").json())
        assert c.get(f"/api/playlists/{pl['id']}").json()["track_count"] == 1
        print("6. playlists + favorites + history OK")

        # 7. Health detail (AI probe — must not crash regardless of Ollama state)
        hd = c.get("/api/health/detail")
        assert hd.status_code == 200
        print("7. health detail OK, ai reachable =", hd.json()["ai"]["reachable"])
    finally:
        # 8. RESTORE original roots and rescan — cleans demo rows, keeps prod index.
        _set_roots(c, original_roots)
        restore_job = _scan(c)
        smoke_pl = next(
            (p for p in c.get("/api/playlists").json() if p["name"] == "Smoke"), None
        )
        if smoke_pl:
            c.delete(f"/api/playlists/{smoke_pl['id']}")
        total = c.get("/api/library/tracks?limit=1").json()["total"]
        print(f"8. roots restored: {restore_job['message'][:70]} | library now {total} tracks")

    print("\nSMOKE TEST PASSED ✅")
    return 0


if __name__ == "__main__":
    sys.exit(main())
