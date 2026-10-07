import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { AlbumCard } from "../components/AlbumCard.android";
import { TrackItem } from "../components/TrackItem";
import { COLORS, ELEVATION, RADIUS, SPACING } from "../theme/android";
import { api } from "../api";
import { usePlayer } from "../store/player";
import type { Album, Track } from "../types";

export function HomeScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const insets = useSafeAreaInsets();

  const [albums, setAlbums] = useState<Album[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [genres, setGenres] = useState<{ genre: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);

  const currentIndex = usePlayer((s) => s.index);
  const currentQueue = usePlayer((s) => s.queue);
  const currentId = currentIndex >= 0 ? currentQueue[currentIndex]?.id : undefined;

  useEffect(() => {
    setLoading(true);
    void Promise.all([
      api.albums().catch(() => []),
      api.tracks({ limit: 50 }).catch(() => ({ items: [], total: 0, offset: 0, limit: 50 })),
      api.genres().catch(() => []),
    ]).then(([allAlbums, tracksPage, genreList]) => {
      setAlbums(Array.isArray(allAlbums) ? allAlbums.slice(0, 20) : []);
      setTracks(tracksPage && Array.isArray(tracksPage.items) ? tracksPage.items : []);
      setGenres(Array.isArray(genreList) ? genreList.filter(g => g.genre) : []);
    })
    .catch(() => {})
    .finally(() => setLoading(false));
  }, []);

  const shuffleAll = useCallback(async () => {
    const page = await api.tracks({ limit: 500 }).catch(() => ({ items: [] }));
    if (page.items && page.items.length > 0) {
      const shuffled = [...page.items].sort(() => Math.random() - 0.5);
      usePlayer.getState().playNow(shuffled, 0);
    }
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={styles.logoTitleWrap}>
            <Image
              source={require("../../assets/icon.png")}
              style={styles.headerLogo}
            />
            <Text style={styles.wordmark}>Raag</Text>
          </View>
          <TouchableOpacity
            onPress={() => navigation.getParent()?.navigate("SearchTab")}
            style={styles.headerBtn}
          >
            <MaterialIcons name="search" size={24} color={COLORS.onBg} />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color={COLORS.accent} />
          </View>
        ) : (
          <>
            {albums.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Albums</Text>
                <FlatList
                  data={albums}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyExtractor={(item) => String(item.id)}
                  contentContainerStyle={styles.hListContent}
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

            {tracks.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Songs</Text>
                {tracks.map((track, i) => (
                  <TrackItem
                    key={track.id}
                    track={track}
                    isPlaying={track.id === currentId}
                    onPress={() => usePlayer.getState().playNow(tracks, i)}
                  />
                ))}
              </View>
            )}

            {genres.length > 0 && (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Genres</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.genreRow}
                >
                  {genres.map(({ genre }) => (
                    <Pressable
                      key={genre}
                      style={({ pressed }) => [
                        styles.genreChip,
                        pressed && styles.genreChipPressed,
                      ]}
                    >
                      <Text style={styles.genreChipText}>{genre}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        )}

        <View style={{ height: SPACING.xl * 2 }} />
      </ScrollView>

      <TouchableOpacity style={[styles.fab, ELEVATION.modal]} onPress={shuffleAll}>
        <MaterialIcons name="shuffle" size={24} color={COLORS.onAccent} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  loadingBox: {
    padding: SPACING.xl * 2,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: SPACING.xl,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  logoTitleWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerLogo: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  wordmark: {
    fontSize: 28,
    fontWeight: "900",
    color: COLORS.accent,
    letterSpacing: -0.5,
  },
  headerBtn: {
    padding: SPACING.sm,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.onBg,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  hListContent: {
    paddingHorizontal: SPACING.md,
  },
  albumCardWrap: {
    width: 140,
  },
  genreRow: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  genreChip: {
    backgroundColor: COLORS.surfaceVariant,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  genreChipPressed: {
    backgroundColor: COLORS.accentContainer,
    borderColor: COLORS.accent,
  },
  genreChipText: {
    fontSize: 13,
    color: COLORS.onSurface,
  },
  fab: {
    position: "absolute",
    bottom: SPACING.lg,
    right: SPACING.lg,
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },
});
