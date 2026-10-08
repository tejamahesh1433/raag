import { useEffect, useState } from "react";
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Image } from "expo-image";
import { MaterialIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../api";
import { usePlayer } from "../store/player";
import type { Playlist, Track } from "../types";
import { COLORS, ELEVATION, RADIUS, SPACING } from "../theme/android";

interface Props {
  navigation: NativeStackNavigationProp<any>;
  route: RouteProp<{ PlaylistDetail: { playlistId: number } }, "PlaylistDetail">
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function totalMin(tracks: Track[]) {
  const total = tracks.reduce((acc, t) => acc + t.duration, 0);
  return `${Math.floor(total / 60)} min`;
}

export function PlaylistDetailScreen({ navigation, route }: Props) {
  const { playlistId } = route.params;
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const { playNow } = usePlayer();

  useEffect(() => {
    async function load() {
      try {
        const [allPlaylists, trackList] = await Promise.all([
          api.playlists(),
          api.playlistTracks(playlistId),
        ]);
        setPlaylist(allPlaylists.find((p) => p.id === playlistId) ?? null);
        setTracks(trackList);
      } catch {}
    }
    load();
  }, [playlistId]);

  function handleShuffle() {
    if (!tracks.length) return;
    const idx = Math.floor(Math.random() * tracks.length);
    playNow(tracks, idx);
  }

  function renderTrack({ item, index }: { item: Track; index: number }) {
    const uri = api.artworkUrl(item.artwork_id);
    return (
      <TouchableOpacity
        style={styles.trackRow}
        activeOpacity={0.7}
        onPress={() => playNow(tracks, index)}
      >
        {uri ? (
          <Image source={{ uri }} style={styles.artwork} contentFit="cover" />
        ) : (
          <View style={[styles.artwork, { backgroundColor: COLORS.surfaceVariant }]} />
        )}
        <View style={styles.trackText}>
          <Text style={styles.trackTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.trackArtist} numberOfLines={1}>{item.artist}</Text>
        </View>
        <Text style={styles.duration}>{formatDuration(item.duration)}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <FlatList
        data={tracks}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderTrack}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.playlistName} numberOfLines={2}>
              {playlist?.name ?? ""}
            </Text>
            {tracks.length > 0 && (
              <Text style={styles.meta}>
                {tracks.length} songs · {totalMin(tracks)}
              </Text>
            )}
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={styles.shuffleButton}
                onPress={handleShuffle}
                activeOpacity={0.8}
              >
                <MaterialIcons name="shuffle" size={18} color={COLORS.accent} />
                <Text style={styles.shuffleText}>Shuffle</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.playButton}
                onPress={() => tracks.length && playNow(tracks, 0)}
                activeOpacity={0.8}
              >
                <MaterialIcons name="play-arrow" size={18} color={COLORS.onAccent} />
                <Text style={styles.playText}>Play</Text>
              </TouchableOpacity>
            </View>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  listContent: {
    paddingBottom: 120,
  },
  header: {
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.xl,
    paddingBottom: SPACING.lg,
  },
  playlistName: {
    fontSize: 28,
    fontWeight: "800",
    color: COLORS.onBg,
    textAlign: "center",
  },
  meta: {
    fontSize: 14,
    color: COLORS.muted,
    marginTop: 6,
  },
  actionRow: {
    flexDirection: "row",
    gap: SPACING.md,
    marginTop: SPACING.xl,
  },
  shuffleButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    paddingVertical: 12,
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
  playButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.xl,
    paddingVertical: 12,
    borderRadius: RADIUS.pill,
    backgroundColor: COLORS.accent,
  },
  playText: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.onAccent,
  },
  trackRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.outline,
    gap: SPACING.sm,
  },
  artwork: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceVariant,
  },
  trackText: {
    flex: 1,
  },
  trackTitle: {
    fontSize: 16,
    fontWeight: "500",
    color: COLORS.onBg,
  },
  trackArtist: {
    fontSize: 13,
    color: COLORS.muted,
    marginTop: 1,
  },
  duration: {
    fontSize: 13,
    color: COLORS.muted,
    fontFamily: "monospace",
  },
});