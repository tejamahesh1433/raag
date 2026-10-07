import React, { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../api";
import type { Playlist } from "../types";
import { COLORS, FONT, RADIUS, SPACING } from "../theme/ios";

interface Props {
  navigation: NativeStackNavigationProp<any>;
}

const ACCENT_PALETTE = [
  "#ff375f", "#30d158", "#0a84ff", "#ff9f0a", "#bf5af2",
  "#5ac8fa", "#ff6961", "#ffb347",
];

function playlistColor(id: number): string {
  return ACCENT_PALETTE[id % ACCENT_PALETTE.length];
}

export default function PlaylistsScreen({ navigation }: Props) {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);

  async function loadPlaylists() {
    try {
      const data = await api.playlists();
      setPlaylists(data);
    } catch {}
  }

  useEffect(() => {
    loadPlaylists();
  }, []);

  function handleCreate() {
    Alert.prompt(
      "New Playlist",
      "Enter a name for your playlist",
      async (name) => {
        if (!name?.trim()) return;
        try {
          await api.createPlaylist(name.trim());
          loadPlaylists();
        } catch {}
      },
      "plain-text",
      "",
    );
  }

  function handleDelete(id: number) {
    Alert.alert("Delete Playlist", "This cannot be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => setPlaylists((prev) => prev.filter((p) => p.id !== id)),
      },
    ]);
  }

  function renderItem({ item }: { item: Playlist }) {
    const color = playlistColor(item.id);
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => navigation.navigate("PlaylistDetail", { playlistId: item.id })}
        onLongPress={() => item.kind === "manual" && handleDelete(item.id)}
        delayLongPress={400}
      >
        <View style={[styles.icon, { backgroundColor: color }]}>
          <Text style={styles.iconLetter}>{item.name[0]?.toUpperCase()}</Text>
        </View>
        <View style={styles.textBlock}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.sub}>{item.track_count} songs</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={COLORS.muted} />
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.largeTitle}>Playlists</Text>
        <TouchableOpacity onPress={handleCreate} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Ionicons name="add-circle" size={28} color={COLORS.accent} />
        </TouchableOpacity>
      </View>
      <FlatList
        data={playlists}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="musical-notes-outline" size={48} color={COLORS.muted} />
            <Text style={styles.emptyText}>No playlists yet</Text>
            <Text style={styles.emptySubtext}>Tap + to create one</Text>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  largeTitle: {
    fontSize: 34,
    fontWeight: "700",
    color: COLORS.label,
  },
  listContent: {
    paddingBottom: 120,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
    gap: SPACING.sm,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  iconLetter: {
    fontSize: FONT.title3,
    fontWeight: "700",
    color: COLORS.onAccent,
  },
  textBlock: {
    flex: 1,
  },
  name: {
    fontSize: FONT.body,
    fontWeight: "400",
    color: COLORS.label,
  },
  sub: {
    fontSize: FONT.footnote,
    color: COLORS.secondaryLabel,
    marginTop: 1,
  },
  empty: {
    alignItems: "center",
    paddingTop: 80,
    gap: SPACING.sm,
  },
  emptyText: {
    fontSize: FONT.body,
    fontWeight: "600",
    color: COLORS.secondaryLabel,
  },
  emptySubtext: {
    fontSize: FONT.subheadline,
    color: COLORS.muted,
  },
});
