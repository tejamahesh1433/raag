# 🎵 Local Music Server + Free Local AI

Your music, your hardware, your private AI. A self-hosted music player that streams
your local library to any phone/tablet/browser, with an AI assistant powered entirely
by **free, local** models (Ollama or LM Studio) — **no paid services, nothing leaves
your machines.**

📄 Full spec: [`docs/specs/music-app-spec.md`](docs/specs/music-app-spec.md)

---

## What works today (M0 + M1 + M3)

- ✅ **Library scanning** — point at folders, get incremental rescans with progress
- ✅ **Browse** by tracks / albums / artists / genres + instant full-text search (SQLite FTS5)
- ✅ **Streaming** with HTTP Range (instant seeking, mobile-friendly)
- ✅ **Player** — persistent mini-player, queue, shuffle, repeat, seek, play history
- ✅ **OS media controls** — lock screen / Bluetooth via the Media Session API
- ✅ **Playlists** — manual (reorder, M3U export) and **smart rule-based** playlists
- ✅ **Favorites**, recently-played, play counts
- ✅ **Accounts** — first-run setup, login, sessions, revoke, login rate-limiting
- ✅ **Settings UI** — library folders, scan button, AI provider config, DB backup
- ✅ **Responsive PWA shell** — installable on iOS/Android/iPad
- ✅ **Single process** — the Python server also serves the built frontend
- ✅ **AI Assistant (M3)** — SSE-streaming chat that *acts* on your library via tool
  calls: search tracks, play/queue, create playlists — all through your local
  Ollama or LM Studio, with persisted per-user history and graceful "AI offline" mode

**Roadmap:** M2 remote access polish → M4 embeddings, AI playlists, lyrics/enrichment,
auto-tagging → M5 hardening. See the spec.

---

## Quick start (local / LAN)

### 1. Backend + frontend

```bash
# Frontend build (the server hosts it automatically)
cd web
npm install
npm run build

# Backend
cd ../server
python -m venv .venv
.venv/bin/pip install -r requirements.txt      # Windows: .venv\Scripts\pip
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8765
```

Open **http://127.0.0.1:8765** → first run creates the owner account →
**Settings → Library folders** → add your music directory → **Scan now**.

### 2. Docker (recommended for always-on laptops)

```bash
# Tell compose where your music lives (host path)
echo 'MUSIC_LIBRARY_HOST_PATH=/path/to/your/music' > .env
echo 'MUSIC_ADMIN_USER=teja' >> .env
echo 'MUSIC_ADMIN_PASSWORD=change-me' >> .env

docker compose up -d --build
```

Uncomment the `ollama` service in `docker-compose.yml` to run local AI beside the
server, or install Ollama/LM Studio natively and point Settings at it.

### 3. Development mode (hot reload)

```bash
# terminal 1
cd server && .venv/bin/uvicorn app.main:app --reload --port 8765
# terminal 2 (proxies /api → :8765, so session cookies work)
cd web && npm run dev
```

Open http://localhost:5173.

---

## Local AI setup (100% free)

The app talks the **OpenAI-compatible API** — both major local runtimes work:

| Runtime | Default URL | Best for |
|---|---|---|
| **Ollama** | `http://127.0.0.1:11434/v1` | headless always-on servers |
| **LM Studio** | `http://127.0.0.1:1234/v1` | desktop GUI, model browsing |
| Custom | any OpenAI-compatible `/v1` | e.g. another machine on your LAN |

Suggested models (all free): `qwen2.5:7b-instruct` (best tool-calling at size),
`llama3.1:8b`, or `qwen2.5:3b` for weak CPUs. Embeddings: `nomic-embed-text`.

```bash
ollama pull qwen2.5:7b-instruct
ollama pull nomic-embed-text
```

Configure in **Settings → Local AI**. The app *works without AI* — it degrades
gracefully and shows the provider status live.

---

## Remote access: `music.tejainfo.xyz`

1. **DNS** — create an A record `music` → your home public IP (your DNS provider for
   tejainfo.xyz). Use a DDNS updater if your IP is dynamic.
2. **Router** — forward external `443` → server `8765` (or run Caddy on the server).
3. **HTTPS** — Caddy gets a free Let's Encrypt certificate automatically:

```bash
docker compose --profile caddy up -d
```

4. **Set `MUSIC_COOKIE_SECURE=1`** once you're on HTTPS.

**If your ISP blocks ports (CGNAT), free fallbacks:** Cloudflare Tunnel
(`cloudflared tunnel`) or Tailscale Funnel — both free, both work with your domain.
See `docs/deploy.md` (coming with M2).

**Security:** login is required everywhere, cookies are httpOnly + SameSite,
rate-limited, media is served only from configured library roots by database id
(no path traversal), sessions can be revoked.

---

## Tests

```bash
# Backend — 37 integration tests through the HTTP API seam
# (incl. 9 chat tests against the fake OpenAI provider = the AI seam)
cd server && .venv/bin/pytest -q

# Frontend — player queue + SSE parser state machines
cd web && npm test

# Live smoke tests (server must be running on :8765)
cd server && .venv/bin/python tests/smoke_live.py         # library/player API
cd server && .venv/bin/python tests/smoke_chat_live.py    # real Ollama chat + tools
```

## Project layout

```
├── docs/specs/          # PRD / spec (source of truth)
├── server/              # FastAPI + SQLite (FTS5) + mutagen scanner
│   ├── app/routers/     #   auth · library · playlists · system
│   ├── app/services/    #   scanner · tags · streaming · smart_rules
│   └── tests/           #   HTTP-API seam tests + live smoke test
├── web/                 # React + TS + Tailwind v4 PWA (zustand player)
├── caddy/Caddyfile      # music.tejainfo.xyz + auto HTTPS
├── Dockerfile           # multi-stage: npm build → python runtime
└── docker-compose.yml   # one-command deploy (+ optional Ollama/Caddy)
```
