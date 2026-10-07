import { useEffect, useState } from "react";
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableNativeFeedback,
  View,
} from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import { api } from "../api";
import type { Album, Track } from "../types";
import { usePlayer } from "../store/player";
import { COLORS, SPACING, RADIUS } from "../theme/android";
import { AlbumCard } from "../components/AlbumCard.android";
import { TrackItem } from "../components/TrackItem";

type Params = { artistId: number; artistName: string };

export function ArtistDetailScreen() {
  const route = useRoute<RouteProp<{ ArtistDetail: Params }, "ArtistDetail">>();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const insets = useSafeAreaInsets();
  const { artistId, artistName } = route.params;

  const [albums, setAlbums] = useState<Album[]>([]);
  const [topTracks, setTopTracks] = useState<Track[]>([]);

  useEffect(() => {
    Promise.all([api.albums(artistId), api.tracks({ limit: 50 })]).then(([albs, page]) => {
      setAlbums(albs);
      setTopTracks(page.items.filter((t) => t.artist_id === artistId).slice(0, 5));
    });
  }, [artistId]);

  const playAll = async () => {
    const all = await Promise.all(albums.map((a) => api.albumTracks(a.id)));
    usePlayer.getState().playNow(all.flat());
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
    >
      {/* Material hero banner */}
      <LinearGradient colors={[COLORS.accentContainer, COLORS.bg]} style={styles.hero}>
        <Text style={styles.artistName}>{artistName}</Text>
        <View style={styles.heroButtons}>
          <View style={styles.btnWrap}>
            <TouchableNativeFeedback onPress={playAll}>
              <View style={styles.playBtn}>
                <MaterialIcons name="play-arrow" size={20} color="#fff" />
                <Text style={styles.playBtnText}>Play</Text>
              </View>
            </TouchableNativeFeedback>
          </View>
          <View style={styles.btnWrap}>
            <TouchableNativeFeedback
              onPress={async () => {
                const all = await Promise.all(albums.map((a) => api.albumTracks(a.id)));
                usePlayer.getState().playNow(all.flat().sort(() => Math.random() - 0.5));
              }}
            >
              <View style={styles.shuffleBtn}>
                <MaterialIcons name="shuffle" size={20} color={COLORS.accent} />
                <Text style={styles.shuffleBtnText}>Shuffle</Text>
              </View>
            </TouchableNativeFeedback>
          </View>
        </View>
      </LinearGradient>

      {/* Top Tracks */}
      {topTracks.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Top Songs</Text>
          {topTracks.map((t, i) => (
            <TrackItem
              key={t.id}
              track={t}
              onPress={() => usePlayer.getState().playNow(topTracks, i)}
              showAlbum
            />
          ))}
        </View>
      )}

      {/* Albums grid */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Albums</Text>
        <FlatList
          data={albums}
          keyExtractor={(a) => String(a.id)}
          numColumns={2}
          columnWrapperStyle={{ gap: SPACING.sm }}
          scrollEnabled={false}
          renderItem={({ item }) => (
            <View style={{ flex: 1 }}>
              <AlbumCard
                album={item}
                onPress={() => navigation.navigate("AlbumDetail", { albumId: item.id })}
              />
            </View>
          )}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  hero: { paddingTop: 32, paddingHorizontal: SPACING.md, paddingBottom: SPACING.lg },
  artistName: { fontSize: 32, fontWeight: "800", color: COLORS.onBg, marginBottom: SPACING.md },
  heroButtons: { flexDirection: "row", gap: SPACING.sm },
  btnWrap: { flex: 1, borderRadius: RADIUS.md, overflow: "hidden" },
  playBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: 13,
  },
  playBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  shuffleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: RADIUS.md,
    paddingVertical: 13,
  },
  shuffleBtnText: { color: COLORS.accent, fontWeight: "600", fontSize: 15 },
  section: { paddingHorizontal: SPACING.md, marginBottom: SPACING.lg },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.onBg,
    marginBottom: SPACING.sm,
  },
});
