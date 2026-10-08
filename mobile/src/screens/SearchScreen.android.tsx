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
import { Image } from "expo-image";
import { MaterialIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../api";
import { usePlayer } from "../store/player";
import { AlbumCard } from "../components/AlbumCard.android";
import { TrackItem } from "../components/TrackItem";
import { COLORS, ELEVATION, RADIUS, SPACING } from "../theme/android";

interface Props {
  navigation: NativeStackNavigationProp<any>;
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function SearchScreen({ navigation }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ tracks: any[]; albums: any[]; artists: any[] } | null>(null);
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

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={styles.largeTitle}>Search</Text>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <MaterialIcons name="search" size={20} color={COLORS.muted} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Artists, songs, albums"
          placeholderTextColor={COLORS.muted}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        {searching && <ActivityIndicator size="small" color={COLORS.muted} style={{ marginRight: SPACING.sm }} />}
      </View>

      {!query.trim() ? (
        /* Browse categories - Material You chips */
        <ScrollView contentContainerStyle={styles.browseContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.browseTitle}>Browse Genres</Text>
          <View style={styles.genreGrid}>
            {genres.slice(0, 18).map(({ genre }, i) => (
              <Pressable
                key={genre}
                style={[{ backgroundColor: i % 2 === 0 ? COLORS.accentContainer : COLORS.surfaceVariant }, styles.genreChip]}
                onPress={() => setQuery(genre)}
              >
                <Text style={styles.genreChipText}>{genre}</Text>
              </Pressable>
            ))}
          </View>
          <View style={{ height: 140 }} />
        </ScrollView>
      ) : (
        /* Results */
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
          {results && (
            <>
              {/* Songs */}
              {results.tracks.length > 0 && (
                <View style={styles.resultSection}>
                  <View style={styles.resultHeader}>
                    <Text style={styles.resultSectionTitle}>Songs</Text>
                  </View>
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

              {/* Albums */}
              {results.albums.length > 0 && (
                <View style={styles.resultSection}>
                  <View style={styles.resultHeader}>
                    <Text style={styles.resultSectionTitle}>Albums</Text>
                  </View>
                  <FlatList
                    data={results.albums.slice(0, 8)}
                    horizontal
                    keyExtractor={(item) => String(item.id)}
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.albumsRow}
                    ItemSeparatorComponent={() => <View style={{ width: SPACING.sm }} />}
                    renderItem={({ item }) => (
                      <View style={styles.albumCardWrap}>
                        <AlbumCard
                          album={item}
                          onPress={() => navigation.navigate("AlbumDetail", { albumId: item.id })}
                        />
                      </View>
                    )}
                  />
                </View>
              )}

              {/* Artists */}
              {results.artists.length > 0 && (
                <View style={styles.resultSection}>
                  <View style={styles.resultHeader}>
                    <Text style={styles.resultSectionTitle}>Artists</Text>
                  </View>
                  {results.artists.slice(0, 5).map((artist) => (
                    <Pressable
                      key={artist.id}
                      style={({ pressed }) => [styles.artistRow, pressed && styles.artistRowPressed]}
                      onPress={() => navigation.navigate("ArtistDetail", { artistId: artist.id, artistName: artist.name })}
                    >
                      <View style={styles.artistAvatar}>
                        <Text style={styles.avatarLetter}>{artist.name[0]?.toUpperCase()}</Text>
                      </View>
                      <View style={styles.artistText}>
                        <Text style={styles.artistName}>{artist.name}</Text>
                        <Text style={styles.artistSub}>{artist.album_count} albums</Text>
                      </View>
                      <MaterialIcons name="chevron-right" size={20} color={COLORS.muted} />
                    </Pressable>
                  ))}
                </View>
              )}
            </>
          )}
          <View style={{ height: 140 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  largeTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: COLORS.onBg,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: RADIUS.pill,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  searchIcon: {
    marginRight: SPACING.xs,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: COLORS.onBg,
  },
  browseContent: {
    paddingHorizontal: SPACING.md,
    paddingBottom: 140,
  },
  browseTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.onBg,
    marginBottom: SPACING.md,
  },
  genreGrid: {
    gap: SPACING.sm,
  },
  genreChip: {
    flex: 1,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.outline,
    minWidth: 90,
  },
  genreChipText: {
    fontSize: 13,
    color: COLORS.onSurface,
    textAlign: "center",
  },
  resultSection: {
    marginBottom: SPACING.xl,
    paddingHorizontal: SPACING.md,
  },
  resultHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: SPACING.sm,
  },
  resultSectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.onBg,
  },
  artistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.outline,
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  artistRowPressed: {
    backgroundColor: COLORS.surfaceVariant,
  },
  artistAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.surfaceVariant,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLetter: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.muted,
  },
  artistText: {
    flex: 1,
  },
  artistName: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.onBg,
  },
  artistSub: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
  },
  albumsRow: {
    gap: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  albumCardWrap: {
    width: 150,
  },
});
