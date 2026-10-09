import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../api";
import { usePlayer } from "../store/player";
import type { Album, Track } from "../types";
import AlbumCard from "../components/AlbumCard.ios";
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from "../theme/ios";

interface Props {
  navigation: NativeStackNavigationProp<any>;
}

export default function HomeScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(true);
  const [recentlyAdded, setRecentlyAdded] = useState<Album[]>([]);
  const [recentlyPlayed, setRecentlyPlayed] = useState<Track[]>([]);
  const [genres, setGenres] = useState<{ genre: string; count: number }[]>([]);
  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    async function load() {
      try {
        const [addedRes, playedRes, genresRes] = await Promise.all([
          api.albums(),
          api.recentlyPlayed(),
          api.genres(),
        ]);
        const valid = (addedRes || []).filter(
          (a) => a && a.title && a.title.trim().length > 0
        );
        setRecentlyAdded(valid.slice(0, 20));
        setRecentlyPlayed((playedRes || []).slice(0, 20));
        setGenres((genresRes || []).slice(0, 12));
      } catch {} finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const largeTitleOpacity = scrollY.interpolate({
    inputRange: [0, 60],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const hero = recentlyAdded.find((a) => a.artwork_id && a.title) || recentlyAdded[0];
  const heroArtwork = hero ? api.artworkUrl(hero.artwork_id) : null;

  return (
    <View style={styles.root}>
      {/* Ambient background gradient */}
      <LinearGradient
        colors={["#160c1c", "#0a0910", "#030305"]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Animated.ScrollView
          style={styles.scroll}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
          showsVerticalScrollIndicator={false}
        >
          {/* Large title with glossy Settings button */}
          <Animated.View style={[styles.largeTitleRow, { opacity: largeTitleOpacity }]}>
            <Text style={styles.largeTitle}>Listen Now</Text>
            <TouchableOpacity
              style={styles.settingsBtn}
              onPress={() => navigation.navigate("Settings")}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Ionicons name="settings-outline" size={20} color={COLORS.label} />
            </TouchableOpacity>
          </Animated.View>

          {loading ? (
            <View style={styles.stateContainer}>
              <ActivityIndicator size="large" color={COLORS.accent} />
            </View>
          ) : recentlyAdded.length === 0 && recentlyPlayed.length === 0 ? (
            <View style={styles.stateContainer}>
              <Ionicons name="musical-notes-outline" size={48} color={COLORS.muted} style={{ marginBottom: 12 }} />
              <Text style={styles.emptyTitle}>No Music in Library</Text>
              <Text style={styles.emptySubtitle}>Albums and recently played tracks will appear here once connected to your music library.</Text>
            </View>
          ) : null}

          {/* Featured Hero Card with Apple Glossy Sheen */}
          {hero && (
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Featured</Text>
              </View>
              <View style={styles.heroShadow}>
                <TouchableOpacity
                  style={styles.heroCard}
                  activeOpacity={0.92}
                  onPress={() => navigation.navigate("AlbumDetail", { albumId: hero.id })}
                >
                  {heroArtwork ? (
                    <Image source={{ uri: heroArtwork }} style={styles.heroArtwork} contentFit="cover" />
                  ) : (
                    <View style={[styles.heroArtwork, { backgroundColor: COLORS.surfaceSecondary }]} />
                  )}

                  {/* Dramatic vignette gradient */}
                  <LinearGradient
                    colors={["rgba(0,0,0,0.15)", "rgba(0,0,0,0.35)", "rgba(0,0,0,0.92)"]}
                    style={styles.heroGradient}
                    pointerEvents="none"
                  />

                  {/* Apple Glossy Sheen Reflection */}
                  <LinearGradient
                    colors={["rgba(255,255,255,0.32)", "rgba(255,255,255,0.05)", "transparent"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0.7, y: 0.7 }}
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />

                  {/* Specular Rim Border */}
                  <View style={styles.heroRim} pointerEvents="none" />

                  {/* Frosted Featured Tag */}
                  <View style={styles.heroPillContainer}>
                    <BlurView tint="dark" intensity={70} style={styles.heroPillBlur}>
                      <Text style={styles.heroPillText}>FEATURED ALBUM</Text>
                    </BlurView>
                  </View>

                  {/* Content & Play Button */}
                  <View style={styles.heroBottomRow}>
                    <View style={styles.heroText}>
                      <Text style={styles.heroAlbum} numberOfLines={1}>{hero.title}</Text>
                      <Text style={styles.heroArtist} numberOfLines={1}>{hero.artist}</Text>
                    </View>

                    {/* Glossy Circular Play Button */}
                    <View style={styles.heroPlayCircle}>
                      <BlurView tint="dark" intensity={80} style={StyleSheet.absoluteFill} />
                      <LinearGradient
                        colors={["rgba(255,255,255,0.32)", "rgba(255,255,255,0.1)"]}
                        style={StyleSheet.absoluteFill}
                      />
                      <Ionicons name="play" size={24} color="#ffffff" style={{ marginLeft: 3 }} />
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Recently Added Section */}
          {recentlyAdded.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Recently Added</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.hScroll}
              >
                {recentlyAdded.map((album) => (
                  <AlbumCard
                    key={album.id}
                    album={album}
                    style={styles.albumCardItem}
                    onPress={() => navigation.navigate("AlbumDetail", { albumId: album.id })}
                  />
                ))}
              </ScrollView>
            </View>
          )}

          {/* Recently Played Section (Glossy Vinyl Discs) */}
          {recentlyPlayed.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Recently Played</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.hScroll}
              >
                {recentlyPlayed.map((track, idx) => {
                  const uri = api.artworkUrl(track.artwork_id);
                  return (
                    <TouchableOpacity
                      key={track.id}
                      style={styles.recentItem}
                      activeOpacity={0.75}
                      onPress={() => usePlayer.getState().playNow(recentlyPlayed, idx)}
                    >
                      <View style={styles.vinylContainer}>
                        {uri ? (
                          <Image source={{ uri }} style={styles.recentThumb} contentFit="cover" />
                        ) : (
                          <View style={[styles.recentThumb, { backgroundColor: COLORS.surfaceSecondary }]} />
                        )}
                        {/* Glossy Sheen Overlay */}
                        <LinearGradient
                          colors={["rgba(255,255,255,0.35)", "rgba(255,255,255,0.06)", "transparent"]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 0.7, y: 0.7 }}
                          style={StyleSheet.absoluteFill}
                          pointerEvents="none"
                        />
                        {/* Vinyl Specular Rim */}
                        <View style={styles.vinylRim} pointerEvents="none" />
                      </View>
                      <Text style={styles.recentTitle} numberOfLines={2}>{track.title}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Genres Pills with Frosted Blur */}
          {genres.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionTitle}>Genres</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.hScroll}
              >
                {genres.map((g) => (
                  <View key={g.genre} style={styles.genrePillBox}>
                    <BlurView tint="dark" intensity={70} style={styles.genrePillBlur}>
                      <Text style={styles.genreText}>{g.genre}</Text>
                    </BlurView>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

          <View style={{ height: 140 }} />
        </Animated.ScrollView>
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
  scroll: {
    flex: 1,
  },
  largeTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  largeTitle: {
    fontSize: 34,
    fontWeight: "700",
    color: COLORS.label,
    letterSpacing: -0.5,
  },
  settingsBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    borderTopColor: "rgba(255, 255, 255, 0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  stateContainer: {
    paddingVertical: 60,
    paddingHorizontal: SPACING.xl,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: FONT.title3,
    fontWeight: "600",
    color: COLORS.label,
    textAlign: "center",
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: FONT.subheadline,
    color: COLORS.secondaryLabel,
    textAlign: "center",
    lineHeight: 20,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  sectionTitle: {
    fontSize: 21,
    fontWeight: "700",
    color: COLORS.label,
    letterSpacing: -0.3,
  },
  heroShadow: {
    marginHorizontal: SPACING.md,
    borderRadius: RADIUS.xl,
    ...SHADOW.floating,
  },
  heroCard: {
    borderRadius: RADIUS.xl,
    overflow: "hidden",
    height: 280,
    position: "relative",
    backgroundColor: "#16161e",
  },
  heroArtwork: {
    ...StyleSheet.absoluteFill,
  },
  heroGradient: {
    ...StyleSheet.absoluteFill,
  },
  heroRim: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
    borderTopColor: "rgba(255, 255, 255, 0.45)",
  },
  heroPillContainer: {
    position: "absolute",
    top: SPACING.md,
    left: SPACING.md,
    borderRadius: RADIUS.full,
    overflow: "hidden",
  },
  heroPillBlur: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  heroPillText: {
    fontSize: 10,
    fontWeight: "700",
    color: "#ffffff",
    letterSpacing: 0.8,
  },
  heroBottomRow: {
    position: "absolute",
    bottom: SPACING.md,
    left: SPACING.md,
    right: SPACING.md,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  heroText: {
    flex: 1,
  },
  heroAlbum: {
    fontSize: 23,
    fontWeight: "700",
    color: COLORS.label,
    letterSpacing: -0.4,
  },
  heroArtist: {
    fontSize: FONT.body,
    fontWeight: "400",
    color: "rgba(255, 255, 255, 0.75)",
    marginTop: 2,
  },
  heroPlayCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
    borderTopColor: "rgba(255, 255, 255, 0.5)",
    ...SHADOW.gloss,
  },
  hScroll: {
    paddingHorizontal: SPACING.md,
    gap: 14,
  },
  albumCardItem: {
    width: 145,
  },
  recentItem: {
    width: 92,
    alignItems: "center",
  },
  vinylContainer: {
    width: 86,
    height: 86,
    borderRadius: 43,
    overflow: "hidden",
    position: "relative",
    ...SHADOW.card,
    marginBottom: SPACING.xs,
  },
  recentThumb: {
    width: "100%",
    height: "100%",
    borderRadius: 43,
    backgroundColor: COLORS.surfaceSecondary,
  },
  vinylRim: {
    ...StyleSheet.absoluteFill,
    borderRadius: 43,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.16)",
    borderTopColor: "rgba(255, 255, 255, 0.4)",
  },
  recentTitle: {
    fontSize: FONT.caption,
    fontWeight: "500",
    color: COLORS.secondaryLabel,
    textAlign: "center",
    marginTop: 2,
  },
  genrePillBox: {
    borderRadius: RADIUS.full,
    overflow: "hidden",
    ...SHADOW.card,
  },
  genrePillBlur: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: RADIUS.full,
    backgroundColor: "rgba(36, 36, 46, 0.65)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderTopColor: "rgba(255, 255, 255, 0.35)",
  },
  genreText: {
    fontSize: FONT.subheadline,
    fontWeight: "600",
    color: COLORS.label,
  },
});
