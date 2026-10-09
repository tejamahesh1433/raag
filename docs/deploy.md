# Deploy guide

Self-host **Raag** on your LAN or at **https://music.tejainfo.xyz**.
Nothing in this guide requires paid cloud AI — Cloudflare Tunnel is free.

**Current production:** tejaserver `192.168.4.43` · user `teja` · app `~/apps/raag` ·
GitHub [tejamahesh1433/raag](https://github.com/tejamahesh1433/raag)

---

## 1. LAN only (fastest)

```bash
cd web && npm install && npm run build
cd ../server
python -m venv .venv
# Windows: .venv\Scripts\pip install -r requirements.txt
.venv/bin/pip install -r requirements.txt
MUSIC_COOKIE_SECURE=0 MUSIC_AUTH_REQUIRED=0 \
  .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8765
```

Open `http://<lan-ip>:8765`. Default is **open access** (no login).
Add library folders in the wizard or **Settings → Scan**.

Install as a PWA (“Add to Home Screen”). The service worker caches the app shell;
use **Save offline** on a track/album for offline audio.

---

## 2. Docker (LAN compose)

```bash
echo 'MUSIC_LIBRARY_HOST_PATH=/path/to/your/music' > .env
echo 'MUSIC_ADMIN_USER=teja' >> .env
echo 'MUSIC_ADMIN_PASSWORD=change-me' >> .env
echo 'MUSIC_AUTH_REQUIRED=0' >> .env

docker compose up -d --build
```

Image includes **ffmpeg** and **fpcalc** (Chromaprint) for transcoding and AcoustID.

Optional: uncomment `ollama` in `docker-compose.yml`, pull models, point Settings at
`http://ollama:11434/v1` (or host `http://127.0.0.1:11434/v1`).

---

## 3. Production — tejaserver + Cloudflare Tunnel

Used for **music.tejainfo.xyz** (no open router ports).

### Files on server

```text
~/apps/raag/                 # git clone of the repo
~/apps/raag/.env             # secrets (never commit)
~/apps/raag/library/         # music files (or bind-mount elsewhere)
docker-compose.prod.yml      # music-server + raag-cloudflared
```

### `.env` example

```bash
CLOUDFLARE_TUNNEL_TOKEN=...          # from Cloudflare Zero Trust → Tunnels
MUSIC_ADMIN_USER=teja
MUSIC_ADMIN_PASSWORD=...             # bootstrap only if DB empty
MUSIC_AUTH_REQUIRED=0                # open access (set 1 to require login)
MUSIC_LIBRARY_HOST_PATH=./library    # host path mounted at /music (read-only in container)
```

### Bring up

```bash
cd ~/apps/raag
git pull
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

- App: `http://192.168.4.43:8765` and `https://music.tejainfo.xyz`
- Tunnel hostname → `http://music-server:8765` (Docker network)
- DNS: `music.tejainfo.xyz` CNAME → `<tunnel-id>.cfargotunnel.com` (proxied)

Health: `GET /api/health` → `{"status":"ok","version":"0.3.2","apk_version":"1.0.15",...}`

### Auth note

Production compose defaults to **`MUSIC_AUTH_REQUIRED=0`**. Login UI still exists if you set `=1`.

---

## 4. Library: Windows PC → server

Raag reads music from the host path bound to `/music`.

### Auto-sync (recommended)

On the Windows machine with `D:\Music\Downloads`:

```powershell
powershell -ExecutionPolicy Bypass -File ".\scripts\install-music-sync-task.ps1"
```

Creates scheduled task **RaagMusicSync** (every 15 minutes + at logon). Incremental upload
of new/changed audio, then `POST /api/library/scan` on the server.

Manual run: `scripts\sync-music-to-server.ps1`  
Log: `%LOCALAPPDATA%\Raag\music-sync.log`

### Live SMB mount (optional)

Needs Administrator on Windows + `sudo` on the server once:

1. Run `scripts\setup-windows-music-share.ps1` elevated → share `RaagMusic`
2. On tejaserver, mount `//<windows-lan-ip>/RaagMusic` (e.g. `/mnt/raag-music`)
3. Set `MUSIC_LIBRARY_HOST_PATH=/mnt/raag-music` and recreate the container

---

## 5. Subsonic clients

Point apps (Symfonium, Amperfy, DSub, …) at:

| Field | Value |
|---|---|
| Server | `https://music.tejainfo.xyz` or `http://192.168.4.43:8765` |
| Path | `/rest` |

Supported includes browse/stream/search plus **star**, **unstar**, and **scrobble**.

---

## 5b. Mobile app updates

The server redeploy (section 3) updates the backend and web app only. The mobile app reaches phones separately:

| Change | How it reaches phones |
|---|---|
| JavaScript only (screens, store, styles) | `cd mobile && npm run update -- --message "…"` (EAS Update, channel `production`) — no rebuild |
| Native (permissions, icons, native modules) | New signed APK uploaded to the server's `downloads/` volume, then bump `APK_VERSION` in `server/app/config.py` and `APP_VERSION` in `mobile/src/api.ts` together; phones update via the in-app updater (uses `?v=<version>` query parameter and `no-cache` headers to bypass CDN caching) |
| iOS | Rebuild with Xcode or `eas build --platform ios` |

Details, rules and gotchas (runtime version, signing key, why `prebuild --clean` is dangerous): `mobile/README.md` → *Over-the-air updates*.

`/api/health` reports `apk_version` (`1.0.15`); the in-app updater compares it with the app's `APP_VERSION`. Do not bump `APK_VERSION` before the matching APK is uploaded, or every phone will be offered an update that downloads the old file.

---

## 6. Checklist after deploy

- [ ] `/api/health` OK on LAN and public URL
- [ ] Library scan finds tracks; streaming + seek work
- [ ] (Optional) Gapless / quality / Cast / Remote tried once
- [ ] (Optional) Scrobble / Discord / AcoustID keys in Settings
- [ ] (Optional) Windows sync task installed and log shows “already in sync”
- [ ] Audio files on disk remain unchanged (no tag rewrites)

---

## 7. Backups

**Settings → Backup DB** copies SQLite into the data volume.
Back up music files separately (sync script does not delete remote orphans by default).
