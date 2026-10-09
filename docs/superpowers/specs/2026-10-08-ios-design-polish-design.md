# iOS Design Polish — Design Spec

**Date:** 2026-10-08
**Branch:** `design/ios-polish` (from `origin/master`)
**Scope:** `mobile/` iOS only (`*.ios.tsx`, `theme/ios.ts`, new `src/ui/ios/`). No Android, server, navigation structure, or player logic changes.

## 1. Intent

Finish and unify the in-progress iOS redesign (dark, Apple Music–style glass look, accent `#ff2d55`) so the app feels consistent and complete, not to introduce a new visual direction.

Success criteria:

1. Every iOS screen uses theme tokens instead of raw colors, font sizes and radii.
2. Content never hides behind the tab bar or mini player, and no decoration blocks touches.
3. Every interactive element has a hit area of at least 44 pt, an accessibility label and a role.
4. Settings, Search and Playlists reach the same finish level as Home and Artist/Album detail.
5. Home, Now Playing and the mini player have press feedback, haptics on primary actions, and the Now Playing refinements below.
6. The app respects Dynamic Type, VoiceOver, Reduce Motion and Reduce Transparency.

Out of scope: light theme, custom fonts, Android, new features, player logic, navigation restructuring, adding a test runner.

## 2. Current state (audited 2026-10-08)

Across the 14 iOS screen/component files:

| Area | Finding |
|---|---|
| Colors | 151 raw hex/rgba literals (Home 23, Library 18, PlaylistDetail 15, NowPlaying 14, ArtistDetail 13, Search 12) |
| Type / radius | 16 raw `fontSize` vs 70 `FONT.*`; 27 raw `borderRadius` vs 62 `RADIUS.*` |
| Accessibility | 3 `accessibilityLabel`, 0 `accessibilityRole`, no `allowFontScaling` handling, no reduce-motion/transparency handling |
| Interaction | 47 `TouchableOpacity`, 0 `Pressable`, no haptics (`expo-haptics` installed) |
| States | Loading in 4 files, empty states in 3, each hand-written |
| Layout | Bottom spacing scattered: `paddingBottom` 80 / 120 / `insets.bottom + 80`; mini player hard-coded at `bottom: 82` |
| Now Playing | Artwork fixed at 300 pt (overflows small iPhones) |

Dependencies already present on `master`: `expo-blur`, `expo-linear-gradient`, `expo-haptics`, `react-native-reanimated` 4, `react-native-worklets`; Reanimated babel plugin configured.

## 3. Shared primitives (`mobile/src/ui/ios/`)

A primitive is added only if at least two screens need it.

- **Tokens** (`theme/ios.ts`): repeated glass values become named tokens (e.g. `glass.card`, `glass.rim`). Existing tokens unchanged.
- **`GlassCard`**: blur + gloss gradient + rim. Replaces hand-built copies in MiniPlayer, AlbumCard, Home hero. Decorative layers set `pointerEvents="none"`. Falls back to a solid surface under Reduce Transparency.
- **`PressableScale`**: replaces `TouchableOpacity`. Spring scale on press, optional haptic (`light` | `selection` | none), minimum 44 pt hit area via `hitSlop`, requires `accessibilityLabel` when children are not text.
- **`ScreenHeader`**: single large-title header with optional trailing action (e.g. Settings gear).
- **`StateView`**: loading / empty / error with optional retry.
- **`useA11yPrefs()`**: exposes `reduceMotion` and `reduceTransparency` (via `AccessibilityInfo`); consumed by the other primitives.
- **`useContentInset()`**: returns the bottom inset for scrollable content (tab bar height + mini player height when visible + safe area). Replaces all ad-hoc `paddingBottom` values and the hard-coded mini player offset.

## 4. Per-screen checklist ("done" definition)

1. No raw hex/rgba, `fontSize` or `borderRadius`; tokens only.
2. Uses `ScreenHeader`, `StateView`, `PressableScale` where applicable.
3. Bottom spacing from `useContentInset()`.
4. Interactive elements: label, role, ≥ 44 pt hit area.
5. Fixed heights that contain text become `minHeight`.

