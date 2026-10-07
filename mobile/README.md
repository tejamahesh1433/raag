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

1. On the Login screen enter your server URL (e.g. `http://192.168.1.10:8765` or `https://music.yoursite.com`)
2. Enter username/password (if open-access mode is on, any credentials work)
3. Tap **Connect**

## Building for distribution

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

## Project structure

```
mobile/
├── App.tsx                     ← Auth gate + platform Navigator selection
├── src/
│   ├── api.ts                  ← REST client (cookie-based auth, configurable URL)
│   ├── types.ts                ← Shared TypeScript interfaces
│   ├── store/
│   │   ├── auth.ts             ← Auth state (Zustand)
│   │   └── player.ts           ← Audio player (expo-audio, background audio)
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
│   │   ├── LoginScreen.tsx     ← Shared adaptive login
│   │   ├── Home.*              ← Recently added, genres, hero card
│   │   ├── Library.*           ← Artists / Albums / Songs / Favorites
│   │   ├── Search.*            ← Live search + genre browse
│   │   ├── Playlists.*         ← Playlist list + create
│   │   ├── PlaylistDetail.*    ← Playlist tracks
│   │   ├── AlbumDetail.*       ← Album tracks + disc grouping
│   │   ├── ArtistDetail.*      ← Artist albums + top tracks
│   │   ├── NowPlaying.*        ← Full-screen player (modal)
│   │   └── Settings.*          ← Server URL, quality, account
│   └── navigation/
│       ├── Navigator.android   ← Material bottom tabs + root stack
│       └── Navigator.ios       ← iOS tab bar + modal stack
└── assets/                     ← icon.png, splash.png, adaptive-icon.png
```

## Known limitations

- **AirPlay** is wired in `audioEngine` (web) — the mobile audio is expo-audio; AirPlay routes automatically via iOS system audio
- **Stream quality** setting in Settings stores the preference but requires restarting playback to take effect (changing the `api.streamUrl(id, quality)` call)
- **Volume slider** on iOS NowPlaying is a visual placeholder — system volume is controlled by hardware buttons (no Expo API without native modules)
- **Cast / Chromecast** is not implemented in the mobile app
