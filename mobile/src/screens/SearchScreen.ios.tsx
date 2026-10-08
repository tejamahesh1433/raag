import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../api";
import { usePlayer } from "../store/player";
import type { Album, Artist, SearchResults, Track } from "../types";
import AlbumCard from "../components/AlbumCard.ios";
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from "../theme/ios";

interface Props {
  navigation: NativeStackNavigationProp<any>;
}

const GENRE_BG_COLORS = [
  "#ff375f", "#30d158", "#0a84ff", "#ff9f0a", "#bf5af2",
  "#5ac8fa", "#ff6961", "#ffb347", "#77dd77", "#aec6cf",
  "#c77dff", "#f4a261",
];

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function SearchScreen({ navigation }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [genres, setGenres] = useState<{ genre: string; count: number }[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { playNow } = usePlayer();

  useEffect(() => {
    api.genres().then(setGenres).catch(() => {});
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await api.search(query);
        setResults(res);
      } catch {}
      setSearching(false);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const genreGrid = genres.slice(0, 12);
  const cols = 3;
  const rows: typeof genres[] = [];
  for (let i = 0; i < genreGrid.length; i += cols) {
    rows.push(genreGrid.slice(i, i + cols));
  }

  function renderTrackRow(track: Track, idx: number, list: Track[]) {
    const uri = api.artworkUrl(track.artwork_id);
    return (
      <TouchableOpacity
        key={track.id}
        style={styles.trackRow}
        activeOpacity={0.7}
        onPress={() => playNow(list, idx)}
      >
        {uri ? (
          <Image source={{ uri }} style={styles.trackThumb} contentFit="cover" />
        ) : (
          <View style={[styles.trackThumb, { backgroundColor: COLORS.surfaceSecondary }]} />
        )}
        <View style={styles.trackText}>
          <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
          <Text style={styles.trackArtist} numberOfLines={1}>{track.artist}</Text>
        </View>
        <Text style={styles.trackDuration}>{formatDuration(track.duration)}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.root}>
      {/* Ambient background gradient */}
      <LinearGradient
        colors={["#160c1c", "#0a0910", "#030305"]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <Text style={styles.largeTitle}>Search</Text>

        {/* Glossy frosted Search bar */}
        <View style={styles.searchBar}>
          <Ionicons name="search" size={17} color="rgba(255,255,255,0.6)" style={styles.searchIcon} />
          <TextInput
            style={styles.searchInput}
            placeholder="Artists, songs, albums"
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          {searching && <ActivityIndicator size="small" color={COLORS.accent} style={{ marginRight: SPACING.sm }} />}
        </View>

        {!query.trim() ? (
          /* Browse categories with Apple Glossy 3D Tiles */
          <ScrollView contentContainerStyle={styles.browseContent} showsVerticalScrollIndicator={false}>
            <Text style={styles.browseTitle}>Browse Categories</Text>
            {rows.map((row, ri) => (
              <View key={ri} style={styles.genreRow}>
                {row.map((g, ci) => (
                  <TouchableOpacity
                    key={g.genre}
                    style={[styles.genreTile, { backgroundColor: GENRE_BG_COLORS[(ri * cols + ci) % GENRE_BG_COLORS.length] }]}
                    activeOpacity={0.8}
                    onPress={() => setQuery(g.genre)}
                  >
                    {/* Glossy Sheen Overlay */}
                    <LinearGradient
                      colors={["rgba(255,255,255,0.34)", "rgba(255,255,255,0.06)", "transparent"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0.7, y: 0.7 }}
                      style={StyleSheet.absoluteFill}
                      pointerEvents="none"
                    />
                    {/* Specular Rim */}
                    <View style={styles.genreRim} pointerEvents="none" />
                    <Text style={styles.genreTileText}>{g.genre}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
            <View style={{ height: 140 }} />
          </ScrollView>
      ) : (
        /* Results */
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          {results && (
            <>
              {/* Songs */}
              {results.tracks.length > 0 && (
                <View style={styles.resultSection}>
                  <View style={styles.resultHeader}>
                    <Text style={styles.resultSectionTitle}>Songs</Text>
                    {results.tracks.length > 3 && (
                      <TouchableOpacity>
                        <Text style={styles.seeAll}>See All</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {results.tracks.slice(0, 3).map((t, i) =>
                    renderTrackRow(t, i, results.tracks)
                  )}
                </View>
              )}

              {/* Albums */}
              {results.albums.length > 0 && (
                <View style={styles.resultSection}>
                  <View style={styles.resultHeader}>
                    <Text style={styles.resultSectionTitle}>Albums</Text>
                    {results.albums.length > 4 && (
                      <TouchableOpacity>
                        <Text style={styles.seeAll}>See All</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.albumsRow}>
                    {results.albums.slice(0, 8).map((album) => (
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

              {/* Artists */}
              {results.artists.length > 0 && (
                <View style={styles.resultSection}>
                  <View style={styles.resultHeader}>
                    <Text style={styles.resultSectionTitle}>Artists</Text>
                    {results.artists.length > 5 && (
                      <TouchableOpacity>
                        <Text style={styles.seeAll}>See All</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  {results.artists.slice(0, 5).map((artist) => (
                    <TouchableOpacity
                      key={artist.id}
                      style={styles.artistRow}
                      activeOpacity={0.7}
                      onPress={() => navigation.navigate("ArtistDetail", { artistId: artist.id, artistName: artist.name })}
                    >
                      <View style={styles.artistAvatar}>
                        <Text style={styles.avatarLetter}>{artist.name[0]?.toUpperCase()}</Text>
                      </View>
                      <View style={styles.artistText}>
                        <Text style={styles.artistName}>{artist.name}</Text>
                        <Text style={styles.artistSub}>{artist.album_count} albums</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </>
          )}
          <View style={{ height: 120 }} />
        </ScrollView>
      )}
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
  largeTitle: {
    fontSize: 34,
    fontWeight: "700",
    color: COLORS.label,
    letterSpacing: -0.5,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(32, 32, 42, 0.72)",
    borderRadius: RADIUS.lg,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderTopColor: "rgba(255, 255, 255, 0.35)",
    ...SHADOW.card,
  },
  searchIcon: {
    marginRight: SPACING.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: FONT.body,
    color: COLORS.label,
    paddingVertical: 0,
  },
  browseContent: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  browseTitle: {
    fontSize: 21,
    fontWeight: "700",
    color: COLORS.label,
    letterSpacing: -0.3,
    marginBottom: SPACING.md,
  },
  genreRow: {
    flexDirection: "row",
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  genreTile: {
    flex: 1,
    height: 94,
    borderRadius: RADIUS.md,
    alignItems: "flex-start",
    justifyContent: "flex-end",
    padding: SPACING.sm,
    overflow: "hidden",
    position: "relative",
    ...SHADOW.card,
  },
  genreRim: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.18)",
    borderTopColor: "rgba(255, 255, 255, 0.45)",
  },
  genreTileText: {
    fontSize: FONT.callout,
    fontWeight: "700",
    color: COLORS.label,
  },
  resultSection: {
    marginBottom: SPACING.lg,
    paddingHorizontal: SPACING.md,
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  resultSectionTitle: {
    fontSize: FONT.title3,
    fontWeight: "700",
    color: COLORS.label,
  },
  seeAll: {
    fontSize: FONT.subheadline,
    color: COLORS.accent,
    fontWeight: "500",
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
    gap: SPACING.sm,
  },
  trackThumb: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceSecondary,
  },
  trackText: {
    flex: 1,
  },
  trackTitle: {
    fontSize: FONT.body,
    fontWeight: "400",
    color: COLORS.label,
  },
  trackArtist: {
    fontSize: FONT.footnote,
    color: COLORS.secondaryLabel,
    marginTop: 1,
  },
  trackDuration: {
    fontSize: FONT.footnote,
    color: COLORS.muted,
  },
  albumsRow: {
    gap: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  albumCardItem: {
    width: 130,
  },
  artistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
    gap: SPACING.sm,
  },
  artistAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontSize: FONT.title3,
    fontWeight: "600",
    color: COLORS.secondaryLabel,
  },
  artistText: {
    flex: 1,
  },
  artistName: {
    fontSize: FONT.body,
    fontWeight: "400",
    color: COLORS.label,
  },
  artistSub: {
    fontSize: FONT.footnote,
    color: COLORS.secondaryLabel,
    marginTop: 1,
  },
});
