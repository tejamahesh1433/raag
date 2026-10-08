# iOS Design Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish and unify the in-progress iOS redesign (dark glass look, accent `#ff2d55`) with shared primitives, token-only styling, safe content insets, hero polish and an accessibility pass.

**Architecture:** A small kit in `mobile/src/ui/ios/` (pure logic in `logic.ts` tested with `node --test`; React Native components built on Reanimated 4 / expo-blur / expo-haptics) plus tokens in `theme/ios.ts`. Screens are then migrated onto the kit one at a time, each verified by `tsc` and a literal-count audit script.

**Tech Stack:** Expo / React Native 0.86, TypeScript (strict), `react-native-reanimated` 4, `expo-blur`, `expo-linear-gradient`, `expo-haptics`, `zustand`, `node:test` (Node ≥ 22.18, no new dependency).

**Spec:** `docs/superpowers/specs/2026-10-08-ios-design-polish-design.md`

**Working location:** worktree `/private/tmp/raag-design`, branch `design/ios-polish` (snapshot of the user's redesign already committed as `ece5f37`). All paths below are relative to `mobile/` unless they start with `docs/`. Do **not** touch the user's checkout at `~/Projects/raag/mobile` (it has uncommitted work).

## Global Constraints

- iOS only: edit `*.ios.tsx`, `src/theme/ios.ts`, `src/navigation/Navigator.ios.tsx`, new `src/ui/ios/*`. No Android, server, navigation structure or player-logic changes.
- No new dependencies. `expo-haptics`, `react-native-reanimated`, `react-native-worklets`, `expo-blur`, `expo-linear-gradient` are already in `package.json`.
- Minimum hit area **44 pt**; text contrast **≥ 4.5:1**; Dynamic Type cap `maxFontSizeMultiplier` **1.3** (mini player: 1.2).
- Haptics only on: play/pause, next/previous, favorite (`light`); shuffle/repeat (`selection`); scrubber seek commit (`light`). Never on list rows.
- Now Playing artwork: `min(300, windowWidth - 48)`, never below 160.
- All new motion must be disabled when Reduce Motion is on; blur must be replaced by a solid surface when Reduce Transparency is on.
- Tokens only: no raw hex/rgba, `fontSize`, or `borderRadius ≥ 6` in iOS screens/components (theme file excepted).
- `tsc` baseline: `master` already has 6 unrelated errors (`src/hooks/useAppUpdate.ts` ×4 from missing local packages, `src/navigation/Navigator.android.tsx` ×2). The bar is **no new errors**: `npx tsc --noEmit 2>&1 | grep -v "useAppUpdate\|Navigator.android"` must print nothing.
- Commit after every task with trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Do not push until the final task.

## Deviations from the spec (decided while planning)

1. `PressableScale` **always** requires `accessibilityLabel` (stricter than "when children aren't text"; simpler to enforce with the type system).
2. A `Gloss` helper (sheen + rim, no blur) is extracted from `GlassCard`, because `AlbumCard`, the Home hero and the vinyl thumbnails need sheen/rim without blur (≥ 2 users).
3. Tab-bar labels use `tabBarAllowFontScaling: false` instead of a 1.3 cap (React Navigation cannot cap, only disable).
4. `tsconfig.json` excludes `**/*.test.ts` (tests import `./x.ts` with extensions for Node).

## Review Focus

Failure modes the spec implies but a tester might miss, most likely first. Each is pinned by a test in the task named in brackets.

1. **Track has no title/artist/album, or very long names** → VoiceOver label falls back to "Unknown track"; rows still `numberOfLines={1}`. [Task 1 `trackA11yLabel`]
2. **Duration is `0`, `NaN` or `Infinity`** (stream before metadata loads) → scrubber text reads "0:00 of 0:00", seek never produces `NaN`, increments clamp to `[0, duration]`. [Task 1 `formatTime`, `scrubberValueText`, `clampSeek`]
3. **Queue cleared while a tab screen is open** → mini player disappears and the bottom inset shrinks (no phantom gap). [Task 1 `contentInset`]
4. **iPhone SE width (320 pt)** → Now Playing artwork does not overflow. [Task 1 `artworkSize`]
5. **Reduce Transparency on** → text on the solid fallback surface still meets 4.5:1, and the dim-label tokens meet it on every surface they sit on. [Task 2 contrast test]

---

### Task 1: Pure logic module and test runner

**Files:**
- Create: `src/ui/ios/logic.ts`
- Create: `src/ui/ios/logic.test.ts`
- Modify: `package.json` (add script `test:ui`)
- Modify: `tsconfig.json` (exclude tests from `tsc`)

**Interfaces:**
- Produces (all exported from `src/ui/ios/logic.ts`, no imports so Node can run it):
  - constants: `TAB_BAR_BASE_HEIGHT = 49`, `MINI_PLAYER_HEIGHT = 68`, `MINI_PLAYER_GAP = 6`, `CONTENT_GAP = 16`, `MIN_HIT = 44`
  - `parseColor(input: string): {r:number;g:number;b:number;a:number}`
  - `contrastRatio(fg: string, bg: string): number`
  - `formatTime(seconds: number): string`
  - `scrubberValueText(position: number, duration: number): string`
  - `clampSeek(position: number, delta: number, duration: number): number`
  - `artworkSize(windowWidth: number, max?: number, margin?: number): number`
  - `hitSlopFor(width: number, height: number, min?: number): {top:number;bottom:number;left:number;right:number}`
  - `contentInset(args: {safeBottom: number; hasTrack: boolean}): number`
  - `trackA11yLabel(t: {title?: string|null; artist?: string|null; album?: string|null}): string`

- [ ] **Step 1: Write the failing test**

Create `src/ui/ios/logic.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  CONTENT_GAP,
  MINI_PLAYER_GAP,
  MINI_PLAYER_HEIGHT,
  TAB_BAR_BASE_HEIGHT,
  artworkSize,
  clampSeek,
  contentInset,
  contrastRatio,
  formatTime,
  hitSlopFor,
  parseColor,
  scrubberValueText,
  trackA11yLabel,
} from "./logic.ts";

test("parseColor handles #rgb, #rrggbb, #rrggbbaa and rgba()", () => {
  assert.deepEqual(parseColor("#fff"), { r: 255, g: 255, b: 255, a: 1 });
  assert.deepEqual(parseColor("#08080c"), { r: 8, g: 8, b: 12, a: 1 });
  assert.equal(parseColor("#ebebf560").a, 0x60 / 255);
  assert.deepEqual(parseColor("rgba(255, 45, 85, 0.4)"), { r: 255, g: 45, b: 85, a: 0.4 });
  assert.throws(() => parseColor("not-a-color"));
});

test("contrastRatio matches WCAG reference values", () => {
  assert.ok(Math.abs(contrastRatio("#ffffff", "#000000") - 21) < 0.01);
  assert.ok(Math.abs(contrastRatio("#777777", "#ffffff") - 4.48) < 0.02);
  // alpha foreground is composited over the background
  assert.ok(contrastRatio("#ffffff80", "#000000") < contrastRatio("#ffffff", "#000000"));
});

test("formatTime is safe for 0, NaN, negative and Infinity", () => {
  assert.equal(formatTime(0), "0:00");
  assert.equal(formatTime(83.9), "1:23");
  assert.equal(formatTime(3600), "60:00");
  assert.equal(formatTime(NaN), "0:00");
  assert.equal(formatTime(-5), "0:00");
  assert.equal(formatTime(Infinity), "0:00");
});

test("scrubberValueText reads naturally and survives bad duration", () => {
  assert.equal(scrubberValueText(83, 225), "1:23 of 3:45");
  assert.equal(scrubberValueText(0, 0), "0:00 of 0:00");
  assert.equal(scrubberValueText(10, NaN), "0:10 of 0:00");
});

test("clampSeek stays inside [0, duration] and never returns NaN", () => {
  assert.equal(clampSeek(10, 10, 100), 20);
  assert.equal(clampSeek(95, 10, 100), 100);
  assert.equal(clampSeek(5, -10, 100), 0);
  assert.equal(clampSeek(5, 10, 0), 0);
  assert.equal(clampSeek(NaN, 10, 100), 10);
  assert.equal(clampSeek(10, 10, Infinity), 0);
});

test("artworkSize caps at 300, fits iPhone SE, and has a floor", () => {
  assert.equal(artworkSize(430), 300);
  assert.equal(artworkSize(375), 300);
  assert.equal(artworkSize(320), 272);
  assert.equal(artworkSize(100), 160);
});

test("hitSlopFor pads small targets up to 44pt and leaves big ones alone", () => {
  assert.deepEqual(hitSlopFor(24, 24), { top: 10, bottom: 10, left: 10, right: 10 });
  assert.deepEqual(hitSlopFor(60, 44), { top: 0, bottom: 0, left: 0, right: 0 });
  assert.deepEqual(hitSlopFor(23, 44), { top: 0, bottom: 0, left: 11, right: 11 });
});

test("contentInset grows only when a track is loaded", () => {
  const without = contentInset({ safeBottom: 34, hasTrack: false });
  const withTrack = contentInset({ safeBottom: 34, hasTrack: true });
  assert.equal(without, 34 + TAB_BAR_BASE_HEIGHT + CONTENT_GAP);
  assert.equal(withTrack - without, MINI_PLAYER_HEIGHT + MINI_PLAYER_GAP);
  assert.equal(contentInset({ safeBottom: 0, hasTrack: false }), TAB_BAR_BASE_HEIGHT + CONTENT_GAP);
});

test("trackA11yLabel joins present parts and falls back for empty tracks", () => {
  assert.equal(trackA11yLabel({ title: "Song", artist: "Band", album: "LP" }), "Song, Band, LP");
  assert.equal(trackA11yLabel({ title: "Song", artist: "", album: null }), "Song");
  assert.equal(trackA11yLabel({ title: "  ", artist: undefined, album: undefined }), "Unknown track");
  assert.equal(trackA11yLabel({}), "Unknown track");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /private/tmp/raag-design/mobile && node --test src/ui/ios/logic.test.ts`
Expected: FAIL — `Cannot find module './logic.ts'` (ERR_MODULE_NOT_FOUND).

- [ ] **Step 3: Write minimal implementation**

Create `src/ui/ios/logic.ts`:

```ts
// Pure helpers for the iOS UI kit. No React Native imports so `node --test` can run them.

export const TAB_BAR_BASE_HEIGHT = 49; // iOS tab bar height without the home-indicator inset
export const MINI_PLAYER_HEIGHT = 68;
export const MINI_PLAYER_GAP = 6;
export const CONTENT_GAP = 16;
export const MIN_HIT = 44;

export type RGBA = { r: number; g: number; b: number; a: number };

export function parseColor(input: string): RGBA {
  const s = input.trim().toLowerCase();
  if (s.startsWith("#")) {
    let h = s.slice(1);
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (!/^[0-9a-f]+$/.test(h) || (h.length !== 6 && h.length !== 8)) {
      throw new Error(`Bad color: ${input}`);
    }
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (!m) throw new Error(`Bad color: ${input}`);
  return { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] };
}

function channel(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function luminance(c: { r: number; g: number; b: number }): number {
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** WCAG contrast ratio. `bg` must be opaque; a translucent `fg` is composited over it. */
export function contrastRatio(fg: string, bg: string): number {
  const b = parseColor(bg);
  const f = parseColor(fg);
  const over = {
    r: f.r * f.a + b.r * (1 - f.a),
    g: f.g * f.a + b.g * (1 - f.a),
    b: f.b * f.a + b.b * (1 - f.a),
  };
  const l1 = luminance(over);
  const l2 = luminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

export function formatTime(seconds: number): string {
  const t = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

export function scrubberValueText(position: number, duration: number): string {
  const d = Number.isFinite(duration) && duration > 0 ? duration : 0;
  return `${formatTime(position)} of ${formatTime(d)}`;
}

export function clampSeek(position: number, delta: number, duration: number): number {
  const d = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const p = Number.isFinite(position) ? position : 0;
  return Math.min(d, Math.max(0, p + delta));
}

export function artworkSize(windowWidth: number, max = 300, margin = 48): number {
  return Math.max(160, Math.min(max, Math.floor(windowWidth - margin)));
}

export function hitSlopFor(width: number, height: number, min = MIN_HIT) {
  const x = Math.max(0, Math.ceil((min - width) / 2));
  const y = Math.max(0, Math.ceil((min - height) / 2));
  return { top: y, bottom: y, left: x, right: x };
}

export function contentInset({ safeBottom, hasTrack }: { safeBottom: number; hasTrack: boolean }): number {
  return (
    safeBottom +
    TAB_BAR_BASE_HEIGHT +
    CONTENT_GAP +
    (hasTrack ? MINI_PLAYER_HEIGHT + MINI_PLAYER_GAP : 0)
  );
}

export function trackA11yLabel(t: {
  title?: string | null;
  artist?: string | null;
  album?: string | null;
}): string {
  const parts = [t.title, t.artist, t.album]
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length > 0);
  return parts.length ? parts.join(", ") : "Unknown track";
}
```

- [ ] **Step 4: Add the script and exclude tests from tsc**

In `package.json` `"scripts"`, add `"test:ui": "node --test \"src/ui/ios/*.test.ts\" \"src/theme/*.test.ts\""`. In `tsconfig.json` add a top-level `"exclude": ["node_modules", "**/*.test.ts"]`.

- [ ] **Step 5: Run tests and type-check**

Run: `node --test src/ui/ios/logic.test.ts`
Expected: `# pass 9`, `# fail 0`.
Run: `ln -s ~/Projects/raag/mobile/node_modules node_modules 2>/dev/null; npx tsc --noEmit 2>&1 | grep -v "useAppUpdate\|Navigator.android"`
Expected: no output. (The `node_modules` symlink is never committed; `git status` must not list it — remove it before committing with `rm node_modules`, or add it to `.git/info/exclude` of the worktree.)

- [ ] **Step 6: Commit**

```bash
git add src/ui/ios/logic.ts src/ui/ios/logic.test.ts package.json tsconfig.json
git commit -m "feat(ios-ui): pure logic helpers with node:test coverage

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Design tokens and contrast test

**Files:**
- Modify: `src/theme/ios.ts`
- Create: `src/theme/ios.contrast.test.ts`

**Interfaces:**
- Consumes: `contrastRatio` from Task 1.
- Produces (from `theme/ios.ts`): `GLASS` (`tint`, `hairline`, `fill`, `fillStrong`, `rim`, `rimTop`, `sheen`, `sheenFade`, `accentWash`, `scrim`); `COLORS.success|warning|info|danger|placeholderGradient`; `FONT.largeTitle = 34`, `FONT.micro = 10`.

- [ ] **Step 1: Write the failing test**

Create `src/theme/ios.contrast.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { COLORS, FONT, GLASS } from "./ios.ts";
import { contrastRatio } from "../ui/ios/logic.ts";

const SURFACES = { bg: COLORS.bg, surface: COLORS.surface, surfaceSecondary: COLORS.surfaceSecondary };

function check(name: keyof typeof COLORS, fg: string, surfaces: Array<keyof typeof SURFACES>, min = 4.5) {
  for (const s of surfaces) {
    const r = contrastRatio(fg, SURFACES[s]);
    assert.ok(r >= min, `${String(name)} on ${s}: ${r.toFixed(2)} < ${min}`);
  }
}

test("primary and secondary labels meet 4.5:1 on every surface", () => {
  check("label", COLORS.label, ["bg", "surface", "surfaceSecondary"]);
  check("secondaryLabel", COLORS.secondaryLabel, ["bg", "surface", "surfaceSecondary"]);
});

test("tertiary label and muted text meet 4.5:1 on bg and surface", () => {
  check("tertiaryLabel", COLORS.tertiaryLabel, ["bg", "surface"]);
  check("muted", COLORS.muted, ["bg", "surface"]);
});

test("accent text meets 4.5:1 on bg and surface", () => {
  check("accent", COLORS.accent, ["bg", "surface"]);
});

test("new tokens exist with the agreed values", () => {
  assert.equal(FONT.largeTitle, 34);
  assert.equal(FONT.micro, 10);
  assert.equal(GLASS.rim, "rgba(255, 255, 255, 0.16)");
  assert.equal(GLASS.rimTop, "rgba(255, 255, 255, 0.42)");
  assert.equal(COLORS.success, "#30d158");
  assert.equal(COLORS.danger, "#ff375f");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test src/theme/ios.contrast.test.ts`
Expected: FAIL. Two kinds of failure are expected: `tertiaryLabel on bg: ~3.0 < 4.5` (current value `#ebebf560` is only ~38 % opaque) and the new-token assertions (`FONT.largeTitle` is `undefined`).

- [ ] **Step 3: Add the tokens and fix the failing label**

In `src/theme/ios.ts`:
- Change `tertiaryLabel: "#ebebf560"` to `tertiaryLabel: "#ebebf599"` (60 % opaque; expected ≈ 5.8:1 on `surface`).
- Add to `COLORS` (before the closing `};`):

```ts
  success: "#30d158",
  warning: "#ff9f0a",
  info: "#0a84ff",
  danger: "#ff375f",
  placeholderGradient: ["#2c2c36", "#14141a"] as const,
```
- Add to `FONT`: `largeTitle: 34,` and `micro: 10,`.
- Add after `RADIUS`:

```ts
export const GLASS = {
  tint: "rgba(24, 24, 30, 0.72)",
  hairline: "rgba(255, 255, 255, 0.08)",
  fill: "rgba(255, 255, 255, 0.12)",
  fillStrong: "rgba(255, 255, 255, 0.18)",
  rim: "rgba(255, 255, 255, 0.16)",
  rimTop: "rgba(255, 255, 255, 0.42)",
  sheen: "rgba(255, 255, 255, 0.32)",
  sheenFade: "rgba(255, 255, 255, 0.06)",
  accentWash: "rgba(255, 45, 85, 0.08)",
  scrim: "rgba(0, 0, 0, 0.45)",
} as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test src/theme/ios.contrast.test.ts`
Expected: pass. If `muted` or another token still fails, raise that token's lightness minimally until it passes and note the new value in the commit message. Do not lower the 4.5 threshold.
Run: `npx tsc --noEmit 2>&1 | grep -v "useAppUpdate\|Navigator.android"` → no output.

- [ ] **Step 5: Commit**

```bash
git add src/theme/ios.ts src/theme/ios.contrast.test.ts
git commit -m "feat(ios-ui): glass/semantic tokens; raise tertiaryLabel to pass 4.5:1

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `useA11yPrefs` and `PressableScale`

**Files:**
- Create: `src/ui/ios/useA11yPrefs.ts`
- Create: `src/ui/ios/PressableScale.tsx`

**Interfaces:**
- Consumes: `hitSlopFor` (Task 1).
- Produces:
  - `useA11yPrefs(): { reduceMotion: boolean; reduceTransparency: boolean }`
  - `PressableScale` props: `{ onPress?: (e: GestureResponderEvent) => void; accessibilityLabel: string; accessibilityRole?: AccessibilityRole /* default "button" */; accessibilityHint?: string; accessibilityState?: AccessibilityState; haptic?: "light" | "selection" | "none" /* default "none" */; scaleTo?: number /* default 0.96 */; hitSize?: { width: number; height: number }; disabled?: boolean; style?: StyleProp<ViewStyle>; children: React.ReactNode }`
  - `export type HapticKind = "light" | "selection" | "none"`

- [ ] **Step 1: Write `useA11yPrefs.ts`**

```ts
import { AccessibilityInfo } from "react-native";
import { create } from "zustand";

export interface A11yPrefs {
  reduceMotion: boolean;
  reduceTransparency: boolean;
}

const useStore = create<A11yPrefs>(() => ({ reduceMotion: false, reduceTransparency: false }));

// One subscription for the whole app (not per component).
AccessibilityInfo.isReduceMotionEnabled()
  .then((v) => useStore.setState({ reduceMotion: v }))
  .catch(() => {});
AccessibilityInfo.isReduceTransparencyEnabled()
  .then((v) => useStore.setState({ reduceTransparency: v }))
  .catch(() => {});
AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => useStore.setState({ reduceMotion: v }));
AccessibilityInfo.addEventListener("reduceTransparencyChanged", (v) =>
  useStore.setState({ reduceTransparency: v })
);

export function useA11yPrefs(): A11yPrefs {
  return useStore();
}
```

- [ ] **Step 2: Write `PressableScale.tsx`**

```tsx
import React from "react";
import {
  Pressable,
  type AccessibilityRole,
  type AccessibilityState,
  type GestureResponderEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useA11yPrefs } from "./useA11yPrefs";
import { hitSlopFor } from "./logic";

export type HapticKind = "light" | "selection" | "none";

interface Props {
  onPress?: (e: GestureResponderEvent) => void;
  accessibilityLabel: string;
  accessibilityRole?: AccessibilityRole;
  accessibilityHint?: string;
  accessibilityState?: AccessibilityState;
  haptic?: HapticKind;
  scaleTo?: number;
  hitSize?: { width: number; height: number };
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const SPRING = { damping: 15, stiffness: 300 };

function fireHaptic(kind: HapticKind) {
  if (kind === "light") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  else if (kind === "selection") Haptics.selectionAsync().catch(() => {});
}

export function PressableScale({
  onPress,
  accessibilityLabel,
  accessibilityRole = "button",
  accessibilityHint,
  accessibilityState,
  haptic = "none",
  scaleTo = 0.96,
  hitSize,
  disabled,
  style,
  children,
}: Props) {
  const { reduceMotion } = useA11yPrefs();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      accessible
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ ...accessibilityState, disabled: !!disabled }}
      disabled={disabled}
      hitSlop={hitSize ? hitSlopFor(hitSize.width, hitSize.height) : undefined}
      onPressIn={() => {
        if (!reduceMotion) scale.value = withSpring(scaleTo, SPRING);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, SPRING);
      }}
      onPress={(e) => {
        fireHaptic(haptic);
        onPress?.(e);
      }}
      style={[style, animated]}
    >
      {children}
    </AnimatedPressable>
  );
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -v "useAppUpdate\|Navigator.android"`
Expected: no output. If `Animated.createAnimatedComponent(Pressable)` complains about `style` typing, cast the style prop as `style={[style, animated] as any}` and keep the rest.

- [ ] **Step 4: Commit**

```bash
git add src/ui/ios/useA11yPrefs.ts src/ui/ios/PressableScale.tsx
git commit -m "feat(ios-ui): useA11yPrefs store and PressableScale (spring, haptics, 44pt, labels)

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `Gloss` and `GlassCard`

