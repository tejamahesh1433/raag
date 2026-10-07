import { Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Artwork } from "./Artwork";
import { COLORS, ELEVATION, SPACING } from "../theme/android";
import { usePlayer } from "../store/player";

interface Props {
  onExpand: () => void;
}

export function MiniPlayer({ onExpand }: Props) {
  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const playing = usePlayer((s) => s.playing);
  const position = usePlayer((s) => s.position);
  const duration = usePlayer((s) => s.duration);

  if (queue.length === 0 || index < 0) return null;

  const track = queue[index]!;
  const progress = duration > 0 ? Math.min(1, position / duration) : 0;

  return (
    <View style={[styles.container, ELEVATION.modal]}>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress * 100}%` as `${number}%` }]} />
      </View>

      <Pressable style={styles.content} onPress={onExpand}>
        <Artwork artworkId={track.album_id} size={40} style={styles.artwork} />

        <View style={styles.trackInfo}>
          <Text style={styles.title} numberOfLines={1}>
            {track.title}
          </Text>
          <Text style={styles.artist} numberOfLines={1}>
            {track.artist}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => usePlayer.getState().prev()}
          style={styles.iconBtn}
        >
          <MaterialIcons name="skip-previous" size={28} color={COLORS.onSurface} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => usePlayer.getState().toggle()}
          style={styles.iconBtn}
        >
          <MaterialIcons
            name={playing ? "pause" : "play-arrow"}
            size={32}
            color={COLORS.onBg}
          />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => usePlayer.getState().next()}
          style={styles.iconBtn}
        >
          <MaterialIcons name="skip-next" size={28} color={COLORS.onSurface} />
        </TouchableOpacity>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.outline,
  },
  progressTrack: {
    height: 2,
    backgroundColor: COLORS.outline,
  },
  progressFill: {
    height: 2,
    backgroundColor: COLORS.accent,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  artwork: {
    borderRadius: 6,
  },
  trackInfo: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.onBg,
  },
  artist: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 1,
  },
  iconBtn: {
    padding: SPACING.xs,
  },
});
