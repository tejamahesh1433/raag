import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  GestureResponderEvent,
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../api";
import { usePlayer } from "../store/player";
import type { RepeatMode } from "../store/player";
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from "../theme/ios";

interface Props {
  navigation: NativeStackNavigationProp<any>;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function repeatIcon(mode: RepeatMode): keyof typeof Ionicons.glyphMap {
  return mode !== "none" ? "repeat" : "repeat-outline";
}

function Scrubber({
  position,
  duration,
  onSeek,
}: {
  position: number;
  duration: number;
  onSeek: (s: number) => void;
}) {
  const containerRef = useRef<View>(null);
  const layoutRef = useRef({ pageX: 0, width: 1 });
  const [dragging, setDragging] = useState(false);
  const [dragPos, setDragPos] = useState(0);

  function measureLayout() {
    containerRef.current?.measure((_x, _y, width, _height, pageX) => {
      if (width > 0) {
        layoutRef.current = { pageX, width };
      }
    });
  }

  function posFromPageX(pageX: number) {
    const { pageX: startX, width } = layoutRef.current;
    const clampedX = Math.max(0, Math.min(pageX - startX, width));
    return (clampedX / Math.max(width, 1)) * Math.max(duration, 1);
  }

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onStartShouldSetPanResponderCapture: () => true,
      onMoveShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponderCapture: () => true,
      onPanResponderGrant: (e) => {
        setDragging(true);
        measureLayout();
        const p = posFromPageX(e.nativeEvent.pageX);
        setDragPos(p);
      },
      onPanResponderMove: (e) => {
        const p = posFromPageX(e.nativeEvent.pageX);
        setDragPos(p);
      },
      onPanResponderRelease: (e) => {
        const p = posFromPageX(e.nativeEvent.pageX);
        setDragging(false);
        onSeek(p);
      },
      onPanResponderTerminate: () => setDragging(false),
    })
  ).current;

  const displayPos = dragging ? dragPos : position;
  const progress = Math.min(Math.max(0, displayPos) / Math.max(duration, 1), 1);

  return (
    <View style={scrubStyles.container}>
      <View
        ref={containerRef}
        style={scrubStyles.touchArea}
        onLayout={measureLayout}
        {...panResponder.panHandlers}
      >
        <View style={scrubStyles.track}>
          <View style={[scrubStyles.fill, { width: `${progress * 100}%` }]} />
          <View style={[scrubStyles.thumb, { left: `${progress * 100}%` as any }]} />
        </View>
      </View>
      <View style={scrubStyles.timeRow}>
        <Text style={scrubStyles.time}>{formatTime(displayPos)}</Text>
        <Text style={scrubStyles.time}>-{formatTime(Math.max(duration - displayPos, 0))}</Text>
      </View>
    </View>
  );
}

