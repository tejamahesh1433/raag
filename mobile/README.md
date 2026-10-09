# Raag Mobile

React Native (Expo) client for the Raag self-hosted music server.

**Two completely distinct designs — one codebase:**

| Platform | Design language | Navigation | Key character |
|---|---|---|---|
| Android | Material Design 3, dark, rose accent | Bottom nav bar + FABs | Grid-first, card elevation, ripple feedback |
| iOS | Apple HIG, blurred surfaces, SF Symbols via Ionicons | Tab bar + sheet modals | Large titles, translucent blur, spring animations |

React Native's `.android.tsx` / `.ios.tsx` file extension convention means each platform gets its own screens, components, and navigation — zero conditional `Platform.OS` in UI code.

## Prerequisites

- Node 18+
- [Expo Go](https://expo.dev/go) on your Android/iOS device, or an emulator
- The Raag server running and reachable from your device (same WiFi, or via your domain)

## Quick start

```bash
cd mobile
npm install
npx expo start
```

Scan the QR code in Expo Go on your device.

## First-run setup

1. On the Connect screen enter your server URL. The default is `https://music.tejainfo.xyz` — change it if you self-host on a different address (e.g. `http://192.168.1.10:8765`).
2. Tap **Connect**. No username or password is required: the server runs with `AUTH_REQUIRED=0` (open access by design).

## Building for distribution

**Android build requirements:** Java 17 (Amazon Corretto 17 recommended), Gradle 9.3.1 (set in `gradle/wrapper/gradle-wrapper.properties`), minSdk 24 (Android 7+), targetSdk 36.

Do not distribute `android/app/build/outputs/apk/debug/app-debug.apk`. Debug APKs
expect a Metro development server and will show "Unable to load script" when
opened as a standalone installation.

For a locally installable standalone Android APK:

```bash
cd android
./gradlew assembleRelease
```

Install `android/app/build/outputs/apk/release/app-release.apk`.

For managed cloud builds:

```bash
# Install EAS CLI
npm install -g eas-cli

# Configure (first time)
eas build:configure

# Android APK / AAB
eas build --platform android

# iOS IPA (requires Apple Developer account)
eas build --platform ios
```

## In-app APK update flow

The `useAppUpdate` hook (in `src/hooks/useAppUpdate.ts`) checks the server for a newer APK and installs it without leaving the app:

1. **Check** — GET `/api/health`; reads `apk_version` from the response and compares it against `APP_VERSION` in `src/api.ts`.
2. **Download** — if the server version is higher, downloads `<serverUrl>/downloads/raag.apk` to the app's cache directory via `expo-file-system`.
3. **Install** — resolves a `content://` URI via `FileSystem.getContentUriAsync`, then launches the Android package installer via `expo-intent-launcher`.

Android manifest requirements (already present): `REQUEST_INSTALL_PACKAGES` permission + a `FileProvider` entry pointing at `@xml/file_provider_paths`.

## Over-the-air updates (EAS Update)

JavaScript-only changes (screens, store logic, styles) can be pushed to installed apps without building a new APK or IPA:

```bash
cd mobile
npm run update -- --message "fixed player controls"
```

This runs `eas update --channel production`. It publishes the code in your **current checkout**, so run it from a clean checkout of `master` (not a working tree with uncommitted changes).

- `app.json` configures Expo OTA updates for **iOS**.
- **Android** uses the self-hosted Raag server in-app APK updater (`expo.modules.updates.ENABLED=false` in `AndroidManifest.xml`). Android updates check `/api/health` and download directly from the server.

**Rules**

- An app only receives updates whose `runtimeVersion` matches its own. Bump `runtimeVersion` in `app.json` (and `expo_runtime_version` in `android/app/src/main/res/values/strings.xml`) whenever you add or upgrade a native dependency, then ship a new APK/IPA.
- **APKs built before this change cannot receive OTA updates** (they were built with `expo.modules.updates.ENABLED=false`). Install one OTA-enabled build once; after that JS changes can go out with `npm run update`.
- Check what an APK was built with: `aapt2 dump xmltree --file AndroidManifest.xml raag.apk | grep -A1 expo.modules.updates`.
- Native changes (new permissions, icons, native modules) still need a new APK — bump `APP_VERSION` in `src/api.ts` and `APK_VERSION` in `server/app/config.py` together when you upload it (see *In-app APK update flow*).
- **Do not run `expo prebuild --clean` casually.** It regenerates `android/` and would delete the hand-maintained `FileProvider` entry and `REQUEST_INSTALL_PACKAGES` permission that the in-app APK installer needs.
- Android release APKs must be signed with the same key as the installed app, otherwise Android rejects the update. Signing properties come from `~/.gradle/gradle.properties` (`RAAG_RELEASE_STORE_FILE`, `RAAG_RELEASE_STORE_PASSWORD`, `RAAG_RELEASE_KEY_PASSWORD`, optional `RAAG_RELEASE_KEY_ALIAS`). Never commit them.

## Project structure

```
mobile/
├── App.tsx                     ← Auth gate + platform Navigator selection
├── src/
│   ├── api.ts                  ← REST client (configurable URL, DEFAULT_SERVER_URL = https://music.tejainfo.xyz)
│   ├── types.ts                ← Shared TypeScript interfaces
│   ├── store/
│   │   ├── auth.ts             ← Auth state (Zustand)
│   │   └── player.ts           ← Audio player (expo-audio, background audio)
│   ├── hooks/
│   │   └── useAppUpdate.ts     ← In-app APK updater (checks /api/health, downloads, installs via IntentLauncher)
│   ├── theme/
│   │   ├── android.ts          ← Material Design 3 tokens
│   │   └── ios.ts              ← Apple HIG tokens
│   ├── components/
│   │   ├── Artwork.tsx         ← Shared album artwork (expo-image)
│   │   ├── TrackItem.tsx       ← Shared track row (animated playing bars)
│   │   ├── AlbumCard.android   ← Material card with ripple
│   │   ├── AlbumCard.ios       ← Borderless card with spring animation
│   │   ├── MiniPlayer.android  ← Bottom bar above tab nav
│   │   └── MiniPlayer.ios      ← Floating BlurView card
│   ├── screens/
│   │   ├── ConnectScreen.tsx   ← Server URL entry (no username/password; open-access by design)
│   │   ├── Home.*              ← Recently added, genres, hero card
│   │   ├── Library.*           ← Artists / Albums / Songs / Favorites
│   │   ├── Search.*            ← Live search + genre browse
│   │   ├── Playlists.*         ← Playlist list + create
│   │   ├── PlaylistDetail.*    ← Playlist tracks
│   │   ├── AlbumDetail.*       ← Album tracks + disc grouping
│   │   ├── ArtistDetail.*      ← Artist albums + top tracks
│   │   ├── NowPlaying.*        ← Full-screen player (modal)
│   │   └── Settings.*          ← Server URL, stream quality, in-app update; gear icon (⚙) in every tab header opens this as a modal
│   └── navigation/
│       ├── Navigator.android   ← Material bottom tabs + root stack; Settings registered in every tab stack
│       └── Navigator.ios       ← iOS tab bar + modal stack; Settings registered in every tab stack
└── assets/                     ← icon.png, splash.png, adaptive-icon.png
```

## Known limitations

- **AirPlay** is wired in `audioEngine` (web) — the mobile audio is expo-audio; AirPlay routes automatically via iOS system audio
- **Stream quality** setting in Settings stores the preference but requires restarting playback to take effect (changing the `api.streamUrl(id, quality)` call)
- **Volume slider** on iOS NowPlaying is a visual placeholder — system volume is controlled by hardware buttons (no Expo API without native modules)
- **Cast / Chromecast** is not implemented in the mobile app
