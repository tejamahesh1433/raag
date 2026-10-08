import React, { useRef, useState } from "react";
import {
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { MaterialIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../api";
import { usePlayer } from "../store/player";
import type { RepeatMode } from "../store/player";
import { COLORS, ELEVATION, RADIUS, SPACING } from "../theme/android";

interface Props {
  navigation: NativeStackNavigationProp<any>;
}

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function repeatIcon(mode: RepeatMode): keyof typeof MaterialIcons.glyphMap {
  return mode !== "none" ? "repeat" : "repeat";
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
    height: 6,
    backgroundColor: COLORS.outline,
    borderRadius: 3,
    justifyContent: "center",
    position: "relative",
  },
  fill: {
    height: 6,
    backgroundColor: COLORS.accent,
    borderRadius: 3,
    position: "absolute",
    left: 0,
    top: 0,
  },
  thumb: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: COLORS.onBg,
    marginLeft: -8,
    top: -5,
    ...ELEVATION.card,
  },
  timeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  time: {
    fontSize: 12,
    color: COLORS.muted,
    fontFamily: "monospace",
  },
});

export function NowPlayingScreen({ navigation }: Props) {
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
        {/* Drag handle — tap anywhere in this row to dismiss */}
        <TouchableOpacity
          style={styles.handleRow}
          onPress={() => navigation.goBack()}
          activeOpacity={0.6}
          hitSlop={{ top: 10, bottom: 10, left: 60, right: 60 }}
        >
          <View style={styles.handle} />
        </TouchableOpacity>

        {/* Artwork - Material 3 large */}
        <View style={styles.artworkSection}>
          <View style={styles.artworkWrapper}>
            {artworkUri ? (
              <Image source={{ uri: artworkUri }} style={styles.artwork} contentFit="cover" />
            ) : (
              <View style={[styles.artwork, { backgroundColor: COLORS.surfaceVariant }]} />
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
            <MaterialIcons
              name={track.is_favorite ? "favorite" : "favorite-border"}
              size={28}
              color={track.is_favorite ? COLORS.accent : COLORS.muted}
            />
          </TouchableOpacity>
        </View>

        {/* Scrubber */}
        <Scrubber position={position} duration={duration} onSeek={seekTo} />

        {/* Transport - Material 3 */}
        <View style={styles.transport}>
          <TouchableOpacity onPress={toggleShuffle} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <MaterialIcons name="shuffle" size={24} color={shuffleColor} />
          </TouchableOpacity>
          <TouchableOpacity onPress={prev} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <MaterialIcons name="skip-previous" size={36} color={COLORS.onBg} />
          </TouchableOpacity>
          <TouchableOpacity onPress={toggle} style={styles.playButton} activeOpacity={0.85}>
            <MaterialIcons
              name={playing ? "pause" : "play-arrow"}
              size={32}
              color={COLORS.onBg}
            />
          </TouchableOpacity>
          <TouchableOpacity onPress={next} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <MaterialIcons name="skip-next" size={36} color={COLORS.onBg} />
          </TouchableOpacity>
          <TouchableOpacity onPress={cycleRepeat} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <MaterialIcons name={repeatIcon(repeat)} size={24} color={repeatColor} />
            {repeat === "one" && <View style={styles.repeatOneDot} />}
          </TouchableOpacity>
        </View>

        {/* Up Next toggle */}
        <TouchableOpacity style={styles.upNextRow} onPress={() => setShowQueue((v) => !v)} activeOpacity={0.7}>
          <Text style={styles.upNextLabel}>Up Next</Text>
          <MaterialIcons
            name={showQueue ? "keyboard-arrow-down" : "keyboard-arrow-up"}
            size={20}
            color={COLORS.muted}
          />
        </TouchableOpacity>

        {/* Queue */}
        {showQueue && (
          <ScrollView style={styles.queueList} showsVerticalScrollIndicator={false}>
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
                    <View style={[styles.queueThumb, { backgroundColor: COLORS.surfaceVariant }]} />
                  )}
                  <View style={styles.queueText}>
                    <Text style={styles.queueTitle} numberOfLines={1}>{t.title}</Text>
                    <Text style={styles.queueArtist} numberOfLines={1}>{t.artist}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
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
    backgroundColor: "rgba(0,0,0,0.5)",
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
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.outline,
  },
  artworkSection: {
    alignItems: "center",
    paddingTop: SPACING.md,
    paddingHorizontal: SPACING.xl,
  },
  artworkWrapper: {
    borderRadius: 20,
    ...ELEVATION.modal,
    overflow: "hidden",
    width: 320,
    height: 320,
  },
  artwork: {
    width: 320,
    height: 320,
    backgroundColor: COLORS.surfaceVariant,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.xl,
    marginTop: SPACING.xl,
    gap: SPACING.md,
  },
  titleBlock: {
    flex: 1,
  },
  trackTitle: {
    fontSize: 26,
    fontWeight: "800",
    color: COLORS.onBg,
  },
  artistName: {
    fontSize: 16,
    fontWeight: "500",
    color: COLORS.accent,
    marginTop: 4,
  },
  transport: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.xl,
    marginTop: SPACING.xl,
  },
  playButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.accent,
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
    marginTop: SPACING.xl,
    paddingVertical: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.outline,
  },
  upNextLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  queueList: {
    maxHeight: 220,
    paddingHorizontal: SPACING.md,
  },
  queueRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: SPACING.md,
  },
  queueThumb: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceVariant,
  },
  queueText: {
    flex: 1,
  },
  queueTitle: {
    fontSize: 15,
    fontWeight: "500",
    color: COLORS.onBg,
  },
  queueArtist: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
  },
});