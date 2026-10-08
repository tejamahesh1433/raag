import React, { useEffect, useState } from "react";
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { api } from "../api";
import type { Album, Track } from "../types";
import AlbumCard from "../components/AlbumCard.ios";
import { usePlayer } from "../store/player";
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from "../theme/ios";

type Params = { artistId: number; artistName: string };

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function ArtistDetailScreen() {
  const route = useRoute<RouteProp<{ ArtistDetail: Params }, "ArtistDetail">>();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const insets = useSafeAreaInsets();
  const { artistId, artistName = "Artist" } = route.params ?? {};

  const [albums, setAlbums] = useState<Album[]>([]);
  const [topTracks, setTopTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  const currentTrack = usePlayer((s) => s.queue[s.index]);
  const isPlaying = usePlayer((s) => s.playing);

  useEffect(() => {
    Promise.all([api.albums(artistId), api.tracks({ limit: 8 })]).then(([albs, page]) => {
      setAlbums(albs);
      setTopTracks(page.items.filter((t) => t.artist_id === artistId).slice(0, 8));
      setLoading(false);
    });
  }, [artistId]);

  const playAll = async () => {
    const all = await Promise.all(albums.map((a) => api.albumTracks(a.id)));
    usePlayer.getState().playNow(all.flat());
  };

  const shuffleAll = async () => {
    const all = await Promise.all(albums.map((a) => api.albumTracks(a.id)));
    const flat = all.flat();
    usePlayer.getState().playNow(flat.sort(() => Math.random() - 0.5));
  };

  const artistArtworkUri = albums[0]?.artwork_id ? api.artworkUrl(albums[0].artwork_id) : null;

  return (
    <View style={styles.root}>
      {/* Ambient background gradient */}
      <LinearGradient
        colors={["#1c0f24", "#0a0910", "#030305"]}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Hero Section */}
        <View style={styles.hero}>
          {/* Circular Glossy Artist Vinyl / Avatar */}
          <View style={styles.avatarShadow}>
            <View style={styles.avatarDisc}>
              {artistArtworkUri ? (
                <Image source={{ uri: artistArtworkUri }} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <LinearGradient colors={["#3a2042", "#181224"]} style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={54} color="rgba(255,255,255,0.4)" />
                </LinearGradient>
              )}

              {/* Diagonal Glossy Sheen */}
              <LinearGradient
                colors={["rgba(255, 255, 255, 0.40)", "rgba(255, 255, 255, 0.08)", "transparent"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0.7, y: 0.7 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />

              {/* Specular Rim */}
              <View style={styles.avatarRim} pointerEvents="none" />
            </View>
          </View>

          <Text style={styles.artistName} numberOfLines={2}>
            {artistName}
          </Text>

          {albums.length > 0 && (
            <Text style={styles.artistMeta}>
              {albums.length} {albums.length === 1 ? "album" : "albums"}
            </Text>
          )}

          {/* Glossy Play & Shuffle Buttons */}
          <View style={styles.heroButtons}>
            <TouchableOpacity style={styles.playButtonWrapper} onPress={playAll} activeOpacity={0.85}>
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
                <Text style={styles.playBtnText}>Play</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.shuffleButtonWrapper}
              onPress={shuffleAll}
              activeOpacity={0.85}
            >
              <BlurView tint="dark" intensity={70} style={styles.actionGradient}>
                <LinearGradient
                  colors={["rgba(255, 255, 255, 0.16)", "rgba(255, 255, 255, 0.04)"]}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.shuffleRim} pointerEvents="none" />
                <Ionicons name="shuffle" size={18} color={COLORS.accent} />
                <Text style={styles.shuffleBtnText}>Shuffle</Text>
              </BlurView>
            </TouchableOpacity>
          </View>
        </View>

        {/* Top Songs */}
        {topTracks.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Top Songs</Text>
            {topTracks.map((t, i) => {
              const isCurrent = currentTrack?.id === t.id;
              return (
                <TouchableOpacity
                  key={t.id}
                  style={[styles.trackRow, isCurrent && styles.trackRowActive]}
                  activeOpacity={0.7}
                  onPress={() => usePlayer.getState().playNow(topTracks, i)}
                >
                  <View style={styles.trackNumContainer}>
                    {isCurrent ? (
                      <Ionicons
                        name={isPlaying ? "volume-high" : "pause"}
                        size={16}
                        color={COLORS.accent}
                      />
                    ) : (
                      <Text style={styles.trackNum}>{i + 1}</Text>
                    )}
                  </View>
                  <View style={styles.trackInfo}>
                    <Text
                      style={[styles.trackTitle, isCurrent && styles.trackTitleActive]}
                      numberOfLines={1}
                    >
                      {t.title}
                    </Text>
                    <Text style={styles.trackMeta} numberOfLines={1}>
                      {t.album}
                    </Text>
                  </View>
                  <Text style={styles.trackDur}>{formatDuration(t.duration)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Albums */}
        {albums.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Albums</Text>
            <FlatList
              data={albums}
              keyExtractor={(a) => String(a.id)}
              numColumns={2}
              columnWrapperStyle={styles.grid}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <AlbumCard
                  album={item}
                  style={styles.gridCard}
                  onPress={() => navigation.navigate("AlbumDetail", { albumId: item.id })}
                />
              )}
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scroll: {
    flex: 1,
  },
  hero: {
    alignItems: "center",
    paddingTop: SPACING.lg,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  avatarShadow: {
    ...SHADOW.floating,
    borderRadius: 80,
    marginBottom: SPACING.md,
  },
  avatarDisc: {
    width: 140,
    height: 140,
    borderRadius: 70,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    backgroundColor: COLORS.surfaceSecondary,
  },
  avatarImg: {
    width: "100%",
    height: "100%",
  },
  avatarPlaceholder: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarRim: {
    ...StyleSheet.absoluteFill,
    borderRadius: 70,
    borderWidth: 1.5,
    borderColor: "rgba(255, 255, 255, 0.22)",
    borderTopColor: "rgba(255, 255, 255, 0.50)",
  },
  artistName: {
    fontSize: 28,
    fontWeight: "800",
    color: COLORS.label,
    textAlign: "center",
    letterSpacing: -0.3,
  },
  artistMeta: {
    fontSize: FONT.footnote,
    color: COLORS.muted,
    marginTop: 4,
  },
  heroButtons: {
    flexDirection: "row",
    gap: SPACING.md,
    width: "100%",
    marginTop: SPACING.lg,
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
  playBtnText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: FONT.callout,
  },
  shuffleRim: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderTopColor: "rgba(255, 255, 255, 0.32)",
  },
  shuffleBtnText: {
    color: COLORS.accent,
    fontWeight: "600",
    fontSize: FONT.callout,
  },
  section: {
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONT.title3,
    fontWeight: "700",
    color: COLORS.label,
    marginBottom: SPACING.sm,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
    gap: SPACING.sm,
  },
  trackRowActive: {
    backgroundColor: "rgba(255, 45, 85, 0.08)",
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.xs,
  },
  trackNumContainer: {
    width: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  trackNum: {
    color: COLORS.tertiaryLabel,
    fontSize: FONT.body,
  },
  trackInfo: {
    flex: 1,
  },
  trackTitle: {
    color: COLORS.label,
    fontSize: FONT.body,
    fontWeight: "400",
  },
  trackTitleActive: {
    fontWeight: "600",
    color: COLORS.accent,
  },
  trackMeta: {
    color: COLORS.secondaryLabel,
    fontSize: FONT.footnote,
    marginTop: 2,
  },
  trackDur: {
    color: COLORS.tertiaryLabel,
    fontSize: FONT.footnote,
  },
  grid: {
    gap: SPACING.md,
  },
  gridCard: {
    flex: 1,
  },
});

export { ArtistDetailScreen };
