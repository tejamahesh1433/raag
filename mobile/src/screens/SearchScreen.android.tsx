import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../api";
import { usePlayer } from "../store/player";
import { AlbumCard } from "../components/AlbumCard.android";
import { TrackItem } from "../components/TrackItem";
import { Artwork } from "../components/Artwork";
import { COLORS, RADIUS, SPACING } from "../theme/android";

interface Props {
  navigation: NativeStackNavigationProp<any>;
}

// Deterministic color per genre name
const GENRE_COLORS = [
  "#1db954", "#e13300", "#503750", "#006450",
  "#8d67ab", "#e8115b", "#148a08", "#1e3264",
  "#b02897", "#c87d3e", "#477d95", "#e91429",
];
function genreColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return GENRE_COLORS[h % GENRE_COLORS.length];
}

export function SearchScreen({ navigation }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ tracks: any[]; albums: any[]; artists: any[] } | null>(null);
  const [genres, setGenres] = useState<{ genre: string; count: number }[]>([]);
  const [searching, setSearching] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { playNow } = usePlayer();

  useEffect(() => {
    api.genres().then(setGenres).catch(() => {});
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults(null); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try { setResults(await api.search(query)); } catch {}
      setSearching(false);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const hasResults = results && (results.tracks.length + results.albums.length + results.artists.length) > 0;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
        <TouchableOpacity onPress={() => navigation.navigate("Settings" as any)} style={styles.headerBtn}>
          <MaterialIcons name="settings" size={24} color={COLORS.muted} />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={[styles.searchWrap, focused && styles.searchWrapFocused]}>
        <MaterialIcons name="search" size={22} color={focused ? COLORS.accent : COLORS.muted} />
        <TextInput
          ref={inputRef}
          style={styles.searchInput}
          placeholder="Songs, artists, albums…"
          placeholderTextColor={COLORS.muted}
          value={query}
          onChangeText={setQuery}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searching
          ? <ActivityIndicator size="small" color={COLORS.accent} />
          : query.length > 0
            ? <TouchableOpacity onPress={() => setQuery("")}>
                <MaterialIcons name="close" size={20} color={COLORS.muted} />
              </TouchableOpacity>
            : null}
      </View>

      {!query.trim() ? (
        /* Browse */
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.browseContent}>
          <Text style={styles.sectionLabel}>Browse</Text>
          <View style={styles.genreGrid}>
            {genres.slice(0, 18).map(({ genre, count }) => (
              <Pressable
                key={genre}
                style={[styles.genreCard, { backgroundColor: genreColor(genre) }]}
                onPress={() => setQuery(genre)}
                android_ripple={{ color: "rgba(255,255,255,0.2)" }}
              >
                <Text style={styles.genreName} numberOfLines={2}>{genre}</Text>
                <Text style={styles.genreCount}>{count} songs</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      ) : (
        /* Results */
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.resultsContent}
        >
          {searching && !results && (
            <View style={styles.center}>
              <ActivityIndicator color={COLORS.accent} />
            </View>
          )}

          {results && !hasResults && (
            <View style={styles.center}>
              <MaterialIcons name="search-off" size={48} color={COLORS.muted} />
              <Text style={styles.emptyText}>No results for "{query}"</Text>
            </View>
          )}

          {results && results.tracks.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Songs</Text>
              {results.tracks.slice(0, 8).map((track, i) => (
                <TrackItem
                  key={track.id}
                  track={track}
                  isPlaying={false}
                  onPress={() => playNow(results.tracks, i)}
                  showAlbum
                />
              ))}
            </View>
          )}

          {results && results.albums.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Albums</Text>
              <FlatList
                data={results.albums.slice(0, 8)}
                horizontal
                keyExtractor={(item) => String(item.id)}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: SPACING.md, gap: SPACING.sm }}
                renderItem={({ item }) => (
                  <View style={{ width: 148 }}>
                    <AlbumCard
                      album={item}
                      onPress={() => navigation.navigate("AlbumDetail", { albumId: item.id })}
                    />
                  </View>
                )}
              />
            </View>
          )}

          {results && results.artists.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Artists</Text>
              {results.artists.slice(0, 5).map((artist) => (
                <Pressable
                  key={artist.id}
                  style={({ pressed }) => [styles.artistRow, pressed && { backgroundColor: COLORS.surfaceVariant }]}
                  onPress={() => navigation.navigate("ArtistDetail", { artistId: artist.id, artistName: artist.name })}
                >
                  <View style={styles.artistAvatar}>
                    <Text style={styles.avatarLetter}>{artist.name[0]?.toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.artistName}>{artist.name}</Text>
                    <Text style={styles.artistSub}>{artist.album_count} albums</Text>
                  </View>
                  <MaterialIcons name="chevron-right" size={22} color={COLORS.muted} />
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    color: COLORS.onBg,
  },
  headerBtn: { padding: SPACING.sm },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: "transparent",
  },
  searchWrapFocused: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.surface,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: COLORS.onBg,
    padding: 0,
  },

  browseContent: {
    paddingBottom: 140,
  },
  sectionLabel: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.onBg,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    marginTop: 4,
  },
  genreGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  genreCard: {
    width: "48.5%",
    height: 88,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    justifyContent: "flex-end",
    overflow: "hidden",
  },
  genreName: {
    fontSize: 16,
    fontWeight: "800",
    color: "#fff",
    textShadowColor: "rgba(0,0,0,0.4)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  genreCount: {
    fontSize: 11,
    color: "rgba(255,255,255,0.75)",
    marginTop: 2,
  },

  resultsContent: {
    paddingBottom: 140,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    gap: SPACING.md,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 15,
  },

  artistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    gap: SPACING.md,
  },
  artistAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.surfaceVariant,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.muted,
  },
  artistName: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.onBg,
  },
  artistSub: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
  },
});