## 5. Hero polish

- **Haptics** only on primary actions: play/pause, next/previous, favorite (light impact); shuffle/repeat (selection). None on list rows.
- **Now Playing**: artwork scales down slightly when paused and back up on play; scrubber thumb grows while dragging, with a haptic when the seek commits; artwork sized from window width (capped at 300 pt) instead of fixed 300.
- **Mini player**: press feedback; progress bar animates smoothly rather than stepping every 500 ms.
- **Home**: existing hero parallax kept; cards get press scale; short fade-in on first load.
- New animations use Reanimated 4. Working `Animated` code is only rewritten when already being edited. All motion is disabled under Reduce Motion.

## 6. Accessibility pass

- **VoiceOver**: icon-only buttons labelled (enforced by `PressableScale`); track rows read "Title, Artist, Album" with hint "Double tap to play"; scrubber is `adjustable`, reads "1:23 of 3:45", increments/decrements ±10 s.
- **Dynamic Type**: body text scales fully; dense areas (mini player, tab labels) capped with `maxFontSizeMultiplier` ≈ 1.3.
- **Contrast**: measure `tertiaryLabel` (`#ebebf560`) on glass surfaces against 4.5:1; raise the token if it fails.
- **System preferences**: Reduce Transparency → solid surfaces; Reduce Motion → no springs, parallax or tint animation. Handled once in `useA11yPrefs()`.

## 7. Phases (one commit each, each type-checks)

0. **Snapshot**: commit the design-only subset of the user's working tree onto `design/ios-polish` (see §8). Must pass `tsc`.
1. **Foundation**: tokens, `src/ui/ios/*`, `useContentInset`. No screen changes. Includes a device/simulator build to confirm Reanimated/worklets work.
2. **Shared components**: `MiniPlayer`, `AlbumCard` onto `GlassCard` / `PressableScale`. **Pause for user review.**
3. **High-literal screens**: Home, Library, PlaylistDetail, ArtistDetail, AlbumDetail.
4. **Lightest screens, finished**: Settings, Search, Playlists, plus Favorites and Chat.
5. **Hero polish** (§5).
6. **Accessibility pass** (§6).

## 8. Handling the user's in-progress work

- Branch cut from `origin/master`, so it includes already-merged fixes.
- Snapshot includes only design files: `theme/ios.ts`, the iOS screens/components, `Navigator.ios.tsx` (user's versions, which already contain the player close-button changes).
- Excluded: `App.tsx`, `app.json`, `package.json`, `src/api.ts`, `src/store/auth.ts`, `LoginScreen.tsx` (auth/connection work), `src/store/player.ts` (`master` already has `stop()`), and `ios/` (3.3 GB untracked native build output; propose adding to `.gitignore`).
- The working tree is never overwritten. If the user keeps editing, the branch and working tree diverge; the user commits newer edits to the branch or names files to leave alone.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Blur on many list rows hurts scrolling | `GlassCard` only on headers, hero cards, mini player; never per row |
| Reanimated/worklets mismatch | Phase 1 includes a build before any migration |
| Large Dynamic Type breaks layouts | `minHeight` over fixed heights; check at largest accessibility size |
| Scope creep over 12 screens | Review checkpoint after phase 2 |

## 10. Verification

No test runner exists and adding one is out of scope.

- `tsc --noEmit` clean after every phase.
- `mobile/scripts/ui-audit.sh` (new, small bash script) counts raw literals in iOS files; the count must drop each phase and the numbers are reported.
- Manual checklist (user): VoiceOver, Dynamic Type at the largest size, Reduce Motion, Reduce Transparency, iPhone SE and Pro Max sizes. Visual quality cannot be verified from the terminal.

## 11. Rollout

PR to `master`. No server change or deploy. iOS needs a rebuild to see the result.
