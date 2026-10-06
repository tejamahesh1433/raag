# Raag — local music + free local AI

**Raag** streams your private library to any phone/tablet/browser, with an optional
AI assistant powered by **Ollama or LM Studio** — no paid cloud, nothing leaves your machines.

📄 Spec: [`docs/specs/music-app-spec.md`](docs/specs/music-app-spec.md) ·
Deploy: [`docs/deploy.md`](docs/deploy.md) ·
Design demos: [`docs/design-demos/`](docs/design-demos/)

**Version:** `0.3.1`

---

## What works today

- ✅ **Library scanning** — folder roots, incremental rescans, content-fingerprint dedupe
- ✅ **Browse** — tracks / albums / artists / genres / years / folders / recently added & played
- ✅ **Streaming** with HTTP Range (seek, mobile-friendly)
- ✅ **Player** — mini-player, expandable Now Playing, queue, shuffle, repeat, seek, sleep timer, volume normalize, Media Session
- ✅ **Lyrics** — plain + **synced** highlight in Now Playing; local `.lrc` / LRCLIB
- ✅ **Semantic discovery** — embeddings index, similar tracks (in player), semantic search tab
- ✅ **Organize** — duplicates + MusicBrainz enrichment (**audio files never rewritten**)
- ✅ **First-run wizard** — folders → scan → AI → remote-access checklist
- ✅ **Playlists** — manual + multi-rule smart + M3U export/import + drag-reorder
- ✅ **Favorites**, play history, play counts
- ✅ **Open access** — no login by default (optional `MUSIC_AUTH_REQUIRED=1`)
- ✅ **Settings** — library, scheduled rescan, ffmpeg transcode toggle, AI, embeddings, backup
- ✅ **PWA** — installable shell + service worker
- ✅ **AI Assistant** — SSE chat + tools via Ollama / LM Studio

**Raag plays your library as-is** — no DJ remixing, no automatic tag rewrites.

### Still open (nice-to-have)

Nothing blocking for household LAN use. Optional later: richer Cloudflare one-click helpers, landscape-only player polish.

Intentionally **not** building: AI DJ / For You shelf, forced login, tag file writes.

---

## Quick start (local / LAN)

```bash
cd web && npm install && npm run build
cd ../server
python -m venv .venv
.venv/bin/pip install -r requirements.txt      # Windows: .venv\Scripts\pip
.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8765
```

Open **http://127.0.0.1:8765** — open access, then guided wizard if no library folders yet (or Settings).

Optional AI:

```bash
ollama pull qwen2.5:7b-instruct
ollama pull nomic-embed-text
```

Then **Settings → Index embeddings**.

Docker / HTTPS: see [`docs/deploy.md`](docs/deploy.md).

---

## Tests

```bash
cd server && .venv/bin/pytest -q
cd web && npm test
```

---

## Project layout

```
├── docs/specs/ · docs/deploy.md · docs/design-demos/
├── server/app/routers/   # auth · library · playlists · system · chat · discovery · organization
├── server/app/services/  # scanner · tags · embeddings · lyrics · enrichment · duplicates
└── web/                  # React PWA (wizard · organize · now playing · semantic search)
```
