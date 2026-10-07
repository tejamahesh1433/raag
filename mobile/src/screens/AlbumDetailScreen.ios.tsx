import React, { useEffect, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";
import { api } from "../api";
import { usePlayer } from "../store/player";
import type { Album, Track } from "../types";
import { COLORS, FONT, RADIUS, SPACING } from "../theme/ios";

interface Props {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<{ AlbumDetail: { albumId: number } }, "AlbumDetail">;
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

export default function AlbumDetailScreen({ navigation, route }: Props) {
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
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Artwork */}
        <View style={styles.artworkSection}>
          <View style={styles.artworkShadow}>
            {artworkUri ? (
              <Image source={{ uri: artworkUri }} style={styles.artwork} contentFit="cover" />
            ) : (
              <View style={[styles.artwork, styles.artworkPlaceholder]} />
            )}
          </View>
          <Text style={styles.albumTitle}>{album?.title ?? ""}</Text>
          <TouchableOpacity
            onPress={() =>
              album && navigation.navigate("ArtistDetail", { artistId: album.artist_id })
            }
          >
            <Text style={styles.artistName}>{album?.artist ?? ""}</Text>
          </TouchableOpacity>
          {album?.year && <Text style={styles.year}>{album.year}</Text>}
        </View>

        {/* Actions */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.actionButton} onPress={() => handlePlay(0)} activeOpacity={0.8}>
            <Ionicons name="play" size={16} color={COLORS.accent} />
            <Text style={styles.actionText}>Play</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionButton} onPress={handleShuffle} activeOpacity={0.8}>
            <Ionicons name="shuffle" size={16} color={COLORS.accent} />
            <Text style={styles.actionText}>Shuffle</Text>
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
              <Text style={styles.trackNo}>{track.track_no ?? idx + 1}</Text>
              <Text style={styles.trackTitle} numberOfLines={1}>{track.title}</Text>
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
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.moreScroll}
            >
              {moreAlbums.map((a) => {
                const uri = api.artworkUrl(a.artwork_id);
                return (
                  <TouchableOpacity
                    key={a.id}
                    style={styles.moreItem}
                    activeOpacity={0.85}
                    onPress={() => navigation.push("AlbumDetail", { albumId: a.id })}
                  >
                    {uri ? (
                      <Image source={{ uri }} style={styles.moreArtwork} contentFit="cover" />
                    ) : (
                      <View style={[styles.moreArtwork, { backgroundColor: COLORS.surfaceSecondary }]} />
                    )}
                    <Text style={styles.moreTitle} numberOfLines={1}>{a.title}</Text>
                    {a.year && <Text style={styles.moreYear}>{a.year}</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        )}

        <View style={{ height: 120 }} />
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
  artworkShadow: {
    shadowColor: "#000",
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  artwork: {
    width: 280,
    height: 280,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceSecondary,
  },
  artworkPlaceholder: {
    backgroundColor: COLORS.surfaceSecondary,
  },
  albumTitle: {
    fontSize: FONT.title2,
    fontWeight: "700",
    color: COLORS.label,
    marginTop: SPACING.md,
    textAlign: "center",
  },
  artistName: {
    fontSize: FONT.body,
    fontWeight: "400",
    color: COLORS.accent,
    marginTop: 4,
  },
  year: {
    fontSize: FONT.subheadline,
    color: COLORS.muted,
    marginTop: 2,
  },
  actionRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: SPACING.md,
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.md,
  },
  actionButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: SPACING.xs,
    paddingVertical: 11,
    borderRadius: RADIUS.xl,
    borderWidth: 1.5,
    borderColor: COLORS.accent,
  },
  actionText: {
    fontSize: FONT.body,
    fontWeight: "600",
    color: COLORS.accent,
  },
  trackList: {
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.md,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
    gap: SPACING.md,
  },
  trackNo: {
    width: 24,
    textAlign: "right",
    fontSize: FONT.callout,
    color: COLORS.muted,
  },
  trackTitle: {
    flex: 1,
    fontSize: FONT.body,
    fontWeight: "400",
    color: COLORS.label,
  },
  trackDuration: {
    fontSize: FONT.footnote,
    color: COLORS.muted,
  },
  totalDuration: {
    textAlign: "center",
    fontSize: FONT.footnote,
    color: COLORS.muted,
    marginTop: SPACING.md,
  },
  moreSection: {
    marginTop: SPACING.xl,
  },
  moreSectionTitle: {
    fontSize: FONT.title3,
    fontWeight: "700",
    color: COLORS.label,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  moreScroll: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
  },
  moreItem: {
    width: 130,
  },
  moreArtwork: {
    width: 130,
    height: 130,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceSecondary,
  },
  moreTitle: {
    marginTop: SPACING.xs,
    fontSize: FONT.footnote,
    fontWeight: "600",
    color: COLORS.label,
  },
  moreYear: {
    fontSize: FONT.caption,
    color: COLORS.muted,
    marginTop: 1,
  },
});
