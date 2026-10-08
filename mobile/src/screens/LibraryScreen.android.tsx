import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { MaterialIcons } from "@expo/vector-icons";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { AlbumCard } from "../components/AlbumCard.android";
import { TrackItem } from "../components/TrackItem";
import { COLORS, ELEVATION, RADIUS, SPACING } from "../theme/android";
import { api } from "../api";
import { usePlayer } from "../store/player";
import type { Album, Artist, Track } from "../types";
import type { LibraryStackParamList } from "../navigation/types";

type LibraryTab = "Artists" | "Albums" | "Tracks";
const TABS: LibraryTab[] = ["Artists", "Albums", "Tracks"];

export function LibraryScreen() {
  const insets = useSafeAreaInsets();
  const navigation =
    useNavigation<NativeStackNavigationProp<LibraryStackParamList>>();
  const [activeTab, setActiveTab] = useState<LibraryTab>("Albums");
  const [artists, setArtists] = useState<Artist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);

  const currentIndex = usePlayer((s) => s.index);
  const queue = usePlayer((s) => s.queue);
  const currentId = currentIndex >= 0 ? queue[currentIndex]?.id : undefined;

  useEffect(() => {
    setLoading(true);
    void Promise.all([
      api.artists().catch(() => []),
      api.albums().catch(() => []),
      api.tracks({ limit: 500 }).catch(() => ({ items: [], total: 0, offset: 0, limit: 500 })),
    ])
      .then(([a, al, t]) => {
        setArtists(Array.isArray(a) ? a : []);
        setAlbums(Array.isArray(al) ? al : []);
        setTracks(t && Array.isArray(t.items) ? t.items : []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const albumsById: Record<number, Album> = {};
  for (const a of albums) albumsById[a.id] = a;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Library</Text>
        <Pressable onPress={() => navigation.navigate("Settings" as never)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <MaterialIcons name="settings" size={24} color={COLORS.muted} />
        </Pressable>
      </View>
      <View style={styles.tabRow}>
        {TABS.map((tab) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab && styles.tabTextActive,
              ]}
            >
              {tab}
            </Text>
          </Pressable>
        ))}
      </View>

      {loading && (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.accent} />
        </View>
      )}

      {!loading && activeTab === "Artists" && (
        <FlatList
          data={artists}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => navigation.navigate("ArtistDetail", { artistId: item.id, artistName: item.name })}
              style={({ pressed }) => [
                styles.artistRow,
                pressed && styles.rowPressed,
              ]}
            >
              <View style={styles.artistInfo}>
                <Text style={styles.artistName}>{item.name}</Text>
                <Text style={styles.artistMeta}>
                  {item.track_count} tracks · {item.album_count} albums
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
          contentContainerStyle={styles.listContent}
        />
      )}

      {!loading && activeTab === "Albums" && (
        <FlatList
          data={albums}
          keyExtractor={(item) => String(item.id)}
          numColumns={2}
          columnWrapperStyle={styles.albumGrid}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <View style={styles.albumGridItem}>
              <AlbumCard
                album={item}
                onPress={() => navigation.navigate("AlbumDetail", { albumId: item.id })}
              />
            </View>
          )}
        />
      )}

      {!loading && activeTab === "Tracks" && (
        <FlatList
          data={tracks}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item, index }) => (
            <TrackItem
              track={item}
              isPlaying={item.id === currentId}
              artworkId={
                item.album_id ? albumsById[item.album_id]?.artwork_id : null
              }
              onPress={() => usePlayer.getState().playNow(tracks, index)}
              showAlbum
            />
          )}
          contentContainerStyle={styles.listContent}
        />
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.sm,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "900",
    color: COLORS.onBg,
  },
  tabRow: {
    flexDirection: "row",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    ...ELEVATION.card,
    backgroundColor: COLORS.surface,
  },
  tab: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.surfaceVariant,
  },
  tabActive: {
    backgroundColor: COLORS.accentContainer,
  },
  tabText: {
    fontSize: 13,
    color: COLORS.muted,
    fontWeight: "500",
  },
  tabTextActive: {
    color: COLORS.accent,
    fontWeight: "700",
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 14,
  },
  listContent: {
    paddingBottom: 140,
  },
  artistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.outline,
  },
  rowPressed: {
    backgroundColor: COLORS.surfaceVariant,
  },
  artistInfo: {
    flex: 1,
  },
  artistName: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.onBg,
  },
  artistMeta: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
  },
  chevron: {
    fontSize: 20,
    color: COLORS.muted,
  },
  albumGrid: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  albumGridItem: {
    flex: 1,
  },
});
