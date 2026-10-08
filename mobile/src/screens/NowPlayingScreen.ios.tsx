import React, { useRef, useState } from "react";
import {
  Animated,
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
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../api";
import { usePlayer } from "../store/player";
import type { RepeatMode } from "../store/player";
import { COLORS, FONT, RADIUS, SPACING } from "../theme/ios";

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
    height: 36,
    justifyContent: "center",
  },
  track: {
    height: 4,
    backgroundColor: COLORS.fill,
    borderRadius: 2,
    justifyContent: "center",
    position: "relative",
  },
  fill: {
    height: 4,
    backgroundColor: COLORS.label,
    borderRadius: 2,
    position: "absolute",
    left: 0,
    top: 0,
  },
  thumb: {
    position: "absolute",
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: COLORS.label,
    marginLeft: -7,
    top: -5,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  time: {
    fontSize: FONT.caption,
    color: COLORS.secondaryLabel,
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

  if (!track) return null;

  return (
    <View style={styles.container}>
      {artworkUri && (
        <Image source={{ uri: artworkUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
      )}
      <BlurView tint="dark" intensity={90} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, styles.overlay]} />

      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        {/* Drag handle */}
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        {/* Artwork */}
        <View style={styles.artworkSection}>
          <View style={styles.artworkShadow}>
            {artworkUri ? (
              <Image source={{ uri: artworkUri }} style={styles.artwork} contentFit="cover" />
            ) : (
              <View style={[styles.artwork, { backgroundColor: COLORS.surfaceSecondary }]} />
            )}
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

        {/* Transport */}
        <View style={styles.transport}>
          <TouchableOpacity onPress={toggleShuffle} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="shuffle" size={24} color={shuffleColor} />
          </TouchableOpacity>
          <TouchableOpacity onPress={prev} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="play-skip-back-sharp" size={36} color={COLORS.label} />
          </TouchableOpacity>
          <TouchableOpacity onPress={toggle} style={styles.playButton} activeOpacity={0.85}>
            <Ionicons
              name={playing ? ("pause" as any) : ("play" as any)}
              size={30}
              color={COLORS.label}
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
    </View>
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
    shadowOpacity: 0.6,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  artwork: {
    width: 300,
    height: 300,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceSecondary,
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
  transport: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.xl,
    marginTop: SPACING.lg,
  },
  playButton: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
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
