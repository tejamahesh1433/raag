# Raag — local music + free local AI

**Raag** streams your private library to any phone/tablet/browser, with an optional
AI assistant powered by **Ollama or LM Studio** — no paid cloud, nothing leaves your machines.

📄 Spec: [`docs/specs/music-app-spec.md`](docs/specs/music-app-spec.md) ·
Deploy: [`docs/deploy.md`](docs/deploy.md) ·
Mobile Client: [`mobile/README.md`](mobile/README.md) ·
Design demos: [`docs/design-demos/`](docs/design-demos/)

**Version:** `1.0.15` (Server `0.3.2` · Mobile `1.0.15`)

**Live:** [https://music.tejainfo.xyz](https://music.tejainfo.xyz) · LAN `http://192.168.4.43:8765` ·
Repo: [tejamahesh1433/raag](https://github.com/tejamahesh1433/raag)

---

## What works today

### Library & playback
- ✅ **Library scanning** — folder roots, incremental rescans, content-fingerprint dedupe
- ✅ **Browse** — tracks / albums / artists / genres / years / folders / recently added & played
- ✅ **Multi-disc albums** — Disc 1 / Disc 2 section headers
- ✅ **Streaming** with HTTP Range + optional **bitrate quality** (Original / 128–320 kbps MP3 via ffmpeg)
- ✅ **Player** — mini-player, expandable Now Playing, queue, shuffle, repeat, seek, sleep timer, volume normalize, Media Session
- ✅ **Gapless / pre-buffer** + crossfade (dual-buffer Web Audio engine)
- ✅ **5-band EQ** with presets
- ✅ **Canvas spectrum visualizer** in Now Playing
- ✅ **Cast** (Chromecast) & **AirPlay** controls
- ✅ **Lyrics** — plain + synced highlight; local `.lrc` / LRCLIB

### Playlists & discovery
- ✅ **Playlists** — manual + multi-rule smart + M3U export/import + drag-reorder
- ✅ **Favorites**, play history, play counts
- ✅ **Semantic discovery** — embeddings, similar tracks, semantic search
- ✅ **Song Radio** / queue helpers (where enabled in UI)

### Integrations
- ✅ **Subsonic / OpenSubsonic** (`/rest/*`) — browse, stream, star, unstar, scrobble
- ✅ **Last.fm + ListenBrainz** scrobbling (50% or 4 minutes)
- ✅ **Discord** webhook now-playing
- ✅ **Remote / listen together** — WebSocket party codes (phone as remote)
- ✅ **AcoustID / Chromaprint** — identify untagged tracks (`fpcalc`); suggestions only, files never rewritten

### App & access
- ✅ **Open access** — no login by default (`MUSIC_AUTH_REQUIRED=0`)
- ✅ **First-run wizard** — folders → scan → AI → remote-access checklist
- ✅ **Native Mobile App (Android & iOS)** — Expo React Native client with Material Design 3 (Android) and Apple HIG (iOS)
- ✅ **In-App APK Updater** — automatic check against `/api/health`, direct download, and seamless installation
- ✅ **CDN Cache-Busting Download Page** — web download page displays version (`v1.0.15`), exact file size in MB and bytes, using `?v={version}` cache busting to bypass edge proxy caching
- ✅ **Organize** — duplicates, MusicBrainz enrichment, AcoustID scan
- ✅ **Settings** — library, schedule, transcode, AI, scrobble, Discord, AcoustID, EQ, backup/restore
- ✅ **PWA** — installable shell; **offline track/album downloads** via Cache API
- ✅ **AI Assistant** — SSE chat + tools via Ollama / LM Studio

**Raag plays your library as-is** — no DJ remixing, no automatic tag rewrites.

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

Open **http://127.0.0.1:8765** — open access, then wizard / Settings for library folders.

Optional AI:

```bash
ollama pull qwen2.5:7b-instruct
ollama pull nomic-embed-text
```

Then **Settings → Index embeddings**.

Production Docker + Cloudflare Tunnel: see [`docs/deploy.md`](docs/deploy.md).

---

## Sync music from Windows → tejaserver

On the Windows PC that holds your library (e.g. `D:\Music\Downloads`):

```powershell
# One-time: install auto-sync (every 15 min + at logon)
powershell -ExecutionPolicy Bypass -File ".\scripts\install-music-sync-task.ps1"

# Or run once manually
powershell -ExecutionPolicy Bypass -File ".\scripts\sync-music-to-server.ps1"
```

- Task name: `RaagMusicSync`
- Log: `%LOCALAPPDATA%\Raag\music-sync.log`
- Optional live SMB share (needs Admin): `scripts\setup-windows-music-share.ps1`

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
├── scripts/              # Windows → server music sync + SMB share helpers
├── docker-compose.prod.yml   # tejaserver + cloudflared
├── server/app/routers/   # auth · library · playlists · system · chat · discovery · organization · subsonic · sync
├── server/app/services/  # scanner · streaming · scrobble · acoustid · discord · …
└── web/                  # React PWA (player · remote · organize · settings)
```