**Files:**
- Create: `src/ui/ios/Gloss.tsx`
- Create: `src/ui/ios/GlassCard.tsx`

**Interfaces:**
- Consumes: `GLASS`, `COLORS`, `RADIUS`, `SHADOW` (Task 2), `useA11yPrefs` (Task 3).
- Produces:
  - `Gloss({ radius: number; sheen?: boolean })` — absolutely-positioned sheen gradient + rim; both `pointerEvents="none"`. Place as the **last child** of a positioned, `overflow:"hidden"` container.
  - `GlassCard({ radius?: number /* RADIUS.xl */; intensity?: number /* 80 */; elevated?: boolean; style?: StyleProp<ViewStyle>; contentStyle?: StyleProp<ViewStyle>; children?: ReactNode })` — blur + tint + `Gloss`; solid `COLORS.surface` (no blur, no gradient sheen) when Reduce Transparency is on.

- [ ] **Step 1: Write `Gloss.tsx`**

```tsx
import React from "react";
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { GLASS } from "../../theme/ios";

export function Gloss({ radius, sheen = true }: { radius: number; sheen?: boolean }) {
  return (
    <>
      {sheen && (
        <LinearGradient
          colors={[GLASS.sheen, GLASS.sheenFade, "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.65, y: 0.65 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
      )}
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: radius, borderWidth: 1, borderColor: GLASS.rim, borderTopColor: GLASS.rimTop },
        ]}
      />
    </>
  );
}
```

