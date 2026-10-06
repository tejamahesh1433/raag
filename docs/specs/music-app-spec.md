# Raag — Product Requirements Document (Spec)

**Status:** `in-progress` · **Created:** 2026-10-05 · **Updated:** 2026-10-06 · **Scope:** Local-first music server + free local AI (Ollama / LM Studio)
**Brand:** Raag · **Access:** open by default (`MUSIC_AUTH_REQUIRED=0`); audio files never rewritten
**Shipped:** M0–M5 core — scan/stream/player, playlists (manual + multi-rule smart, M3U export/import, drag-reorder), chat, embeddings, semantic search, similar tracks, plain+synced lyrics UI, genres/years/folders/recent browse, Organize (duplicates + enrichment only), wizard (incl. remote-access checklist), Media Session, open access, sleep timer, volume normalize, scheduled rescan, optional ffmpeg transcoding, queue remove/reorder, playback persistence, DB restore, album enrichment display, global keyboard shortcuts (Space/←/→/L/M)
**Out of scope (product decision):** AI DJ / For You shelf, forced login, tag file writes
**Next:** optional UX polish — DNS/Cloudflare Tunnel wizard, MusicBrainz rate-limit pacing

---

## Problem Statement

You have a large personal music collection on always-on home laptops, but no good way to enjoy it from your phone/tablet around the house or remotely. Existing streaming apps require paid services, and mainstream self-hosted players have weak or no AI. You want a fully free, local-first music experience: your files, your hardware, your private local AI — accessible from any device via `music.tejainfo.xyz`.

## Solution

A self-hosted music server that scans and streams your local library to a beautiful, installable PWA on iOS/Android/iPad, secured behind your own domain with HTTPS. An integrated AI assistant (powered by Ollama or LM Studio running locally, zero cost) that chats about your music, builds playlists from conversation, recommends tracks using semantic search over your library, fetches lyrics/artist info, and fixes messy tags — all private, all offline-capable.

## User Stories

### Playback & Library

1. As a listener, I want the server to scan my music folders, so that my whole collection appears in the app automatically.
2. As a listener, I want to browse by artist, album, genre, year, and folder, so that I can find music the way I think about it.
3. As a listener, I want instant full-text search across titles/artists/albums, so that I find any track in milliseconds.
4. As a listener, I want resume-where-I-left-off playback, so that listening feels seamless.
5. As a listener, I want a persistent mini-player visible on every screen, so that I never lose control of playback.
6. As a listener, I want a queue I can add to, reorder, shuffle, and repeat, so that I control what plays next.
7. As a listener, I want shuffle that avoids repeating recently played tracks, so that variety feels natural.
8. As a listener, I want playback to continue when the phone screen locks, via the OS media controls, so that I can control music from lock screen/Bluetooth.
9. As a listener, I want audio streamed efficiently over HTTPS with range requests, so that seeking is instant and mobile data usage is low.
10. As a listener, I want album artwork everywhere, so that browsing is visual and familiar.
11. As a listener, I want a "recently added" and "recently played" view, so that I rediscover new and old favorites.
12. As a listener, I want favorites/likes, so that the AI and playlists can learn my taste.
13. As a listener, I want a sleep timer and volume normalization option, so that listening at night is comfortable.

### Playlists

14. As a listener, I want to create, edit, and delete playlists manually, so that I can curate collections.
15. As a listener, I want smart playlists with rules (genre, rating, date added, play count), so that playlists maintain themselves.
16. As a listener, I want to drag-reorder tracks in a playlist, so that sequencing matches my intent.
17. As a listener, I want to export/import playlists (M3U), so that I'm not locked in.
18. As a listener, I want to share a playlist link with family at home, so that we enjoy the same collections.

### AI Assistant (chat)

19. As a listener, I want to chat with an AI that knows my library, so that I can ask "play something upbeat like Daft Punk" and it just works.
20. As a listener, I want the AI to actually perform actions (play, queue, create playlist, search), so that conversation controls the app.
21. As a listener, I want to ask about an artist/album ("why is this album important?") and get an answer grounded in my library plus the model's knowledge, so that listening becomes discovery.
22. As a listener, I want chat responses streamed token-by-token, so that the assistant feels alive even on slow local hardware.
23. As a listener, I want the AI to show which tracks it chose and why, so that recommendations feel transparent, not magic.
24. As a listener, I want to configure which model powers the chat vs. embeddings vs. tagging, so that weak hardware can use small models where it matters.


### AI Recommendations & Playlists

25. As a listener, I want "play something like this track/album/artist" using semantic understanding of my library, so that recommendations go beyond matching genre tags.
26. As a listener, I want mood/energy-based playlists ("calm rainy evening", "gym PR attempt"), so that music fits the moment.
27. As a listener, I want an "AI DJ" mode that builds and explains a session queue, so that long listening stays interesting.
28. As a listener, I want AI-generated playlists saved as regular editable playlists, so that I keep full control.
29. As a listener, I want the AI to learn from my skips and favorites over time (local data only), so that recommendations improve without any cloud profile.
30. As a listener, I want discovery of deep cuts and forgotten favorites in my own library, so that I use what I already own.

