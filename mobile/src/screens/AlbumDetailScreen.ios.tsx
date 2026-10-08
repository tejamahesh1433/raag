import React, { useEffect, useState } from "react";
import {
  Dimensions,
  ScrollView,
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
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { api } from "../api";
import { usePlayer } from "../store/player";
import type { Album, Track } from "../types";
import AlbumCard from "../components/AlbumCard.ios";
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from "../theme/ios";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const ARTWORK_SIZE = Math.min(SCREEN_WIDTH - 80, 280);

interface Props {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<{ AlbumDetail: { albumId: number } }, "AlbumDetail">;
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function totalDuration(tracks: Track[]) {
  const total = tracks.reduce((acc, t) => acc + t.duration, 0);
  const m = Math.floor(total / 60);
  return `${m} min`;
}

export default function AlbumDetailScreen({ navigation, route }: Props) {
  const { albumId } = route.params;
  const [album, setAlbum] = useState<Album | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [moreAlbums, setMoreAlbums] = useState<Album[]>([]);
  const { playNow } = usePlayer();
  const currentTrack = usePlayer((s) => s.queue[s.index]);
  const isPlaying = usePlayer((s) => s.playing);

  useEffect(() => {
    async function load() {
      try {
        const [allAlbums, albumTracks] = await Promise.all([
          api.albums(),
          api.albumTracks(albumId),
        ]);
        const found = allAlbums.find((a) => a.id === albumId) ?? null;
        setAlbum(found);
        setTracks(albumTracks);
        if (found) {
          const more = allAlbums
            .filter((a) => a.artist_id === found.artist_id && a.id !== albumId)
            .slice(0, 6);
          setMoreAlbums(more);
        }
      } catch {}
    }
    load();
  }, [albumId]);

  const artworkUri = album ? api.artworkUrl(album.artwork_id) : null;

  function handlePlay(startIndex = 0) {
    if (tracks.length) playNow(tracks, startIndex);
  }

  function handleShuffle() {
    if (!tracks.length) return;
    const idx = Math.floor(Math.random() * tracks.length);
    playNow(tracks, idx);
  }

  return (
    <View style={styles.root}>
      {/* Ambient background gradient */}
      <LinearGradient
        colors={["#1c0f24", "#0a0910", "#030305"]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safe} edges={["bottom"]}>
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* Header & Artwork with Glossy Sheen */}
          <View style={styles.artworkSection}>
            <View style={styles.artworkShadow}>
              <View style={styles.artworkContainer}>
                {artworkUri ? (
                  <Image source={{ uri: artworkUri }} style={styles.artwork} contentFit="cover" />
                ) : (
                  <View style={[styles.artwork, styles.artworkPlaceholder]}>
                    <LinearGradient
                      colors={["#2c2c36", "#14141a"]}
                      style={StyleSheet.absoluteFill}
                    />
                  </View>
                )}

                {/* Diagonal Glossy Sheen */}
                <LinearGradient
                  colors={["rgba(255, 255, 255, 0.36)", "rgba(255, 255, 255, 0.08)", "transparent"]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0.7, y: 0.7 }}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />

                {/* Specular Rim Border */}
                <View style={styles.artworkRim} pointerEvents="none" />
              </View>
            </View>

            <Text style={styles.albumTitle} numberOfLines={2}>
              {album?.title ?? ""}
            </Text>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() =>
                album &&
                navigation.navigate("ArtistDetail", {
                  artistId: album.artist_id,
                  artistName: album.artist,
                })
              }
            >
              <Text style={styles.artistName}>{album?.artist ?? ""}</Text>
            </TouchableOpacity>

            <Text style={styles.metaRow}>
              {album?.year ? `${album.year} · ` : ""}
              {tracks.length > 0 ? `${tracks.length} songs` : "Album"}
            </Text>
          </View>

          {/* Action Row: Glossy Play & Shuffle Buttons */}
          <View style={styles.actionRow}>
            {/* Play Button - Apple Red Gradient */}
            <TouchableOpacity
              style={styles.playButtonWrapper}
              onPress={() => handlePlay(0)}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={COLORS.accentGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.actionGradient}
              >
                {/* Glossy top sheen */}
                <LinearGradient
                  colors={["rgba(255, 255, 255, 0.35)", "transparent"]}
                  style={styles.buttonGloss}
                  pointerEvents="none"
                />
                <Ionicons name="play" size={18} color="#ffffff" />
                <Text style={styles.playButtonText}>Play</Text>
              </LinearGradient>
            </TouchableOpacity>

            {/* Shuffle Button - Frosted Glass Button */}
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
                {/* Specular Rim */}
                <View style={styles.shuffleRim} pointerEvents="none" />
                <Ionicons name="shuffle" size={18} color={COLORS.accent} />
                <Text style={styles.shuffleButtonText}>Shuffle</Text>
              </BlurView>
            </TouchableOpacity>
          </View>

          {/* Track list */}
          <View style={styles.trackList}>
            {tracks.map((track, idx) => {
              const isCurrent = currentTrack?.id === track.id;
              return (
                <TouchableOpacity
                  key={track.id}
                  style={[styles.trackRow, isCurrent && styles.trackRowActive]}
                  activeOpacity={0.7}
                  onPress={() => handlePlay(idx)}
                >
                  <View style={styles.trackNoContainer}>
                    {isCurrent ? (
                      <Ionicons
                        name={isPlaying ? "volume-high" : "pause"}
                        size={16}
                        color={COLORS.accent}
                      />
                    ) : (
                      <Text style={styles.trackNo}>{track.track_no ?? idx + 1}</Text>
                    )}
                  </View>
                  <View style={styles.trackInfo}>
                    <Text
                      style={[styles.trackTitle, isCurrent && styles.trackTitleActive]}
                      numberOfLines={1}
                    >
                      {track.title}
                    </Text>
                  </View>
                  <Text style={styles.trackDuration}>{formatDuration(track.duration)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {tracks.length > 0 && (
            <Text style={styles.totalDuration}>
              {tracks.length} songs · {totalDuration(tracks)}
            </Text>
          )}

          {/* More by artist */}
          {moreAlbums.length > 0 && (
            <View style={styles.moreSection}>
              <Text style={styles.moreSectionTitle}>More by {album?.artist}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.moreScroll}
              >
                {moreAlbums.map((a) => (
                  <AlbumCard
                    key={a.id}
                    album={a}
                    style={styles.moreItem}
                    onPress={() => navigation.push("AlbumDetail", { albumId: a.id })}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>
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
  artworkSection: {
    alignItems: "center",
    paddingTop: SPACING.lg,
    paddingHorizontal: SPACING.md,
  },
  artworkShadow: {
    ...SHADOW.floating,
    borderRadius: RADIUS.lg,
  },
  artworkContainer: {
    width: ARTWORK_SIZE,
    height: ARTWORK_SIZE,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    position: "relative",
    backgroundColor: COLORS.surfaceSecondary,
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
    borderRadius: RADIUS.lg,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
    borderTopColor: "rgba(255, 255, 255, 0.42)",
  },
  albumTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: COLORS.label,
    marginTop: SPACING.md,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  artistName: {
    fontSize: FONT.body,
    fontWeight: "500",
    color: COLORS.accent,
    marginTop: 4,
  },
  metaRow: {
    fontSize: FONT.footnote,
    color: COLORS.muted,
    marginTop: 4,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: SPACING.md,
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.md,
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
  playButtonText: {
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
  shuffleButtonText: {
    fontSize: FONT.body,
    fontWeight: "600",
    color: COLORS.accent,
  },
  trackList: {
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.md,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
    gap: SPACING.sm,
  },
  trackRowActive: {
    backgroundColor: "rgba(255, 45, 85, 0.08)",
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.xs,
  },
  trackNoContainer: {
    width: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  trackNo: {
    fontSize: FONT.callout,
    color: COLORS.muted,
  },
  trackInfo: {
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
  trackDuration: {
    fontSize: FONT.footnote,
    color: COLORS.muted,
  },
  totalDuration: {
    textAlign: "center",
    fontSize: FONT.footnote,
    color: COLORS.muted,
    marginTop: SPACING.md,
  },
  moreSection: {
    marginTop: SPACING.xl,
  },
  moreSectionTitle: {
    fontSize: FONT.title3,
    fontWeight: "700",
    color: COLORS.label,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  moreScroll: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
  },
  moreItem: {
    width: 140,
  },
});