- [ ] **Step 2: Write `GlassCard.tsx`**

```tsx
import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { COLORS, GLASS, RADIUS, SHADOW } from "../../theme/ios";
import { Gloss } from "./Gloss";
import { useA11yPrefs } from "./useA11yPrefs";

interface Props {
  radius?: number;
  intensity?: number;
  elevated?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

export function GlassCard({
  radius = RADIUS.xl,
  intensity = 80,
  elevated = false,
  style,
  contentStyle,
  children,
}: Props) {
  const { reduceTransparency } = useA11yPrefs();
  const shape = { borderRadius: radius };
  return (
    <View style={[shape, elevated && SHADOW.floating, style]}>
      <View
        style={[shape, styles.clip, { backgroundColor: reduceTransparency ? COLORS.surface : GLASS.tint }]}
      >
        {!reduceTransparency && (
          <BlurView tint="dark" intensity={intensity} style={StyleSheet.absoluteFill} />
        )}
        <Gloss radius={radius} sheen={!reduceTransparency} />
        <View style={contentStyle}>{children}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
});
```

Note: `Gloss` is rendered **before** content so decorations sit under it in z-order but have `pointerEvents="none"`, so they never block touches.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -v "useAppUpdate\|Navigator.android"` → no output.

- [ ] **Step 4: Commit**

```bash
git add src/ui/ios/Gloss.tsx src/ui/ios/GlassCard.tsx
git commit -m "feat(ios-ui): Gloss and GlassCard with Reduce Transparency fallback

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 5: `ScreenHeader` and `StateView`

