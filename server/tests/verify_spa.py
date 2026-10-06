"""Verify the single-process setup: SPA + API on one port."""
import re

import httpx

c = httpx.Client(base_url="http://127.0.0.1:8765", timeout=5)

r = c.get("/")
ok_root = r.status_code == 200 and '<div id="root">' in r.text
print(f"GET / -> {r.status_code} SPA: {ok_root}")

r2 = c.get("/playlists/3")
ok_deep = r2.status_code == 200 and '<div id="root">' in r2.text
print(f"GET /playlists/3 -> {r2.status_code} SPA fallback: {ok_deep}")

h = c.get("/api/health")
print(f"GET /api/health -> {h.status_code} {h.json()}")

m = re.search(r'assets/[^"]+\.js', c.get("/").text)
if m:
    r3 = c.get("/" + m.group(0))
    print(f"GET /{m.group(0)} -> {r3.status_code} {len(r3.content)} bytes")

print("GET /api/library/tracks unauth ->", c.get("/api/library/tracks").status_code)

# Re-run the full smoke test against this instance
import os
import subprocess
import sys

env = {**os.environ, "PYTHONIOENCODING": "utf-8", "PYTHONUTF8": "1"}
result = subprocess.run(
    [sys.executable, "tests/smoke_live.py"], capture_output=True, text=True, env=env, encoding="utf-8"
)
print(result.stdout)
print(result.stderr[-500:] if result.returncode else "", end="")
assert result.returncode == 0, "smoke test failed"
assert ok_root and ok_deep
print("SINGLE-PROCESS VERIFICATION PASSED")
