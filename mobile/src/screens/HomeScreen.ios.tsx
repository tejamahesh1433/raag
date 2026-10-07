import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../api";
import type { Album, Track } from "../types";
import AlbumCard from "../components/AlbumCard.ios";
import { COLORS, FONT, RADIUS, SPACING } from "../theme/ios";

interface Props {
  navigation: NativeStackNavigationProp<any>;
}

const GENRE_COLORS = [
  "#ff375f", "#30d158", "#0a84ff", "#ff9f0a", "#bf5af2", "#5ac8fa",
  "#ff6961", "#ffb347", "#77dd77", "#aec6cf",
];

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function HomeScreen({ navigation }: Props) {
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
        // Sort albums by most recently added — use slice for top 20
        setRecentlyAdded(addedRes.slice(0, 20));
        setRecentlyPlayed(playedRes.slice(0, 20));
        setGenres(genresRes.slice(0, 12));
      } catch {}
    }
    load();
  }, []);

  const largeTitleOpacity = scrollY.interpolate({
    inputRange: [0, 60],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  const hero = recentlyAdded[0];
  const heroArtwork = hero ? api.artworkUrl(hero.artwork_id) : null;

  return (
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
        {/* Large title */}
        <Animated.View style={[styles.largeTitleRow, { opacity: largeTitleOpacity }]}>
          <Text style={styles.largeTitle}>Listen Now</Text>
        </Animated.View>

        {/* Featured hero */}
        {hero && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Featured</Text>
            <TouchableOpacity
              style={styles.heroCard}
              activeOpacity={0.9}
              onPress={() => navigation.navigate("AlbumDetail", { albumId: hero.id })}
            >
              {heroArtwork ? (
                <Image source={{ uri: heroArtwork }} style={styles.heroArtwork} contentFit="cover" />
              ) : (
                <View style={[styles.heroArtwork, { backgroundColor: COLORS.surfaceSecondary }]} />
              )}
              <LinearGradient
                colors={["transparent", "rgba(0,0,0,0.85)"]}
                style={styles.heroGradient}
              />
              <View style={styles.heroText}>
                <Text style={styles.heroAlbum} numberOfLines={2}>{hero.title}</Text>
                <Text style={styles.heroArtist}>{hero.artist}</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Recently Added */}
        {recentlyAdded.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recently Added</Text>
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

        {/* Recently Played */}
        {recentlyPlayed.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recently Played</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hScroll}
            >
              {recentlyPlayed.map((track) => {
                const uri = api.artworkUrl(track.album_id);
                return (
                  <View key={track.id} style={styles.recentItem}>
                    {uri ? (
                      <Image source={{ uri }} style={styles.recentThumb} contentFit="cover" />
                    ) : (
                      <View style={[styles.recentThumb, { backgroundColor: COLORS.surfaceSecondary }]} />
                    )}
                    <Text style={styles.recentTitle} numberOfLines={2}>{track.title}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Genres */}
        {genres.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Genres</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hScroll}
            >
              {genres.map((g, i) => (
                <View
                  key={g.genre}
                  style={[styles.genrePill, { backgroundColor: COLORS.surfaceSecondary }]}
                >
                  <Text style={styles.genreText}>{g.genre}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={{ height: 120 }} />
      </Animated.ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  scroll: {
    flex: 1,
  },
  largeTitleRow: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  largeTitle: {
    fontSize: 34,
    fontWeight: "700",
    color: COLORS.label,
  },
  section: {
    marginBottom: SPACING.xl,
  },
  sectionTitle: {
    fontSize: FONT.title3,
    fontWeight: "700",
    color: COLORS.label,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  heroCard: {
    marginHorizontal: SPACING.md,
    borderRadius: RADIUS.lg,
    overflow: "hidden",
    height: 260,
  },
  heroArtwork: {
    ...StyleSheet.absoluteFill,
  },
  heroGradient: {
    ...StyleSheet.absoluteFill,
  },
  heroText: {
    position: "absolute",
    bottom: SPACING.md,
    left: SPACING.md,
    right: SPACING.md,
  },
  heroAlbum: {
    fontSize: FONT.title2,
    fontWeight: "700",
    color: COLORS.label,
  },
  heroArtist: {
    fontSize: FONT.body,
    fontWeight: "400",
    color: COLORS.secondaryLabel,
    marginTop: 2,
  },
  hScroll: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
  },
  albumCardItem: {
    width: 140,
  },
  recentItem: {
    width: 90,
    alignItems: "center",
  },
  recentThumb: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: COLORS.surfaceSecondary,
    marginBottom: SPACING.xs,
  },
  recentTitle: {
    fontSize: FONT.caption,
    fontWeight: "400",
    color: COLORS.secondaryLabel,
    textAlign: "center",
  },
  genrePill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.xl,
  },
  genreText: {
    fontSize: FONT.subheadline,
    fontWeight: "500",
    color: COLORS.label,
  },
});