**Files:**
- Create: `src/ui/ios/ScreenHeader.tsx`
- Create: `src/ui/ios/StateView.tsx`

**Interfaces:**
- Consumes: `PressableScale` (Task 3), tokens (Task 2).
- Produces:
  - `ScreenHeader({ title: string; trailing?: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }; style?: StyleProp<ViewStyle> })`
  - `StateView` props (discriminated union): `{ kind: "loading" } | { kind: "empty"; title: string; message?: string; icon?: keyof typeof Ionicons.glyphMap } | { kind: "error"; title?: string; message: string; onRetry?: () => void }`

- [ ] **Step 1: Write `ScreenHeader.tsx`**

```tsx
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, FONT, SPACING } from "../../theme/ios";
import { PressableScale } from "./PressableScale";

interface Props {
  title: string;
  trailing?: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void };
  style?: StyleProp<ViewStyle>;
}

export function ScreenHeader({ title, trailing, style }: Props) {
  return (
    <View style={[styles.row, style]}>
      <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={1.3} numberOfLines={1}>
        {title}
      </Text>
      {trailing && (
        <PressableScale
          onPress={trailing.onPress}
          accessibilityLabel={trailing.label}
          haptic="light"
          hitSize={{ width: 28, height: 28 }}
        >
          <Ionicons name={trailing.icon} size={24} color={COLORS.label} />
        </PressableScale>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  title: {
    flexShrink: 1,
    fontSize: FONT.largeTitle,
    fontWeight: "700",
    letterSpacing: 0.35,
    color: COLORS.label,
  },
});
```

- [ ] **Step 2: Write `StateView.tsx`**

```tsx
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { COLORS, FONT, GLASS, RADIUS, SPACING } from "../../theme/ios";
import { PressableScale } from "./PressableScale";

type Props =
  | { kind: "loading" }
  | { kind: "empty"; title: string; message?: string; icon?: keyof typeof Ionicons.glyphMap }
  | { kind: "error"; title?: string; message: string; onRetry?: () => void };

export function StateView(props: Props) {
  if (props.kind === "loading") {
    return (
      <View style={styles.center} accessibilityLabel="Loading" accessibilityRole="progressbar">
        <ActivityIndicator size="large" color={COLORS.accent} />
      </View>
    );
  }
  const isError = props.kind === "error";
  const icon = isError ? "alert-circle-outline" : props.icon ?? "musical-notes-outline";
  const title = isError ? props.title ?? "Something went wrong" : props.title;
  const message = props.message;
  return (
    <View style={styles.center}>
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={32} color={isError ? COLORS.danger : COLORS.muted} />
      </View>
      <Text style={styles.title} maxFontSizeMultiplier={1.3}>{title}</Text>
      {!!message && <Text style={styles.message} maxFontSizeMultiplier={1.3}>{message}</Text>}
      {isError && props.onRetry && (
        <PressableScale
          onPress={props.onRetry}
          accessibilityLabel="Try again"
          haptic="light"
          style={styles.retry}
        >
          <Text style={styles.retryText}>Try again</Text>
        </PressableScale>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: SPACING.xl, gap: SPACING.sm },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GLASS.hairline,
    marginBottom: SPACING.sm,
  },
  title: { fontSize: FONT.headline, fontWeight: "600", color: COLORS.label, textAlign: "center" },
  message: { fontSize: FONT.subheadline, color: COLORS.secondaryLabel, textAlign: "center" },
  retry: {
    marginTop: SPACING.md,
    minHeight: 44,
    paddingHorizontal: SPACING.lg,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.accent,
  },
  retryText: { fontSize: FONT.body, fontWeight: "600", color: COLORS.onAccent },
});
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -v "useAppUpdate\|Navigator.android"` → no output.

- [ ] **Step 4: Commit**

```bash
git add src/ui/ios/ScreenHeader.tsx src/ui/ios/StateView.tsx
git commit -m "feat(ios-ui): ScreenHeader and StateView

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `useContentInset` and mini-player placement

**Files:**
- Create: `src/ui/ios/useContentInset.ts`
- Modify: `src/navigation/Navigator.ios.tsx` (`TabsWithMiniPlayer`, `styles.miniPlayerContainer`)

**Interfaces:**
- Consumes: `contentInset`, `TAB_BAR_BASE_HEIGHT` (Task 1); `usePlayer` (existing store).
- Produces: `useContentInset(): number` — bottom padding for any scroll content inside the tab navigator.

- [ ] **Step 1: Write the hook**

```ts
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePlayer } from "../../store/player";
import { contentInset } from "./logic";

/** Bottom padding for scrollable content: safe area + tab bar + (mini player when a track is loaded). */
export function useContentInset(): number {
  const { bottom } = useSafeAreaInsets();
  const hasTrack = usePlayer((s) => s.index >= 0 && s.queue.length > 0);
  return contentInset({ safeBottom: bottom, hasTrack });
}
```

- [ ] **Step 2: Position the mini player from real metrics**

In `src/navigation/Navigator.ios.tsx`:
- add imports: `import { useSafeAreaInsets } from "react-native-safe-area-context";` and `import { TAB_BAR_BASE_HEIGHT } from "../ui/ios/logic";`
- in `TabsWithMiniPlayer`, after `const hasTrack = ...;` add `const insets = useSafeAreaInsets();`
- change `<View style={styles.miniPlayerContainer} pointerEvents="box-none">` to `<View style={[styles.miniPlayerContainer, { bottom: insets.bottom + TAB_BAR_BASE_HEIGHT }]} pointerEvents="box-none">`
- in `styles.miniPlayerContainer` delete the line `bottom: 82,`.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit 2>&1 | grep -v "useAppUpdate\|Navigator.android"` → no output.
Run: `grep -n "bottom: 82" src/navigation/Navigator.ios.tsx` → no output.