### AI Library Organization

31. As a collector, I want auto-tagging suggestions (fix wrong titles, missing album/genre) reviewed by me before anything is written, so that my files are never corrupted silently.
32. As a collector, I want a review queue showing before/after tag diffs, so that I approve changes in one tap.
33. As a collector, I want duplicate detection (same song, different files), so that I can clean my library safely.
34. As a collector, I want batch cleanup of inconsistent casing, featuring-artist formats, and compilation tags, so that the library looks tidy everywhere.
35. As a collector, I want tags written back to files (ID3/FLAC), so that other players also see the improvements.

### AI Enrichment

36. As a listener, I want synced/plain lyrics displayed in the player, fetched from free sources (LRCLIB) or my own `.lrc` files, so that I can sing along.
37. As a listener, I want artist bios, album notes, and genre context cached locally, so that info is available offline and private.
38. As a listener, I want "explain this song/album" notes generated by the local AI, so that I understand what I'm hearing.
39. As a collector, I want enrichment jobs to run in the background with visible progress, so that the app stays responsive.

### Access, Accounts & Security

40. As the owner, I want the app reachable at `music.tejainfo.xyz` from anywhere over HTTPS, so that my music travels with me.
41. As the owner, I want login required on the public URL, so that strangers can't play my music or touch my files.
42. As the owner, I want multiple household accounts with shared libraries but private favorites/playlists, so that the family can each have their own taste profile.
43. As the owner, I want to see active sessions and revoke them, so that I stay in control of access.
44. As the owner, I want login rate-limiting and secure session cookies, so that the public endpoint resists abuse.
45. As the owner, I want a documented free fallback (Cloudflare Tunnel/Tailscale) if my ISP blocks ports, so that remote access always works.
46. As the owner, I want library paths restricted to configured folders, so that the app can never read arbitrary disk content.

### Operations

47. As the owner, I want one-command deployment via Docker Compose on my laptop, so that setup is painless.
48. As the owner, I want health/status pages showing scanner, AI provider, storage, and stream health, so that I can debug at a glance.
49. As the owner, I want scheduled and manual rescans, so that new files appear without restarting.
50. As the owner, I want database + settings backup/restore, so that my playlists and AI data are safe.
51. As the owner, I want optional online enrichment (MusicBrainz/LRCLIB) clearly toggleable off, so that the app can run 100% air-gapped.
52. As the owner, I want the AI gateway to degrade gracefully (clear "AI offline" state) when Ollama/LM Studio is down, so that core music playback never breaks.


## Implementation Decisions

### Modules (backend)

- **Auth module:** username/password login, server-side sessions in SQLite, httpOnly secure cookies, per-user favorites/playlists/play-state; scrypt password hashing (stdlib).
- **Library module:** filesystem scanner (configured roots), tag extraction via `mutagen` (MP3/ID3, FLAC/Vorbis, M4A, OGG, WAV, Opus), artwork extraction/caching (Pillow), incremental scans by (path, size, mtime), background job queue with progress.
- **Search module:** SQLite FTS5 index over title/artist/album/genre, kept in sync with scanner.
- **Streaming module:** `GET /api/tracks/{id}/stream` with HTTP Range support; path validation strictly by DB id (no user-supplied paths); optional ffmpeg transcoding for exotic formats (phase 2).
- **Playlists module:** manual playlists, rule-based smart playlists (declarative rule language: field/operator/value with AND/OR), AI playlists that materialize into normal playlists.
- **AI Gateway module:** provider registry (`ollama` @ `:11434/v1`, `lm-studio` @ `:1234/v1`, `custom` any OpenAI-compatible URL); model discovery; per-task model routing (chat / embeddings / tagging); token streaming via SSE to the client; timeouts, retries, health checks, offline state. (M3)
- **AI Tools module:** typed tool definitions the chat model may call — `search_library`, `get_track_info`, `play_track`, `enqueue_tracks`, `create_playlist`, `get_recommendations`, `get_now_playing`, `get_artist_context` — each validated against auth + configured library roots before execution. (M3)
- **Embeddings module:** per-track embedding built from metadata, stored in SQLite (vector blobs + cosine similarity), background re-index job; used for semantic search, "like this", and mood queries. (M4)
- **Recommendations module:** hybrid — metadata similarity for candidate generation, local LLM for re-ranking and natural-language explanation; skip/favorite feedback stored per user. (M4)
- **Enrichment module:** lyrics via LRCLIB (+ local `.lrc` parsing), artist/album info via MusicBrainz; all cached in DB; LLM-generated summaries stored per album; every online call behind a settings toggle. (M4)
- **Tagging module:** low-quality metadata detector → LLM proposes corrected tags → review queue with diffs → writes via `mutagen` only on user approval; backup of original tags before write. (M4)
- **Jobs module:** single SQLite-backed background worker (scan, embeddings, enrichment, tagging batches) with progress + cancellation, surfaced in the UI.

### Modules (frontend)

