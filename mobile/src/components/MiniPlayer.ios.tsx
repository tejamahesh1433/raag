import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { usePlayer } from "../store/player";
import { api } from "../api";
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from "../theme/ios";

interface Props {
  onExpand: () => void;
}

export default function MiniPlayer({ onExpand }: Props) {
  const { queue, index, playing, position, duration, toggle, next, stop } = usePlayer();

  const track = index >= 0 ? queue[index] : null;
  if (!track) return null;

  const progress = duration > 0 ? position / duration : 0;
  const artworkUri = api.artworkUrl(track.artwork_id);

  return (
    <View style={styles.shadowWrapper}>
      <BlurView tint="dark" intensity={92} style={styles.blurContainer}>
        {/* Apple Glossy Sheen Overlay */}
        <LinearGradient
          colors={["rgba(255,255,255,0.22)", "rgba(255,255,255,0.03)", "transparent"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.5, y: 0.9 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />

        {/* Specular Rim Border */}
        <View style={styles.rimBorder} pointerEvents="none" />

        <TouchableOpacity style={styles.content} onPress={onExpand} activeOpacity={0.85}>
          {/* Artwork with subtle gloss */}
          <View style={styles.artworkBox}>
            {artworkUri ? (
              <Image source={{ uri: artworkUri }} style={styles.artwork} contentFit="cover" />
            ) : (
              <View style={[styles.artwork, styles.artworkPlaceholder]} />
            )}
            <View style={styles.artworkRim} pointerEvents="none" />
          </View>

          <View style={styles.textBlock}>
            <Text style={styles.title} numberOfLines={1}>{track.title}</Text>
            <Text style={styles.artist} numberOfLines={1}>{track.artist}</Text>
          </View>

          {/* Glossy Play/Pause Button */}
          <TouchableOpacity
            onPress={toggle}
            style={styles.glossyBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Ionicons name={playing ? "pause" : "play"} size={18} color={COLORS.label} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={next}
            style={styles.skipBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Ionicons name="play-skip-forward" size={18} color={COLORS.secondaryLabel} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={stop}
            style={styles.skipBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
            accessibilityLabel="Close player"
          >
            <Ionicons name="close" size={18} color={COLORS.secondaryLabel} />
          </TouchableOpacity>
        </TouchableOpacity>

        {/* Luminous Glowing Progress Bar */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.min(progress * 100, 100)}%` }]} />
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  shadowWrapper: {
    marginHorizontal: SPACING.md,
    marginBottom: 6,
    borderRadius: RADIUS.xl,
    ...SHADOW.floating,
  },
  blurContainer: {
    borderRadius: RADIUS.xl,
    overflow: "hidden",
    position: "relative",
    backgroundColor: "rgba(22, 22, 28, 0.78)",
  },
  rimBorder: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
    borderTopColor: "rgba(255, 255, 255, 0.42)",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 12,
  },
  artworkBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    overflow: "hidden",
    position: "relative",
    ...SHADOW.card,
  },
  artwork: {
    width: "100%",
    height: "100%",
  },
  artworkPlaceholder: {
    backgroundColor: COLORS.surfaceSecondary,
  },
  artworkRim: {
    ...StyleSheet.absoluteFill,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderTopColor: "rgba(255, 255, 255, 0.4)",
  },
  textBlock: {
    flex: 1,
    justifyContent: "center",
  },
  title: {
    fontSize: FONT.subheadline,
    fontWeight: "600",
    color: COLORS.label,
    letterSpacing: -0.2,
  },
  artist: {
    fontSize: FONT.footnote,
    fontWeight: "400",
    color: COLORS.secondaryLabel,
    marginTop: 1,
  },
  glossyBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.22)",
    borderTopColor: "rgba(255, 255, 255, 0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  skipBtn: {
    padding: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  progressTrack: {
    height: 2.5,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
  },
  progressFill: {
    height: 2.5,
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOpacity: 0.8,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
  },
});
