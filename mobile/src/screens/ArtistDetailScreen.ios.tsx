import { useEffect, useState } from "react";
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
import { api } from "../api";
import type { Album, Track } from "../types";
import AlbumCard from "../components/AlbumCard.ios";
import { usePlayer } from "../store/player";
import { COLORS, FONT, SPACING, RADIUS } from "../theme/ios";

type Params = { artistId: number; artistName: string };

export function ArtistDetailScreen() {
  const route = useRoute<RouteProp<{ ArtistDetail: Params }, "ArtistDetail">>();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const insets = useSafeAreaInsets();
  const { artistId, artistName } = route.params;

  const [albums, setAlbums] = useState<Album[]>([]);
  const [topTracks, setTopTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([api.albums(artistId), api.tracks({ limit: 5 })]).then(([albs, page]) => {
      setAlbums(albs);
      setTopTracks(page.items.filter((t) => t.artist_id === artistId).slice(0, 5));
      setLoading(false);
    });
  }, [artistId]);

  const playAll = async () => {
    const all = await Promise.all(albums.map((a) => api.albumTracks(a.id)));
    usePlayer.getState().playNow(all.flat());
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: insets.bottom + 80 }}
    >
      {/* Hero */}
      <View style={styles.hero}>
        <Text style={styles.artistName}>{artistName}</Text>
        <View style={styles.heroButtons}>
          <TouchableOpacity style={styles.playBtn} onPress={playAll}>
            <Text style={styles.playBtnText}>▶  Play</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.shuffleBtn}
            onPress={async () => {
              const all = await Promise.all(albums.map((a) => api.albumTracks(a.id)));
              const flat = all.flat();
              usePlayer.getState().playNow(
                flat.sort(() => Math.random() - 0.5),
              );
            }}
          >
            <Text style={styles.shuffleBtnText}>⇌  Shuffle</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Top Songs */}
      {topTracks.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Songs</Text>
          {topTracks.map((t, i) => (
            <TouchableOpacity
              key={t.id}
              style={styles.trackRow}
              onPress={() => usePlayer.getState().playNow(topTracks, i)}
            >
              <Text style={styles.trackNum}>{i + 1}</Text>
              <View style={styles.trackInfo}>
                <Text style={styles.trackTitle} numberOfLines={1}>{t.title}</Text>
                <Text style={styles.trackMeta} numberOfLines={1}>{t.album}</Text>
              </View>
              <Text style={styles.trackDur}>
                {Math.floor(t.duration / 60)}:{String(t.duration % 60).padStart(2, "0")}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Albums */}
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  hero: {
    paddingTop: SPACING.xl,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.lg,
  },
  artistName: {
    fontSize: 32,
    fontWeight: "800",
    color: COLORS.label,
    marginBottom: SPACING.md,
  },
  heroButtons: { flexDirection: "row", gap: SPACING.sm },
  playBtn: {
    flex: 1,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.xl,
    paddingVertical: 13,
    alignItems: "center",
  },
  playBtnText: { color: "#fff", fontWeight: "700", fontSize: FONT.callout },
  shuffleBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: RADIUS.xl,
    paddingVertical: 13,
    alignItems: "center",
  },
  shuffleBtnText: { color: COLORS.accent, fontWeight: "600", fontSize: FONT.callout },
  section: { paddingHorizontal: SPACING.md, marginBottom: SPACING.lg },
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
  },
  trackNum: { width: 28, color: COLORS.tertiaryLabel, fontSize: FONT.body },
  trackInfo: { flex: 1 },
  trackTitle: { color: COLORS.label, fontSize: FONT.body },
  trackMeta: { color: COLORS.secondaryLabel, fontSize: FONT.footnote, marginTop: 2 },
  trackDur: { color: COLORS.tertiaryLabel, fontSize: FONT.footnote },
  grid: { gap: SPACING.sm },
  gridCard: { flex: 1 },
});
