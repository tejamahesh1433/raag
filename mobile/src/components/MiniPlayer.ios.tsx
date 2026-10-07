import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { usePlayer } from "../store/player";
import { api } from "../api";
import { COLORS, FONT, SPACING } from "../theme/ios";

interface Props {
  onExpand: () => void;
}

export default function MiniPlayer({ onExpand }: Props) {
  const { queue, index, playing, position, duration, toggle, next } = usePlayer();

  const track = index >= 0 ? queue[index] : null;
  if (!track) return null;

  const progress = duration > 0 ? position / duration : 0;
  const artworkUri = api.artworkUrl(track.album_id);

  return (
    <View style={styles.wrapper}>
      <BlurView tint="dark" intensity={80} style={styles.blur}>
        <View style={styles.dragRow}>
          <View style={styles.dot} />
          <View style={styles.dot} />
          <View style={styles.dot} />
        </View>
        <TouchableOpacity style={styles.content} onPress={onExpand} activeOpacity={1}>
          {artworkUri ? (
            <Image source={{ uri: artworkUri }} style={styles.artwork} contentFit="cover" />
          ) : (
            <View style={[styles.artwork, styles.artworkPlaceholder]} />
          )}
          <View style={styles.textBlock}>
            <Text style={styles.title} numberOfLines={1}>{track.title}</Text>
            <Text style={styles.artist} numberOfLines={1}>{track.artist}</Text>
          </View>
          <TouchableOpacity onPress={toggle} style={styles.button} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name={playing ? "pause.fill" as any : "play.fill" as any} size={22} color={COLORS.label} />
          </TouchableOpacity>
          <TouchableOpacity onPress={next} style={styles.button} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name={"forward.fill" as any} size={22} color={COLORS.label} />
          </TouchableOpacity>
        </TouchableOpacity>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(progress * 100, 100)}%` }]} />
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 14,
    overflow: "hidden",
  },
  blur: {
    borderRadius: 14,
    overflow: "hidden",
  },
  dragRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
    paddingTop: 8,
    paddingBottom: 4,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.muted,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingBottom: 10,
    gap: SPACING.sm,
  },
  artwork: {
    width: 48,
    height: 48,
    borderRadius: 10,
    backgroundColor: COLORS.surfaceSecondary,
  },
  artworkPlaceholder: {
    backgroundColor: COLORS.surfaceSecondary,
  },
  textBlock: {
    flex: 1,
  },
  title: {
    fontSize: FONT.callout,
    fontWeight: "600",
    color: COLORS.label,
  },
  artist: {
    fontSize: FONT.footnote,
    fontWeight: "400",
    color: COLORS.secondaryLabel,
    marginTop: 1,
  },
  button: {
    padding: 4,
  },
  progressTrack: {
    height: 2,
    backgroundColor: COLORS.separator,
  },
  progressFill: {
    height: 2,
    backgroundColor: COLORS.accent,
  },
});
