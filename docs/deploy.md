# Deploy guide (M2)

Self-host **Raag** on your LAN or at `music.tejainfo.xyz`.
Nothing in this guide requires paid cloud AI — optional tunnels are free.

---

## 1. LAN only (fastest)

```bash
cd web && npm install && npm run build
cd ../server
python -m venv .venv
# Windows: .venv\Scripts\pip install -r requirements.txt
.venv/bin/pip install -r requirements.txt
MUSIC_COOKIE_SECURE=0 .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8765
```

Open `http://<your-lan-ip>:8765` from phones on the same Wi‑Fi.
First visit creates the owner account → **Settings → Library folders → Scan**.

Install as a PWA from the browser (“Add to Home Screen”) — the service worker
caches the app shell for offline UI (streams still need the server).

---

## 2. Docker (always-on)

```bash
# Host path to your music library
echo 'MUSIC_LIBRARY_HOST_PATH=/path/to/your/music' > .env
echo 'MUSIC_ADMIN_USER=teja' >> .env
echo 'MUSIC_ADMIN_PASSWORD=change-me' >> .env

docker compose up -d --build
```

Optional: uncomment the `ollama` service in `docker-compose.yml`, then:

```bash
docker exec -it music-ollama ollama pull qwen2.5:7b-instruct
docker exec -it music-ollama ollama pull nomic-embed-text
```

Point **Settings → Local AI** at `http://ollama:11434/v1` inside Compose,
or `http://127.0.0.1:11434/v1` when Ollama runs on the host.

---

## 3. Public HTTPS — `music.tejainfo.xyz`

### DNS
Create an **A** record `music` → your home public IP (use DDNS if the IP moves).

### Router
Forward external **443** (and **80** for ACME) → this machine.
If Compose exposes Caddy on 80/443, forward to the host ports.

### Caddy (Let’s Encrypt, free)

Uncomment the `caddy` service in `docker-compose.yml`, then:

```bash
docker compose up -d --build
```

Set `MUSIC_COOKIE_SECURE=1` on the `music` service once HTTPS works.

`caddy/Caddyfile` already proxies to `music:8765` with HSTS headers.

### ISP blocks / CGNAT (free fallbacks)

| Option | Notes |
|---|---|
| **Cloudflare Tunnel** | `cloudflared tunnel` → no open ports; point the tunnel hostname at `http://127.0.0.1:8765` |
| **Tailscale Funnel** | Share only to your Tailnet (or public Funnel if enabled) |

Raag defaults to **open LAN access** (no login). For anything reachable beyond your home network, set `MUSIC_AUTH_REQUIRED=1` and never expose `:8765` raw without HTTPS + auth.

The in-app **Setup wizard** includes this remote-access checklist. Optional playback: install `ffmpeg` and enable **Settings → Playback / transcoding** for WMA/AIFF/WavPack streams.

---

## 4. Checklist after deploy

- [ ] App opens without a login wall (or login works if `MUSIC_AUTH_REQUIRED=1`)
- [ ] Library scan completes; tracks stream with seek
- [ ] (Optional) Scheduled rescan interval set in Settings
- [ ] (Optional) ffmpeg installed if you need exotic-format transcoding
- [ ] PWA install prompt / Add to Home Screen
- [ ] (Optional) Ollama reachable; Chat answers; **Index embeddings** in Settings
- [ ] Audio files remain unchanged on disk (no tag rewrites)

---

## 5. Backups

**Settings → Backup DB** copies the SQLite database into the data directory.
Also back up your music files separately — the server never duplicates audio.