- [ ] **Step 4: Commit**

```bash
git add src/ui/ios/useContentInset.ts src/navigation/Navigator.ios.tsx
git commit -m "feat(ios-ui): useContentInset; place mini player from safe-area + tab bar height

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Audit script and baseline

**Files:**
- Create: `scripts/ui-audit.sh` (in `mobile/`)
- Create: `scripts/ui-audit.baseline.txt`

**Interfaces:**
- Produces: `scripts/ui-audit.sh` prints one `name: count` line per metric; `scripts/ui-audit.sh --lines` prints offending lines with `file:line`.

- [ ] **Step 1: Write the script**

```bash
#!/usr/bin/env bash
# Counts design-token violations in iOS UI files.
# Usage: scripts/ui-audit.sh [--lines]
set -euo pipefail
cd "$(dirname "$0")/.."

FILES="$(ls src/screens/*.ios.tsx src/components/*.ios.tsx src/navigation/Navigator.ios.tsx)"

declare -a NAMES=(color_literals fontsize_literals radius_literals touchables inset_literals a11y_labels)
declare -a PATTERNS=(
  "#[0-9a-fA-F]{3,8}[\"']|rgba?\\("
  "fontSize: [0-9]"
  "borderRadius: ([6-9]|[1-9][0-9]+)([^0-9.]|$)"
  "<TouchableOpacity|<TouchableWithoutFeedback"
  "paddingBottom: (80|1[0-9][0-9])|insets\\.bottom \\+ [0-9]"
  "accessibilityLabel"
)

for i in "${!NAMES[@]}"; do
  if [[ "${1:-}" == "--lines" && "${NAMES[$i]}" != "a11y_labels" ]]; then
    echo "== ${NAMES[$i]}"
    grep -nE "${PATTERNS[$i]}" $FILES || true
  else
    printf "%s: %s\n" "${NAMES[$i]}" "$(cat $FILES | grep -cE "${PATTERNS[$i]}" || true)"
  fi
done
```

- [ ] **Step 2: Run it and record the baseline**

Run: `chmod +x scripts/ui-audit.sh && scripts/ui-audit.sh | tee scripts/ui-audit.baseline.txt`
Expected: six `name: N` lines. `color_literals`, `fontsize_literals`, `radius_literals`, `touchables` are large (tens); `a11y_labels` is small. Keep the file — later tasks compare against it.

- [ ] **Step 3: Commit**

```bash
git add scripts/ui-audit.sh scripts/ui-audit.baseline.txt
git commit -m "chore(ios-ui): ui-audit script and baseline

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

---

## Migration recipe (referenced by Tasks 9–18)

Apply to each screen, then run **Per-screen verification** below. Line numbers in the screen tasks are from snapshot `ece5f37`; they shift as you edit — locate with the grep shown.

**R1 — Literal → token map.** Use the first matching row; if a literal has no row, add a token to `theme/ios.ts` (do not inline it). Check each color's usage before mapping.

| Literal | Token |
|---|---|
| `#ffffff`, `#fff` | `COLORS.label` (text) / `COLORS.onAccent` (on accent fill) |
| `rgba(255,255,255,0.08)` / `0.06` / `0.04` | `GLASS.hairline` |
| `rgba(255,255,255,0.12)` / `0.14` | `GLASS.fill` |
| `rgba(255,255,255,0.18)` / `0.2` / `0.22` | `GLASS.fillStrong` |
| `rgba(255,255,255,0.16)` | `GLASS.rim` |
| `rgba(255,255,255,0.35/0.36/0.38/0.4/0.42/0.45)` as a **border-top** or rim | `GLASS.rimTop` |
| `rgba(255,255,255,0.32)` as a gradient start | `GLASS.sheen` |
| `rgba(255,45,85,0.08)` | `GLASS.accentWash` |
| `rgba(0,0,0,0.45)` overlay | `GLASS.scrim` |
| `#160c1c`, `#0a0910`, `#030305`, `#140d1a`, `#1c0f24` (bg gradient) | `COLORS.bgGradient` (accepted ≤ 3 % tint change) |
| `#2c2c36`, `#14141a` | `COLORS.placeholderGradient` |
| `#30d158` / `#ff9f0a` / `#0a84ff` / `#ff375f` | `COLORS.success` / `warning` / `info` / `danger` |
| `#000` in shadows | use `SHADOW.card|gloss|floating` instead of hand-written shadow props |

Font sizes: `34→FONT.largeTitle`, `28→FONT.title1`, `26|23|22→FONT.title2`, `21|20→FONT.title3`, `12→FONT.caption`, `10→FONT.micro`.
Radii (≥ 6): `10→RADIUS.sm`, `19|20|18→RADIUS.lg`, `22|24→RADIUS.xl`, any circle (`size/2`: 36, 43, 70…) → `RADIUS.full`. Radii < 6 on thin bars (progress, handle) are exempt — write them as `height / 2`.

**R2 — Header.** Replace the local `largeTitle` `<Text>` (and its style) with:

```tsx
import { ScreenHeader } from "../ui/ios/ScreenHeader";
// …
<ScreenHeader title="Library" trailing={{ icon: "settings-outline", label: "Settings", onPress: () => navigation.navigate("Settings") }} />
```
Omit `trailing` where the screen has no action. Delete the now-unused `largeTitle` style.

**R3 — Loading / empty / error.** Replace hand-written spinners and empty views:

```tsx
import { StateView } from "../ui/ios/StateView";
{loading ? <StateView kind="loading" /> : items.length === 0
  ? <StateView kind="empty" title="No favorites yet" message="Heart your favorite songs to see them here" icon="heart-outline" />
  : /* list */}
```
Keep a `<ActivityIndicator>` only inside buttons (e.g. a send button).

**R4 — Touchables.** `TouchableOpacity` → `PressableScale` (`import { PressableScale } from "../ui/ios/PressableScale"`):
- icon-only: `<PressableScale onPress={…} accessibilityLabel="Add to playlist" hitSize={{ width: 24, height: 24 }}>` — pass the icon's rendered size;
- list rows: `accessibilityLabel={trackA11yLabel(t)}` `accessibilityHint="Double tap to play"` `scaleTo={0.98}`, **no** haptic;
- album/playlist rows or cards: `accessibilityLabel={`${title}, ${subtitle}`}`;
- `style` moves over unchanged; `activeOpacity` is dropped.

**R5 — Bottom inset.** Replace every `paddingBottom: 80|120` / `insets.bottom + N`:

```tsx
import { useContentInset } from "../ui/ios/useContentInset";
const bottomInset = useContentInset();
<FlatList contentContainerStyle={{ paddingBottom: bottomInset }} … />
```
Delete the matching static style and the now-unused `useSafeAreaInsets`.

**R6 — Text safety.** Fixed `height:` on anything containing text → `minHeight:`. Add `maxFontSizeMultiplier={1.3}` to text in dense rows (chips, pills, badges, tab-like rows).

**Per-screen verification (every screen task ends with this):**
1. `npx tsc --noEmit 2>&1 | grep -v "useAppUpdate\|Navigator.android"` → no output.
2. `scripts/ui-audit.sh --lines | grep "<screen file name>"` → no `fontSize`, `radius`, `touchables` or `inset` hits for that file; color hits only for justified exceptions (list them in the commit body).
3. `scripts/ui-audit.sh > /tmp/now.txt; diff scripts/ui-audit.baseline.txt /tmp/now.txt` → the first four counts are lower than the baseline (a11y_labels higher).
4. Commit: `git add <screen>; git commit -m "refactor(ios-ui): <Screen> onto tokens + UI kit"` (with trailer).

