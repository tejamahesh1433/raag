import React, { useEffect, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../api";
import { usePlayer } from "../store/player";
import type { Playlist, Track } from "../types";
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from "../theme/ios";

interface Props {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<{ PlaylistDetail: { playlistId: number } }, "PlaylistDetail">;
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function totalMin(tracks: Track[]) {
  const total = tracks.reduce((acc, t) => acc + t.duration, 0);
  return `${Math.floor(total / 60)} min`;
}

export default function PlaylistDetailScreen({ navigation, route }: Props) {
  const { playlistId } = route.params;
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const { playNow } = usePlayer();
  const currentTrack = usePlayer((s) => s.queue[s.index]);
  const isPlaying = usePlayer((s) => s.playing);

  useEffect(() => {
    async function load() {
      try {
        const [allPlaylists, trackList] = await Promise.all([
          api.playlists(),
          api.playlistTracks(playlistId),
        ]);
        setPlaylist(allPlaylists.find((p) => p.id === playlistId) ?? null);
        setTracks(trackList);
      } catch {}
    }
    load();
  }, [playlistId]);

  function handleShuffle() {
    if (!tracks.length) return;
    const idx = Math.floor(Math.random() * tracks.length);
    playNow(tracks, idx);
  }

  function renderTrack({ item, index }: { item: Track; index: number }) {
    const uri = api.artworkUrl(item.artwork_id);
    const isCurrent = currentTrack?.id === item.id;

    return (
      <TouchableOpacity
        style={[styles.trackRow, isCurrent && styles.trackRowActive]}
        activeOpacity={0.7}
        onPress={() => playNow(tracks, index)}
      >
        <View style={styles.artworkContainer}>
          {uri ? (
            <Image source={{ uri }} style={styles.artwork} contentFit="cover" />
          ) : (
            <View style={[styles.artwork, { backgroundColor: COLORS.surfaceSecondary }]} />
          )}
          {/* Subtle thumbnail gloss */}
          <LinearGradient
            colors={["rgba(255, 255, 255, 0.25)", "transparent"]}
            style={StyleSheet.absoluteFill}
            pointerEvents="none"
          />
          <View style={styles.thumbnailRim} pointerEvents="none" />
        </View>

        <View style={styles.trackText}>
          <Text
            style={[styles.trackTitle, isCurrent && styles.trackTitleActive]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text style={styles.trackArtist} numberOfLines={1}>
            {item.artist}
          </Text>
        </View>

        {isCurrent && (
          <Ionicons
            name={isPlaying ? "volume-high" : "pause"}
            size={16}
            color={COLORS.accent}
            style={{ marginRight: 6 }}
          />
        )}
        <Text style={styles.duration}>{formatDuration(item.duration)}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.root}>
      {/* Ambient background gradient */}
      <LinearGradient
        colors={["#1c0f24", "#0a0910", "#030305"]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <FlatList
          data={tracks}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderTrack}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View style={styles.header}>
              {/* Glossy Badge Card */}
              <View style={styles.badgeShadow}>
                <View style={styles.badgeCard}>
                  <LinearGradient
                    colors={["#ff2d55", "#801242", "#2c0e2a"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  {/* Diagonal Gloss Sheen */}
                  <LinearGradient
                    colors={["rgba(255,255,255,0.40)", "rgba(255,255,255,0.06)", "transparent"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.7, y: 0.7 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                  <View style={styles.badgeRim} pointerEvents="none" />
                  <Ionicons name="musical-notes" size={64} color="#ffffff" />
                </View>
              </View>

              <Text style={styles.playlistName} numberOfLines={2}>
                {playlist?.name ?? ""}
              </Text>

              {tracks.length > 0 && (
                <Text style={styles.meta}>
                  {tracks.length} songs · {totalMin(tracks)}
                </Text>
              )}

              {/* Action buttons */}
              <View style={styles.actionRow}>
                {/* Play Button */}
                <TouchableOpacity
                  style={styles.playButtonWrapper}
                  onPress={() => tracks.length && playNow(tracks, 0)}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={COLORS.accentGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.actionGradient}
                  >
                    <LinearGradient
                      colors={["rgba(255, 255, 255, 0.35)", "transparent"]}
                      style={styles.buttonGloss}
                      pointerEvents="none"
                    />
                    <Ionicons name="play" size={18} color="#ffffff" />
                    <Text style={styles.playText}>Play</Text>
                  </LinearGradient>
                </TouchableOpacity>

                {/* Shuffle Button */}
                <TouchableOpacity
                  style={styles.shuffleButtonWrapper}
                  onPress={handleShuffle}
                  activeOpacity={0.85}
                >
                  <BlurView tint="dark" intensity={70} style={styles.actionGradient}>
                    <LinearGradient
                      colors={["rgba(255, 255, 255, 0.16)", "rgba(255, 255, 255, 0.04)"]}
                      style={StyleSheet.absoluteFill}
                    />
                    <View style={styles.shuffleRim} pointerEvents="none" />
                    <Ionicons name="shuffle" size={18} color={COLORS.accent} />
                    <Text style={styles.shuffleText}>Shuffle</Text>
                  </BlurView>
                </TouchableOpacity>
              </View>
            </View>
          }
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  safe: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 120,
  },
  header: {
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.lg,
  },
  badgeShadow: {
    ...SHADOW.floating,
    borderRadius: RADIUS.lg,
    marginBottom: SPACING.md,
  },
  badgeCard: {
    width: 170,
    height: 170,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  badgeRim: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderTopColor: "rgba(255, 255, 255, 0.45)",
  },
  playlistName: {
    fontSize: 26,
    fontWeight: "800",
    color: COLORS.label,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  meta: {
    fontSize: FONT.subheadline,
    color: COLORS.muted,
    marginTop: 6,
  },
  actionRow: {
    flexDirection: "row",
    gap: SPACING.md,
    marginTop: SPACING.lg,
    width: "100%",
  },
  playButtonWrapper: {
    flex: 1,
    borderRadius: RADIUS.xl,
    overflow: "hidden",
    ...SHADOW.glow(COLORS.accent),
  },
  shuffleButtonWrapper: {
    flex: 1,
    borderRadius: RADIUS.xl,
    overflow: "hidden",
    ...SHADOW.card,
  },
  actionGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    paddingVertical: 12,
    borderRadius: RADIUS.xl,
    position: "relative",
  },
  buttonGloss: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 18,
    borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl,
  },
  playText: {
    fontSize: FONT.body,
    fontWeight: "700",
    color: "#ffffff",
  },
  shuffleRim: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderTopColor: "rgba(255, 255, 255, 0.32)",
  },
  shuffleText: {
    fontSize: FONT.body,
    fontWeight: "600",
    color: COLORS.accent,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
    gap: SPACING.sm,
  },
  trackRowActive: {
    backgroundColor: "rgba(255, 45, 85, 0.08)",
  },
  artworkContainer: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.sm,
    overflow: "hidden",
    position: "relative",
    backgroundColor: COLORS.surfaceSecondary,
  },
  artwork: {
    width: "100%",
    height: "100%",
  },
  thumbnailRim: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS.sm,
    borderWidth: 0.5,
    borderColor: "rgba(255, 255, 255, 0.14)",
  },
  trackText: {
    flex: 1,
  },
  trackTitle: {
    fontSize: FONT.body,
    fontWeight: "400",
    color: COLORS.label,
  },
  trackTitleActive: {
    fontWeight: "600",
    color: COLORS.accent,
  },
  trackArtist: {
    fontSize: FONT.footnote,
    color: COLORS.secondaryLabel,
    marginTop: 1,
  },
  duration: {
    fontSize: FONT.footnote,
    color: COLORS.muted,
  },
});
