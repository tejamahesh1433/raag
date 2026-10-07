import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { MaterialIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { api } from "../api";
import { usePlayer } from "../store/player";
import type { Album, Track } from "../types";
import { COLORS, ELEVATION, RADIUS, SPACING } from "../theme/android";

interface Props {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<{ AlbumDetail: { albumId: number } }, "AlbumDetail">
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function totalDuration(tracks: Track[]) {
  const total = tracks.reduce((acc, t) => acc + t.duration, 0);
  const m = Math.floor(total / 60);
  return `${m} min`;
}

export function AlbumDetailScreen({ navigation, route }: Props) {
  const { albumId } = route.params;
  const [album, setAlbum] = useState<Album | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [moreAlbums, setMoreAlbums] = useState<Album[]>([]);
  const { playNow } = usePlayer();

  useEffect(() => {
    async function load() {
      try {
        const [allAlbums, albumTracks] = await Promise.all([
          api.albums(),
          api.albumTracks(albumId),
        ]);
        const found = allAlbums.find((a) => a.id === albumId) ?? null;
        setAlbum(found);
        setTracks(albumTracks);
        if (found) {
          const more = allAlbums
            .filter((a) => a.artist_id === found.artist_id && a.id !== albumId)
            .slice(0, 6);
          setMoreAlbums(more);
        }
      } catch {}
    }
    load();
  }, [albumId]);

  const artworkUri = album ? api.artworkUrl(album.artwork_id) : null;

  function handlePlay(startIndex = 0) {
    if (tracks.length) playNow(tracks, startIndex);
  }

  function handleShuffle() {
    if (!tracks.length) return;
    const idx = Math.floor(Math.random() * tracks.length);
    playNow(tracks, idx);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
        {/* Artwork - Material 3 hero */}
        <View style={styles.artworkSection}>
          <View style={styles.artworkWrapper}>
            {artworkUri ? (
              <Image source={{ uri: artworkUri }} style={styles.artwork} contentFit="cover" />
            ) : (
              <View style={[styles.artwork, { backgroundColor: COLORS.surfaceVariant }]} />
            )}
          </View>
          <Text style={styles.albumTitle}>{album?.title ?? ""}</Text>
          {album?.year && <Text style={styles.year}>{album.year}</Text>}
          <TouchableOpacity
            onPress={() => album && navigation.navigate("Library", { screen: "ArtistDetail", params: { artistId: album.artist_id } as never })}
          >
            <Text style={styles.artistName}>{album?.artist ?? ""}</Text>
          </TouchableOpacity>
        </View>

        {/* Actions */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.playButton} onPress={() => handlePlay(0)} activeOpacity={0.85}>
            <MaterialIcons name="play-arrow" size={20} color={COLORS.onAccent} />
            <Text style={styles.actionText}>Play</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.shuffleButton} onPress={handleShuffle} activeOpacity={0.85}>
            <MaterialIcons name="shuffle" size={20} color={COLORS.accent} />
            <Text style={styles.shuffleText}>Shuffle</Text>
          </TouchableOpacity>
        </View>

        {/* Track list */}
        <View style={styles.trackList}>
          {tracks.map((track, idx) => (
            <TouchableOpacity
              key={track.id}
              style={styles.trackRow}
              activeOpacity={0.7}
              onPress={() => handlePlay(idx)}
            >
              <View style={styles.trackNumber}>
                <Text style={styles.trackNo}>{track.track_no ?? idx + 1}</Text>
              </View>
              <View style={styles.trackText}>
                <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
              </View>
              <Text style={styles.trackDuration}>{formatDuration(track.duration)}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {tracks.length > 0 && (
          <Text style={styles.totalDuration}>
            {tracks.length} songs · {totalDuration(tracks)}
          </Text>
        )}

        {/* More by artist */}
        {moreAlbums.length > 0 && (
          <View style={styles.moreSection}>
            <Text style={styles.moreSectionTitle}>
              More by {album?.artist}
            </Text>
            <FlatList
              data={moreAlbums}
              horizontal
              keyExtractor={(item) => String(item.id)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.moreScroll}
              renderItem={({ item }) => {
                const uri = api.artworkUrl(item.artwork_id);
                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.moreItem}
                    activeOpacity={0.85}
                    onPress={() => navigation.push("AlbumDetail", { albumId: item.id })}
                  >
                    {uri ? (
                      <Image source={{ uri }} style={styles.moreArtwork} contentFit="cover" />
                    ) : (
                      <View style={[styles.moreArtwork, { backgroundColor: COLORS.surfaceVariant }]} />
                    )}
                    <Text style={styles.moreTitle} numberOfLines={1}>{item.title}</Text>
                    {item.year && <Text style={styles.moreYear}>{item.year}</Text>}
                  </TouchableOpacity>
                );
              }}
            />
          </View>
        )}

        <View style={{ height: SPACING.xl * 2 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  artworkSection: {
    alignItems: "center",
    paddingTop: SPACING.xl,
    paddingHorizontal: SPACING.md,
  },
  artworkWrapper: {
    borderRadius: 20,
    ...ELEVATION.modal,
    overflow: "hidden",
    width: 320,
    height: 320,
  },
  artwork: {
    width: 320,
    height: 320,
    backgroundColor: COLORS.surfaceVariant,
  },
  albumTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: COLORS.onBg,
    marginTop: SPACING.lg,
    textAlign: "center",
    maxWidth: "85%",
  },
  artistName: {
    fontSize: 17,
    fontWeight: "500",
    color: COLORS.accent,
    marginTop: SPACING.xs,
  },
  year: {
    fontSize: 14,
    color: COLORS.muted,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: "row",
    gap: SPACING.md,
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.xl,
  },
  playButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accent,
  },
  actionText: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.onAccent,
  },
  shuffleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.sm,
    paddingVertical: 16,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accentContainer,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  shuffleText: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.accent,
  },
  trackList: {
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.md,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.outline,
    gap: SPACING.md,
  },
  trackNumber: {
    width: 36,
    alignItems: "flex-end",
  },
  trackNo: {
    fontSize: 14,
    color: COLORS.muted,
    fontFamily: "monospace",
  },
  trackText: {
    flex: 1,
    minWidth: 0,
  },
  trackTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: COLORS.onBg,
  },
  trackDuration: {
    fontSize: 13,
    color: COLORS.muted,
    fontFamily: "monospace",
  },
  totalDuration: {
    textAlign: "center",
    fontSize: 13,
    color: COLORS.muted,
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
  },
  moreSection: {
    marginTop: SPACING.xl,
    paddingHorizontal: SPACING.md,
  },
  moreSectionTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.onBg,
    marginBottom: SPACING.md,
  },
  moreScroll: {
    gap: SPACING.md,
    paddingBottom: SPACING.md,
  },
  moreItem: {
    width: 150,
  },
  moreArtwork: {
    width: 150,
    height: 150,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceVariant,
  },
  moreTitle: {
    marginTop: SPACING.sm,
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.onBg,
  },
  moreYear: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 2,
  },
});