---

### Task 8: MiniPlayer and AlbumCard onto the kit  *(Phase 2 — then PAUSE for user review)*

**Files:**
- Modify (full replacement): `src/components/MiniPlayer.ios.tsx`
- Modify (full replacement): `src/components/AlbumCard.ios.tsx`

**Interfaces:**
- Consumes: `GlassCard`, `Gloss`, `PressableScale`, `useA11yPrefs`, `MINI_PLAYER_HEIGHT`, `MINI_PLAYER_GAP`, tokens, `usePlayer` (`queue, index, playing, position, duration, toggle, next, stop`), `api.artworkUrl`.
- Produces: `MiniPlayer({ onExpand })` and `AlbumCard({ album, onPress, style })` — same props as today, so no caller changes.

- [ ] **Step 1: Replace `MiniPlayer.ios.tsx`**

```tsx
import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { usePlayer } from "../store/player";
import { api } from "../api";
import { COLORS, FONT, GLASS, RADIUS, SHADOW, SPACING } from "../theme/ios";
import { GlassCard } from "../ui/ios/GlassCard";
import { Gloss } from "../ui/ios/Gloss";
import { PressableScale } from "../ui/ios/PressableScale";
import { useA11yPrefs } from "../ui/ios/useA11yPrefs";
import { MINI_PLAYER_GAP, MINI_PLAYER_HEIGHT } from "../ui/ios/logic";

interface Props {
  onExpand: () => void;
}

export default function MiniPlayer({ onExpand }: Props) {
  const { queue, index, playing, position, duration, toggle, next, stop } = usePlayer();
  const { reduceMotion } = useA11yPrefs();

  const track = index >= 0 ? queue[index] : null;
  const progress = duration > 0 ? Math.min(position / duration, 1) : 0;

  const fill = useSharedValue(progress);
  useEffect(() => {
    fill.value = reduceMotion ? progress : withTiming(progress, { duration: 500, easing: Easing.linear });
  }, [progress, reduceMotion, fill]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  if (!track) return null;
  const artworkUri = api.artworkUrl(track.artwork_id);

  return (
    <GlassCard
      elevated
      style={styles.wrapper}
      contentStyle={styles.card}
    >
      <View style={styles.row}>
        <PressableScale
          onPress={onExpand}
          accessibilityLabel={`${track.title}, ${track.artist}. Now playing`}
          accessibilityHint="Opens the player"
          scaleTo={0.98}
          style={styles.expand}
        >
          <View style={styles.artworkBox}>
            {artworkUri ? (
              <Image source={{ uri: artworkUri }} style={styles.artwork} contentFit="cover" />
            ) : (
              <View style={[styles.artwork, { backgroundColor: COLORS.surfaceSecondary }]} />
            )}
            <Gloss radius={RADIUS.sm} sheen={false} />
          </View>
          <View style={styles.textBlock}>
            <Text style={styles.title} numberOfLines={1} maxFontSizeMultiplier={1.2}>{track.title}</Text>
            <Text style={styles.artist} numberOfLines={1} maxFontSizeMultiplier={1.2}>{track.artist}</Text>
          </View>
        </PressableScale>

        <PressableScale
          onPress={toggle}
          accessibilityLabel={playing ? "Pause" : "Play"}
          haptic="light"
          hitSize={{ width: 36, height: 36 }}
          style={styles.playBtn}
        >
          <Ionicons name={playing ? "pause" : "play"} size={18} color={COLORS.label} />
        </PressableScale>
        <PressableScale
          onPress={next}
          accessibilityLabel="Next track"
          haptic="light"
          hitSize={{ width: 30, height: 30 }}
          style={styles.iconBtn}
        >
          <Ionicons name="play-skip-forward" size={18} color={COLORS.secondaryLabel} />
        </PressableScale>
        <PressableScale
          onPress={stop}
          accessibilityLabel="Close player"
          hitSize={{ width: 30, height: 30 }}
          style={styles.iconBtn}
        >
          <Ionicons name="close" size={18} color={COLORS.secondaryLabel} />
        </PressableScale>
      </View>

      <View style={styles.progressTrack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Animated.View style={[styles.progressFill, fillStyle]} />
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginHorizontal: SPACING.md, marginBottom: MINI_PLAYER_GAP },
  card: { height: MINI_PLAYER_HEIGHT, justifyContent: "space-between" },
  row: { flex: 1, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, gap: SPACING.sm },
  expand: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12 },
  artworkBox: { width: 44, height: 44, borderRadius: RADIUS.sm, overflow: "hidden", ...SHADOW.card },
  artwork: { width: "100%", height: "100%" },
  textBlock: { flex: 1, justifyContent: "center" },
  title: { fontSize: FONT.subheadline, fontWeight: "600", color: COLORS.label, letterSpacing: -0.2 },
  artist: { fontSize: FONT.footnote, color: COLORS.secondaryLabel, marginTop: 1 },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: RADIUS.full,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: GLASS.fill,
    borderWidth: 1,
    borderColor: GLASS.rim,
  },
  iconBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  progressTrack: { height: 3, backgroundColor: GLASS.hairline },
  progressFill: { height: 3, backgroundColor: COLORS.accent },
});
```

- [ ] **Step 2: Replace `AlbumCard.ios.tsx`**

```tsx
import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import type { Album } from "../types";
import { api } from "../api";
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from "../theme/ios";
import { Gloss } from "../ui/ios/Gloss";
import { PressableScale } from "../ui/ios/PressableScale";

interface Props {
  album: Album;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}

export default function AlbumCard({ album, onPress, style }: Props) {
  const artworkUri = api.artworkUrl(album.artwork_id);

  return (
    <PressableScale
      onPress={onPress}
      accessibilityLabel={`${album.title}, ${album.artist}`}
      accessibilityHint="Opens the album"
      scaleTo={0.94}
      style={[styles.container, style]}
    >
      <View style={styles.shadowBox}>
        <View style={styles.artworkWrapper}>
          {artworkUri ? (
            <Image source={{ uri: artworkUri }} style={styles.artwork} contentFit="cover" />
          ) : (
            <View style={styles.artwork}>
              <LinearGradient colors={COLORS.placeholderGradient} style={StyleSheet.absoluteFill} />
            </View>
          )}
          <Gloss radius={RADIUS.md} />
        </View>
      </View>
      <Text style={styles.title} numberOfLines={1} maxFontSizeMultiplier={1.3}>{album.title}</Text>
      <Text style={styles.artist} numberOfLines={1} maxFontSizeMultiplier={1.3}>{album.artist}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  shadowBox: { borderRadius: RADIUS.md, ...SHADOW.gloss, marginBottom: SPACING.xs },
  artworkWrapper: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: RADIUS.md,
    overflow: "hidden",
    backgroundColor: COLORS.surfaceSecondary,
  },
  artwork: { width: "100%", height: "100%" },
  title: {
    marginTop: 2,
    fontSize: FONT.footnote,
    fontWeight: "600",
    color: COLORS.label,
    letterSpacing: -0.2,
  },
  artist: { fontSize: FONT.footnote, color: COLORS.secondaryLabel, marginTop: 1 },
});
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit 2>&1 | grep -v "useAppUpdate\|Navigator.android"` → no output.
Run: `scripts/ui-audit.sh --lines | grep -E "MiniPlayer.ios|AlbumCard.ios"` → no output.
Check callers: `grep -rn "AlbumCard\|MiniPlayer" src --include=*.ios.tsx | grep -v "^src/components"` — props are unchanged, so no edits expected.

- [ ] **Step 4: Commit and checkpoint**

