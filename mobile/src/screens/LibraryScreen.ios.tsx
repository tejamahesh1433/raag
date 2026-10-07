import React, { useEffect, useState } from "react";
import {
  FlatList,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../api";
import type { Album, Artist, Playlist, Track } from "../types";
import AlbumCard from "../components/AlbumCard.ios";
import { COLORS, FONT, RADIUS, SPACING } from "../theme/ios";

type FilterTab = "Artists" | "Albums" | "Songs" | "Playlists";

interface Props {
  navigation: NativeStackNavigationProp<any>;
}

function formatDuration(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function sectionize(artists: Artist[]) {
  const map: Record<string, Artist[]> = {};
  for (const a of artists) {
    const key = a.name[0]?.toUpperCase() ?? "#";
    const letter = /[A-Z]/.test(key) ? key : "#";
    if (!map[letter]) map[letter] = [];
    map[letter].push(a);
  }
  return Object.entries(map)
    .sort(([a], [b]) => (a === "#" ? 1 : b === "#" ? -1 : a.localeCompare(b)))
    .map(([title, data]) => ({ title, data }));
}

const TABS: FilterTab[] = ["Artists", "Albums", "Songs", "Playlists"];

export default function LibraryScreen({ navigation }: Props) {
  const [tab, setTab] = useState<FilterTab>("Artists");
  const [artists, setArtists] = useState<Artist[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const [a, al, t, p] = await Promise.all([
          api.artists(),
          api.albums(),
          api.tracks({ limit: 500 }),
          api.playlists(),
        ]);
        setArtists(a);
        setAlbums(al);
        setTracks(t.items);
        setPlaylists(p);
      } catch {}
    }
    load();
  }, []);

  const artistSections = sectionize(artists);

  function renderArtistItem({ item }: { item: Artist }) {
    return (
      <TouchableOpacity
        style={styles.listRow}
        activeOpacity={0.7}
        onPress={() => navigation.navigate("ArtistDetail", { artistId: item.id })}
      >
        <View style={styles.artistAvatar}>
          <Text style={styles.avatarLetter}>{item.name[0]?.toUpperCase()}</Text>
        </View>
        <View style={styles.rowText}>
          <Text style={styles.rowTitle}>{item.name}</Text>
          <Text style={styles.rowSub}>{item.album_count} albums</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
      </TouchableOpacity>
    );
  }

  function renderAlbumGrid() {
    return (
      <FlatList
        data={albums}
        keyExtractor={(item) => String(item.id)}
        numColumns={2}
        contentContainerStyle={styles.gridContent}
        columnWrapperStyle={styles.gridRow}
        renderItem={({ item }) => (
          <AlbumCard
            album={item}
            style={styles.gridCard}
            onPress={() => navigation.navigate("AlbumDetail", { albumId: item.id })}
          />
        )}
        showsVerticalScrollIndicator={false}
      />
    );
  }

  function renderSongs() {
    return (
      <FlatList
        data={tracks}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.listRow} activeOpacity={0.7}>
            <View style={styles.trackNoBox}>
              <Text style={styles.trackNo}>{item.track_no ?? "—"}</Text>
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.rowSub} numberOfLines={1}>{item.artist}</Text>
            </View>
            <Text style={styles.durationText}>{formatDuration(item.duration)}</Text>
          </TouchableOpacity>
        )}
        showsVerticalScrollIndicator={false}
      />
    );
  }

  function renderPlaylists() {
    return (
      <FlatList
        data={playlists}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.listRow}
            activeOpacity={0.7}
            onPress={() => navigation.navigate("PlaylistDetail", { playlistId: item.id })}
          >
            <View style={styles.playlistIcon}>
              <Ionicons name="musical-notes" size={20} color={COLORS.label} />
            </View>
            <View style={styles.rowText}>
              <Text style={styles.rowTitle}>{item.name}</Text>
              <Text style={styles.rowSub}>{item.track_count} songs</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
          </TouchableOpacity>
        )}
        showsVerticalScrollIndicator={false}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={styles.largeTitle}>Library</Text>

      {/* Filter pills */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
        style={styles.tabScroll}
      >
        {TABS.map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.pill, tab === t && styles.pillActive]}
            onPress={() => setTab(t)}
            activeOpacity={0.8}
          >
            <Text style={[styles.pillText, tab === t && styles.pillTextActive]}>{t}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Content */}
      <View style={styles.content}>
        {tab === "Artists" && (
          <SectionList
            sections={artistSections}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderArtistItem}
            renderSectionHeader={({ section }) => (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionHeaderText}>{section.title}</Text>
              </View>
            )}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
          />
        )}
        {tab === "Albums" && renderAlbumGrid()}
        {tab === "Songs" && renderSongs()}
        {tab === "Playlists" && renderPlaylists()}
      </View>
    </SafeAreaView>
  );
}

const PLAYLIST_COLORS = ["#ff375f", "#30d158", "#0a84ff", "#ff9f0a", "#bf5af2"];

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  largeTitle: {
    fontSize: 34,
    fontWeight: "700",
    color: COLORS.label,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  tabScroll: {
    flexGrow: 0,
  },
  tabRow: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  pill: {
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: RADIUS.xl,
    backgroundColor: COLORS.surfaceSecondary,
  },
  pillActive: {
    backgroundColor: COLORS.accent,
  },
  pillText: {
    fontSize: FONT.subheadline,
    fontWeight: "500",
    color: COLORS.secondaryLabel,
  },
  pillTextActive: {
    color: COLORS.onAccent,
  },
  content: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 120,
  },
  gridContent: {
    padding: SPACING.md,
    paddingBottom: 120,
  },
  gridRow: {
    gap: SPACING.md,
    marginBottom: SPACING.md,
  },
  gridCard: {
    flex: 1,
  },
  sectionHeader: {
    backgroundColor: COLORS.bg,
    paddingHorizontal: SPACING.md,
    paddingVertical: 4,
  },
  sectionHeaderText: {
    fontSize: FONT.footnote,
    fontWeight: "600",
    color: COLORS.secondaryLabel,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
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
  playlistIcon: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.sm,
    backgroundColor: COLORS.surfaceSecondary,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: FONT.body,
    fontWeight: "400",
    color: COLORS.label,
  },
  rowSub: {
    fontSize: FONT.footnote,
    color: COLORS.secondaryLabel,
    marginTop: 1,
  },
  trackNoBox: {
    width: 28,
    alignItems: "center",
  },
  trackNo: {
    fontSize: FONT.callout,
    color: COLORS.secondaryLabel,
  },
  durationText: {
    fontSize: FONT.footnote,
    color: COLORS.muted,
  },
});
