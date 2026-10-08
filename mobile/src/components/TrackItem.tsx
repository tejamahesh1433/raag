import { useEffect, useRef } from "react";
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Artwork } from "./Artwork";
import { COLORS, SPACING } from "../theme/android";
import { usePlayer } from "../store/player";
import type { Track } from "../types";

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function PlayingBars() {
  const bar1 = useRef(new Animated.Value(0.3)).current;
  const bar2 = useRef(new Animated.Value(0.7)).current;
  const bar3 = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const makeLoop = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(val, {
            toValue: 1,
            duration: 400,
            delay,
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0.2,
            duration: 400,
            useNativeDriver: true,
          }),
        ]),
      );
    Animated.parallel([
      makeLoop(bar1, 0),
      makeLoop(bar2, 150),
      makeLoop(bar3, 300),
    ]).start();
    return () => {
      bar1.stopAnimation();
      bar2.stopAnimation();
      bar3.stopAnimation();
    };
  }, [bar1, bar2, bar3]);

  return (
    <View style={styles.barsContainer}>
      <Animated.View style={[styles.bar, { transform: [{ scaleY: bar1 }] }]} />
      <Animated.View style={[styles.bar, { transform: [{ scaleY: bar2 }] }]} />
      <Animated.View style={[styles.bar, { transform: [{ scaleY: bar3 }] }]} />
    </View>
  );
}

interface Props {
  track: Track;
  onPress: () => void;
  onLongPress?: () => void;
  showAlbum?: boolean;
  isPlaying?: boolean;
  artworkId?: number | null;
}

export function TrackItem({
  track,
  onPress,
  onLongPress,
  showAlbum = false,
  isPlaying = false,
  artworkId,
}: Props) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      <View style={styles.artworkWrap}>
        <Artwork artworkId={artworkId ?? track.artwork_id ?? null} size={48} />
        {isPlaying && (
          <View style={styles.barsOverlay}>
            <PlayingBars />
          </View>
        )}
      </View>

      <View style={styles.info}>
        <Text
          style={[styles.title, isPlaying && styles.titlePlaying]}
          numberOfLines={1}
        >
          {track.title}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {track.artist}
          {showAlbum ? ` · ${track.album}` : ""}
        </Text>
      </View>

      <Text style={styles.duration}>{fmtDuration(track.duration)}</Text>

      <TouchableOpacity
        onPress={() => usePlayer.getState().toggleFavorite(track.id)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <MaterialIcons
          name={track.is_favorite ? "favorite" : "favorite-border"}
          size={20}
          color={track.is_favorite ? COLORS.accent : COLORS.muted}
        />
      </TouchableOpacity>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  rowPressed: {
    backgroundColor: COLORS.surfaceVariant,
  },
  artworkWrap: {
    position: "relative",
  },
  barsOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  barsContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    height: 16,
  },
  bar: {
    width: 3,
    height: 14,
    backgroundColor: COLORS.accent,
    borderRadius: 2,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.onBg,
  },
  titlePlaying: {
    color: COLORS.accent,
  },
  artist: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
  },
  duration: {
    fontSize: 12,
    color: COLORS.muted,
    fontVariant: ["tabular-nums"],
  },
});