```bash
git add src/components/MiniPlayer.ios.tsx src/components/AlbumCard.ios.tsx
git commit -m "refactor(ios-ui): MiniPlayer and AlbumCard onto GlassCard/PressableScale

Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

**CHECKPOINT — stop here and ask the user to review on a device/simulator** (their `ios/` folder is not in this worktree): from a clean clone or after stashing their own work, `git fetch && git switch design/ios-polish && npm install && npx expo run:ios`. Ask them to confirm: (a) the app launches (Reanimated/worklets OK), (b) the mini player sits right above the tab bar on a notch and a non-notch device, (c) the ✕, play/pause and next buttons work, (d) album cards animate on press. Do not start Task 9 until they reply.

---

### Task 9: Home screen

**Files:** Modify `src/screens/HomeScreen.ios.tsx`

**Interfaces:** Consumes `ScreenHeader`, `StateView`, `PressableScale`, `Gloss`, `GlassCard`, `useContentInset`.

- [ ] **Step 1: Apply R1–R6.** Targets (find with grep): background gradient `colors={["#160c1c", "#0a0910", "#030305"]}` → `colors={COLORS.bgGradient}`; the animated large title (`grep -n largeTitle`) → keep the `Animated.View` opacity wrapper but render `<ScreenHeader title="Listen Now" trailing={…settings…} />` inside it; spinner (`grep -n ActivityIndicator`) and "No Music in Library" block (`grep -n emptyTitle`) → `StateView` empty with `icon="musical-notes-outline"`; hero sheen/rim (`heroRim`, the white-gradient overlay) → `<Gloss radius={RADIUS.xl} />`; vinyl rim (`vinylRim`) → `<Gloss radius={RADIUS.full} sheen={false} />`; every `TouchableOpacity` → `PressableScale` per R4; bottom padding → `useContentInset()`.
- [ ] **Step 2: Per-screen verification** (see recipe).
- [ ] **Step 3: Commit** — `refactor(ios-ui): Home onto tokens + UI kit`.

---

### Task 10: Library screen

**Files:** Modify `src/screens/LibraryScreen.ios.tsx`

- [ ] **Step 1: Apply R1–R6.** Targets: title (`grep -n largeTitle`, ~line 196) → `ScreenHeader` with the Settings gear as `trailing`; `paddingBottom: 120` at ~309 and ~313 → `useContentInset()` on each list's `contentContainerStyle`; segment/tab chips (`tabRow`): `PressableScale`, `accessibilityRole="tab"` and `accessibilityState={{ selected: isActive }}`; 18 color literals per R1.
- [ ] **Step 2: Per-screen verification.**
- [ ] **Step 3: Commit** — `refactor(ios-ui): Library onto tokens + UI kit`.

---

### Task 11: PlaylistDetail screen

**Files:** Modify `src/screens/PlaylistDetailScreen.ios.tsx`

- [ ] **Step 1: Apply R1–R6.** Targets: `paddingBottom: 120` at ~222 → `useContentInset()`; track rows → `PressableScale` with `accessibilityLabel={trackA11yLabel(t)}` (import from `../ui/ios/logic`); play/shuffle buttons keep `haptic="light"`; 15 color literals per R1.
- [ ] **Step 2: Per-screen verification.**
- [ ] **Step 3: Commit** — `refactor(ios-ui): PlaylistDetail onto tokens + UI kit`.

---

### Task 12: ArtistDetail screen

**Files:** Modify `src/screens/ArtistDetailScreen.ios.tsx`

- [ ] **Step 1: Apply R1–R6.** Targets: `contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}` (~line 75) → `{{ paddingBottom: useContentInset() }}` (hoist into a `const bottomInset`); delete the unused `useSafeAreaInsets` import; "▶ Play" / "⇌ Shuffle" buttons → `PressableScale` `haptic="light"`; top-song rows per R4; 13 color literals per R1. The glyph characters `▶`/`⇌` in button text should become `Ionicons` (`play`, `shuffle`) so VoiceOver does not read them.
- [ ] **Step 2: Per-screen verification.**
- [ ] **Step 3: Commit** — `refactor(ios-ui): ArtistDetail onto tokens + UI kit`.

---

### Task 13: AlbumDetail screen

**Files:** Modify `src/screens/AlbumDetailScreen.ios.tsx`

- [ ] **Step 1: Apply R1–R6.** Targets: root `SafeAreaView edges={["bottom"]}` stays; add `useContentInset()` to the track list; track rows per R4 with `trackA11yLabel`; the "more from artist" horizontal row (`moreScroll`) uses `AlbumCard`; literals per R1.
- [ ] **Step 2: Per-screen verification.**
- [ ] **Step 3: Commit** — `refactor(ios-ui): AlbumDetail onto tokens + UI kit`.

---

### Task 14: Settings screen *(finish)*

**Files:** Modify `src/screens/SettingsScreen.ios.tsx`

- [ ] **Step 1: Apply R1–R6.** Targets: root `SafeAreaView edges={["top","bottom"]}` is correct for the modal presentation, keep it; title → `ScreenHeader` with a trailing `close`/"Done" action (`trailing={{ icon: "close", label: "Close settings", onPress: () => navigation.goBack() }}`) so the modal can be dismissed without the swipe; rows (server URL, scan, backup, log out) → `PressableScale`, destructive "Log Out" uses `COLORS.danger`; toggles/inputs get `accessibilityLabel`; `paddingBottom: 60` → `SPACING.xl`. Keep the snapshot's `loginDirectly` adapter (`login(url, "", "")`).
- [ ] **Step 2: Per-screen verification.**
- [ ] **Step 3: Commit** — `refactor(ios-ui): Settings onto tokens + UI kit`.

---

### Task 15: Search screen *(finish)*

**Files:** Modify `src/screens/SearchScreen.ios.tsx`

- [ ] **Step 1: Apply R1–R6.** Targets: title (~line 109) → `ScreenHeader`; browse grid / genre pills → `PressableScale` with `accessibilityLabel={genre.name}`; the search `TextInput` gets `accessibilityLabel="Search music"` and `returnKeyType="search"`; spinner → `StateView kind="loading"`; no-results → `StateView kind="empty" title="No results" message="Try a different search" icon="search-outline"`; results use `trackA11yLabel`; list bottom padding via `useContentInset()`; 12 color literals per R1.
- [ ] **Step 2: Per-screen verification.**
- [ ] **Step 3: Commit** — `refactor(ios-ui): Search onto tokens + UI kit`.

---

### Task 16: Playlists screen *(finish)*

**Files:** Modify `src/screens/PlaylistsScreen.ios.tsx`

- [ ] **Step 1: Apply R1–R6.** Targets: title (~line 129) → `ScreenHeader` with trailing `add` ("New playlist"); `paddingBottom: 120` (~181) → `useContentInset()`; `paddingTop: 80` empty offset → `StateView kind="empty" title="No playlists yet" message="Create one to organize your music" icon="albums-outline"`; rows per R4 (label `${name}, ${count} songs`).
- [ ] **Step 2: Per-screen verification.**
- [ ] **Step 3: Commit** — `refactor(ios-ui): Playlists onto tokens + UI kit`.

---

### Task 17: Favorites screen

**Files:** Modify `src/screens/FavoritesScreen.ios.tsx`

- [ ] **Step 1: Apply R1–R6.** Targets: title (~line 49) → `ScreenHeader`; spinner (~54) → `StateView kind="loading"`; `ListEmptyComponent` (~62–66, "No favorites yet") → `StateView kind="empty"` as in R3 (remove `emptyContent/emptyText/emptySubtext` styles); `paddingBottom: 120` (~164) → `useContentInset()`; rows per R4 with `trackA11yLabel`; heart toggle `accessibilityLabel={`Remove ${t.title} from favorites`}`.
- [ ] **Step 2: Per-screen verification.**
- [ ] **Step 3: Commit** — `refactor(ios-ui): Favorites onto tokens + UI kit`.

---

### Task 18: Chat screen

**Files:** Modify `src/screens/ChatScreen.ios.tsx`

- [ ] **Step 1: Apply R1–R6.** Targets: title (~line 184) → `ScreenHeader`; initial spinner (~193) → `StateView kind="loading"`; the send-button spinner (~240) stays an `ActivityIndicator` (inside a button); send button → `PressableScale` `accessibilityLabel="Send message"` `haptic="light"` `hitSize` 44; message bubbles `accessible` with `accessibilityLabel={`${role === "user" ? "You" : "Assistant"}: ${text}`}`; keep the input's `SafeAreaView edges={["bottom"]}` (keyboard-aware, not tab-bar-aware, because the input sits above the keyboard); literals per R1.
- [ ] **Step 2: Per-screen verification.**
- [ ] **Step 3: Commit** — `refactor(ios-ui): Chat onto tokens + UI kit`.

---

### Task 19: Now Playing polish *(Phase 5)*

**Files:** Modify `src/screens/NowPlayingScreen.ios.tsx`

**Interfaces:** Consumes `artworkSize`, `formatTime`, `scrubberValueText`, `clampSeek`, `PressableScale`, `GLASS`, `useA11yPrefs`, Reanimated.

- [ ] **Step 1: Shared logic.** Delete the local `formatTime` function and import `{ artworkSize, clampSeek, formatTime, scrubberValueText } from "../ui/ios/logic"`.
- [ ] **Step 2: Responsive artwork.** `const { width } = useWindowDimensions(); const size = artworkSize(width);` and use `{ width: size, height: size }` for the artwork `Image`/placeholder (delete the fixed `300` from `styles.artwork`).
- [ ] **Step 3: Paused-artwork scale.**

```tsx
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
const { reduceMotion } = useA11yPrefs();
const artScale = useSharedValue(playing ? 1 : 0.88);
useEffect(() => {
  const target = playing ? 1 : 0.88;
  artScale.value = reduceMotion ? target : withSpring(target, { damping: 14, stiffness: 140 });
}, [playing, reduceMotion, artScale]);
const artStyle = useAnimatedStyle(() => ({ transform: [{ scale: artScale.value }] }));
```
Wrap the artwork shadow `View` in `<Animated.View style={artStyle}>`.
- [ ] **Step 4: Scrubber.** Inside `Scrubber`: thumb grows while `dragging` (`transform: [{ scale: dragging ? 1.4 : 1 }]` via a Reanimated `withSpring`, skipped under Reduce Motion); in `onPanResponderRelease` call `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})` before `onSeek(p)`; make the touch area accessible: `accessible accessibilityRole="adjustable" accessibilityLabel="Playback position" accessibilityValue={{ text: scrubberValueText(position, duration) }} accessibilityActions={[{ name: "increment" }, { name: "decrement" }]} onAccessibilityAction={(e) => onSeek(clampSeek(position, e.nativeEvent.actionName === "increment" ? 10 : -10, duration))}`.
- [ ] **Step 5: Transport.** Convert transport `TouchableOpacity`s to `PressableScale`: shuffle and repeat `haptic="selection"` with labels "Shuffle" / "Repeat" (and `accessibilityState={{ selected }}`), previous/next/play-pause `haptic="light"` with labels "Previous track" / "Next track" / "Play" or "Pause", favorite heart `haptic="light"` with label "Add to favorites" / "Remove from favorites". Close chevron/handle keep their labels. R1 for the 14 color literals (`rgba(0,0,0,0.45)` overlay → `GLASS.scrim`).
- [ ] **Step 6: Verify.** `npx tsc … | grep -v …` → no output; `npm run test:ui` → pass; `scripts/ui-audit.sh --lines | grep NowPlaying` → no output.
- [ ] **Step 7: Commit** — `feat(ios-ui): Now Playing polish (responsive artwork, paused scale, adjustable scrubber, haptics)`.

---

### Task 20: Home entrance and tab-bar text

**Files:** Modify `src/screens/HomeScreen.ios.tsx`, `src/navigation/Navigator.ios.tsx`

- [ ] **Step 1: Entrance.** In Home, wrap the hero card and each section in `<Animated.View entering={reduceMotion ? undefined : FadeIn.duration(250)}>` (`import Animated, { FadeIn } from "react-native-reanimated"`; name the existing RN `Animated` import `RNAnimated` or reuse the Reanimated default export where the existing code only uses `Animated.View`/`ScrollView`; do not mix both under one name). `reduceMotion` comes from `useA11yPrefs()`.
- [ ] **Step 2: Tab labels.** In `Navigator.ios.tsx` `Tab.Navigator` `screenOptions` add `tabBarAllowFontScaling: false`.
- [ ] **Step 3: Verify.** tsc clean; `scripts/ui-audit.sh` unchanged or lower.
- [ ] **Step 4: Commit** — `feat(ios-ui): Home fade-in; fixed-size tab labels`.

---

### Task 21: Accessibility pass *(Phase 6)*

**Files:** Modify any `src/screens/*.ios.tsx` / `src/components/*.ios.tsx` found by the greps below.

- [ ] **Step 1: Find leftovers.**
Run: `grep -n "TouchableOpacity\|TouchableWithoutFeedback" src/screens/*.ios.tsx src/components/*.ios.tsx` → every hit must be converted (R4).
Run: `grep -nE "^\s+(height|width): [0-9]+" src/screens/*.ios.tsx src/components/*.ios.tsx` → for each style that contains text, change `height` to `minHeight` (R6); leave image/artwork/icon boxes alone.
Run: `grep -n "<Text" src/screens/*.ios.tsx src/components/*.ios.tsx | grep -v maxFontSizeMultiplier` → add `maxFontSizeMultiplier={1.3}` to text inside chips, pills, badges and segmented controls; long-form text keeps full scaling.
- [ ] **Step 2: Decorative images hidden from VoiceOver.** Artwork `Image`s inside rows that already carry a label get `accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"` on the artwork wrapper.
- [ ] **Step 3: Verify.** tsc clean; `npm run test:ui` pass; `scripts/ui-audit.sh | diff scripts/ui-audit.baseline.txt -` shows `touchables: 0`, `a11y_labels` ≥ 40.
- [ ] **Step 4: Commit** — `feat(ios-ui): accessibility pass (labels, Dynamic Type caps, hidden decoration)`.

---

### Task 22: Final audit, cleanup, hand-off

**Files:** Modify `.gitignore` (repo root), update `scripts/ui-audit.baseline.txt` only if the user wants a new baseline.

- [ ] **Step 1: Final audit.**
Run: `scripts/ui-audit.sh`
Expected: `fontsize_literals: 0`, `radius_literals: 0`, `touchables: 0`, `inset_literals: 0`, `color_literals` ≤ 10. For each remaining color literal run `scripts/ui-audit.sh --lines` and justify it in the PR description (e.g. `"transparent"`-adjacent shadows) or add a token.
- [ ] **Step 2: Ignore native build output.** Append `mobile/ios/` and `mobile/android/build/` to the root `.gitignore` if not already ignored (`git check-ignore mobile/ios` must print the path afterwards).
- [ ] **Step 3: Full verification.**
Run: `npm run test:ui` → all pass.
Run: `npx tsc --noEmit 2>&1 | grep -v "useAppUpdate\|Navigator.android"` → no output.
- [ ] **Step 4: Commit and report.** Commit `.gitignore` (`chore: ignore native build output`). Report to the user: audit numbers before/after, the list of justified color exceptions, the manual checklist from spec §10 (VoiceOver, Dynamic Type at the largest size, Reduce Motion, Reduce Transparency, iPhone SE and Pro Max), and that visual quality could not be verified from the terminal.
- [ ] **Step 5: Hand-off (needs the user's go-ahead).** Ask before `git push origin design/ios-polish` and before opening a PR to `master`.