- **Player feature:** persistent mini-player, full-screen player, queue drawer, Media Session integration, sleep timer.
- **Library feature:** artist/album/track/folder views, virtualized long lists, artwork grid, search-as-you-type.
- **Playlists feature:** manual editor + rule builder for smart playlists + AI playlist results.
- **Chat feature:** streaming chat panel with tool-call visualization, library-aware suggestions, per-task model display. (M3)
- **Discovery feature:** "for you" shelf, moods, AI DJ session screen. (M4)
- **Organization feature:** tag review queue (diff UI), duplicates, enrichment progress. (M4)
- **Settings feature:** library paths, AI providers/models per task, online-enrichment toggles, users/sessions, health status, backup/restore.
- **PWA shell:** manifest, service worker (app shell + artwork caching), install prompts, responsive mobile-first layouts. (M2)

### API contracts (shape, not exhaustive)

- `/api/auth/*` — login/logout/me/sessions.
- `/api/library/*` — scan, browse (artists/albums/tracks), `/tracks/{id}`, `/tracks/{id}/stream` (Range), `/artwork/{id}`.
- `/api/playlists/*` — CRUD + smart rules + `/ai/generate`.
- `/api/chat/*` — SSE streaming conversation with tool execution. (M3)
- `/api/discovery/*` — recommendations, moods, DJ sessions. (M4)
- `/api/organization/*` — tag suggestions, review/approve, duplicates, enrichment jobs/progress. (M4)
- `/api/settings/*`, `/api/health` — config + provider health.
- All mutations require an authenticated session; AI actions re-check authorization per tool call.

### Architectural decisions

- Single deployable server + static SPA; SQLite chosen over Postgres deliberately (single-household scale, trivial backup, zero ops).
- AI is strictly optional infrastructure: every feature has a non-AI fallback (search instead of semantic search, manual tagging instead of AI tagging).
- Provider-agnostic OpenAI-compatible client: Ollama and LM Studio are both first-class; multiple endpoints can coexist.
- Online data (MusicBrainz, LRCLIB) is free-tier only, cached, and user-toggleable; **no paid APIs, no telemetry, no cloud AI — ever**.
- Privacy default: browsing metadata stays home; AI never sends library data anywhere except the configured local endpoints.
- Media files are only ever addressed by database id; user-supplied filesystem paths are never opened directly (path traversal defense).

## Testing Decisions

- **What good tests look like:** tests assert externally observable behavior through the HTTP API seam only — e.g. "POST /api/playlists returns 201 and the playlist contains the requested tracks", "unauthenticated request returns 401", "Range request on /stream returns 206 with correct bytes". No tests of internal function signatures, DB models, or prompt strings.
- **The two seams:** (1) the HTTP API — all integration tests hit it with a seeded temporary music library of fixture audio files; (2) the AI provider — a fake OpenAI-compatible HTTP server makes tool-calling, streaming, timeouts, and "AI offline" behavior deterministic. One opt-in live contract test talks to real Ollama/LM Studio (auto-skipped when unreachable).
- **Modules covered:** auth (login, session, revocation, rate-limit), library (scan fixture dir → browse/search results), streaming (range correctness, path-traversal rejection), playlists (manual + smart rules + AI-materialized), AI gateway (tool calls executed, streaming re-chunked to SSE, provider-down → graceful state), organization flows (suggestion → approve → tag changed on fixture file), enrichment caching and the "online disabled" toggle.
- **Frontend:** component tests for player state machine and queue behavior with a mocked API client; Playwright e2e for core journeys (login → play → create playlist from chat → approve tag fix) against a seeded demo library with the AI stubbed.
- **Prior art:** none exists (greenfield); the API integration-test suite is the anchor every future test should imitate.

## Out of Scope

- Paid streaming services (Spotify/Apple Music) or any paid API — DRM content is fundamentally out.
- Mobile app-store distribution — PWA only.
- On-device AI on phones/tablets — clients talk to your home AI.
- Music generation, DJ mixing/beatmatching, audio effects.
- AcoustID/Chromaprint acoustic fingerprinting (candidate for a later phase).
- Multi-tenant SaaS, public sign-ups, cloud hosting of any kind.
- Video/music videos, podcasts.
- Guaranteed gapless playback perfection across all codecs (best-effort).
- Windows Store installers — deployment is Docker/native server + browser PWA.

## Further Notes

- **Sizing guidance:** a 7B q4 model needs ~5–6 GB usable RAM; laptops with 8 GB can run `qwen2.5:3b` chat + small embeddings; if one laptop is stronger, point the AI Gateway there and keep the music server elsewhere — the design makes this trivial.
- **First-run experience:** guided setup wizard (pick library folders → test AI connection with one-click model pull → DNS/remote-access checklist). (M5)
- **Data safety:** tag writes always back up original tag values in the DB first; DB backup = single file copy.
- **License posture:** everything used is free/open (FastAPI, React, Ollama, Caddy, MusicBrainz, LRCLIB) — the "no paid thing" constraint holds end to end.
- **Roadmap:** M0 scaffold → M1 core player MVP → M2 remote access + PWA → M3 AI foundation (chat + tools) → M4 AI features (embeddings, playlists, enrichment, tagging) → M5 hardening.