const scrubStyles = StyleSheet.create({
  container: {
    paddingHorizontal: SPACING.xl,
    marginTop: SPACING.md,
  },
  touchArea: {
    height: 40,
    justifyContent: "center",
  },
  track: {
    height: 5,
    backgroundColor: "rgba(255, 255, 255, 0.16)",
    borderRadius: 2.5,
    justifyContent: "center",
    position: "relative",
  },
  fill: {
    height: 5,
    backgroundColor: COLORS.accent,
    borderRadius: 2.5,
    position: "absolute",
    left: 0,
    top: 0,
    shadowColor: COLORS.accent,
    shadowOpacity: 0.85,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  thumb: {
    position: "absolute",
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#ffffff",
    marginLeft: -9,
    top: -6.5,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.9)",
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  time: {
    fontSize: FONT.caption,
    fontWeight: "500",
    color: "rgba(255, 255, 255, 0.65)",
    fontVariant: ["tabular-nums"],
  },
});

export default function NowPlayingScreen({ navigation }: Props) {
  const {
    queue, index, playing, position, duration,
    repeat, shuffle,
    toggle, next, prev, seekTo, jumpTo,
    toggleShuffle, cycleRepeat, toggleFavorite,
  } = usePlayer();

  const [showQueue, setShowQueue] = useState(false);

  const track = index >= 0 ? queue[index] : null;
  const artworkUri = track ? api.artworkUrl(track.artwork_id) : null;

  const repeatColor = repeat !== "none" ? COLORS.accent : COLORS.muted;
  const shuffleColor = shuffle ? COLORS.accent : COLORS.muted;

  // Swipe down anywhere to minimize. Children (scrubber, queue list) get first
  // claim on touches; we only take over clear downward vertical drags.
  const translateY = useRef(new Animated.Value(0)).current;
  const navRef = useRef(navigation);
  navRef.current = navigation;

  const dismissPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) =>
        g.dy > 10 && g.dy > Math.abs(g.dx) * 1.5,
      onPanResponderMove: (_e, g) => {
        translateY.setValue(Math.max(0, g.dy));
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 120 || g.vy > 0.8) {
          Animated.timing(translateY, {
            toValue: Dimensions.get("window").height,
            duration: 180,
            useNativeDriver: true,
          }).start(() => navRef.current.goBack());
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(translateY, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  // Queue was cleared while this screen is open: don't leave a blank modal.
  useEffect(() => {
    if (!track && navigation.canGoBack()) navigation.goBack();
  }, [track, navigation]);

  if (!track) return null;

  return (
    <Animated.View
      style={[styles.container, { transform: [{ translateY }] }]}
      {...dismissPan.panHandlers}
    >
      {artworkUri && (
        <Image source={{ uri: artworkUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      )}
      <BlurView tint="dark" intensity={90} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.overlay]} />

      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        {/* Drag handle / close */}
        <View style={styles.handleRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 12, bottom: 12, left: 30, right: 30 }}
            accessibilityLabel="Close player"
          >
            <View style={styles.handle} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityLabel="Close player"
          >
            <Ionicons name="chevron-down" size={28} color={COLORS.label} />
          </TouchableOpacity>
        </View>

        {/* Artwork with Classic iPhone Glossy Sheen */}
        <View style={styles.artworkSection}>
          <View style={styles.artworkShadow}>
            <View style={styles.artworkWrapper}>
              {artworkUri ? (
                <Image source={{ uri: artworkUri }} style={styles.artwork} contentFit="cover" />
              ) : (
                <View style={[styles.artwork, { backgroundColor: COLORS.surfaceSecondary }]} />
              )}
              {/* Apple Glossy Sheen Overlay */}
              <LinearGradient
                colors={["rgba(255,255,255,0.36)", "rgba(255,255,255,0.06)", "transparent"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.65, y: 0.65 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              {/* Specular Rim */}
              <View style={styles.artworkRim} pointerEvents="none" />
            </View>
          </View>
        </View>

        {/* Title & heart */}
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
            <Text style={styles.artistName} numberOfLines={1}>{track.artist}</Text>
          </View>
          <TouchableOpacity
            onPress={() => toggleFavorite(track.id)}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons
              name={track.is_favorite ? "heart" : "heart-outline"}
              size={26}
              color={track.is_favorite ? COLORS.accent : COLORS.secondaryLabel}
            />
          </TouchableOpacity>
        </View>

        {/* Scrubber */}
        <Scrubber position={position} duration={duration} onSeek={seekTo} />

        {/* Transport with Glossy Glass Play Button */}
        <View style={styles.transport}>
          <TouchableOpacity onPress={toggleShuffle} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="shuffle" size={24} color={shuffleColor} />
          </TouchableOpacity>
          <TouchableOpacity onPress={prev} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="play-skip-back-sharp" size={36} color={COLORS.label} />
          </TouchableOpacity>
          <TouchableOpacity onPress={toggle} style={styles.playButton} activeOpacity={0.82}>
            <BlurView tint="light" intensity={25} style={StyleSheet.absoluteFill} />
            <LinearGradient
              colors={["rgba(255,255,255,0.36)", "rgba(255,255,255,0.1)"]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.playBtnRim} pointerEvents="none" />
            <Ionicons
              name={playing ? ("pause" as any) : ("play" as any)}
              size={32}
              color={COLORS.label}
              style={!playing ? { marginLeft: 3 } : undefined}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={next} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="play-skip-forward-sharp" size={36} color={COLORS.label} />
          </TouchableOpacity>
          <TouchableOpacity onPress={cycleRepeat} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name={repeatIcon(repeat)} size={24} color={repeatColor} />
            {repeat === "one" && <View style={styles.repeatOneDot} />}
          </TouchableOpacity>
        </View>

        {/* Up Next toggle */}
        <TouchableOpacity style={styles.upNextRow} onPress={() => setShowQueue((v) => !v)} activeOpacity={0.7}>
          <Text style={styles.upNextLabel}>Up Next</Text>
          <Ionicons
            name={showQueue ? "chevron-down" : "chevron-up"}
            size={16}
            color={COLORS.secondaryLabel}
          />
        </TouchableOpacity>

        {/* Queue */}
        {showQueue && (
          <Animated.ScrollView style={styles.queueList} showsVerticalScrollIndicator={false}>
            {queue.slice(index + 1, index + 20).map((t, offset) => {
              const actualIdx = index + 1 + offset;
              const uri = api.artworkUrl(t.artwork_id);
              return (
                <TouchableOpacity
                  key={`${t.id}-${actualIdx}`}
                  style={styles.queueRow}
                  onPress={() => jumpTo(actualIdx)}
                  activeOpacity={0.7}
                >
                  {uri ? (
                    <Image source={{ uri }} style={styles.queueThumb} contentFit="cover" />
                  ) : (
                    <View style={[styles.queueThumb, { backgroundColor: COLORS.surfaceSecondary }]} />
                  )}
                  <View style={styles.queueText}>
                    <Text style={styles.queueTitle} numberOfLines={1}>{t.title}</Text>
                    <Text style={styles.queueArtist} numberOfLines={1}>{t.artist}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </Animated.ScrollView>
        )}
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  overlay: {
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  safe: {
    flex: 1,
  },
  handleRow: {
    alignItems: "center",
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  closeBtn: {
    position: "absolute",
    left: SPACING.lg,
    top: SPACING.xs,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.fill,
  },
  artworkSection: {
    alignItems: "center",
    paddingTop: SPACING.md,
    paddingHorizontal: SPACING.xl,
  },
  artworkShadow: {
    shadowColor: "#000",
    shadowOpacity: 0.65,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 14 },
    borderRadius: 20,
  },
  artworkWrapper: {
    width: 310,
    height: 310,
    borderRadius: 20,
    overflow: "hidden",
    position: "relative",
    backgroundColor: COLORS.surfaceSecondary,
  },
  artwork: {
    width: "100%",
    height: "100%",
  },
  artworkRim: {
    ...StyleSheet.absoluteFill,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderTopColor: "rgba(255, 255, 255, 0.45)",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.xl,
    marginTop: SPACING.lg,
    gap: SPACING.md,
  },
  titleBlock: {
    flex: 1,
  },
  trackTitle: {
    fontSize: FONT.title2,
    fontWeight: "700",
    color: COLORS.label,
  },
  artistName: {
    fontSize: FONT.body,
    fontWeight: "400",
    color: COLORS.accent,
    marginTop: 3,
  },
  heartBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  transport: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.xl,
    marginTop: SPACING.lg,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  playBtnRim: {
    ...StyleSheet.absoluteFill,
    borderRadius: 36,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.22)",
    borderTopColor: "rgba(255, 255, 255, 0.55)",
  },
  repeatOneDot: {
    position: "absolute",
    bottom: -6,
    alignSelf: "center",
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: COLORS.accent,
  },
  upNextRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.xl,
    marginTop: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.separator,
  },
  upNextLabel: {
    fontSize: FONT.subheadline,
    fontWeight: "600",
    color: COLORS.secondaryLabel,
  },
  queueList: {
    maxHeight: 200,
    paddingHorizontal: SPACING.md,
  },
  queueRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: SPACING.sm,
  },
  queueThumb: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceSecondary,
  },
  queueText: {
    flex: 1,
  },
  queueTitle: {
    fontSize: FONT.callout,
    fontWeight: "400",
    color: COLORS.label,
  },
  queueArtist: {
    fontSize: FONT.footnote,
    color: COLORS.secondaryLabel,
    marginTop: 1,
  },
});
