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
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api } from "../api";
import type { Playlist } from "../types";
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from "../theme/ios";

interface Props {
  navigation: NativeStackNavigationProp<any>;
}

const GRADIENT_PALETTES = [
  ["#ff2d55", "#b80036"] as const,
  ["#af52de", "#581c87"] as const,
  ["#0a84ff", "#0040aa"] as const,
  ["#30d158", "#146c2e"] as const,
  ["#ff9f0a", "#b35300"] as const,
  ["#5ac8fa", "#147efb"] as const,
  ["#ff375f", "#990033"] as const,
];

function getPlaylistGradient(id: number) {
  return GRADIENT_PALETTES[id % GRADIENT_PALETTES.length];
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
    const colors = getPlaylistGradient(item.id);
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.7}
        onPress={() => navigation.navigate("PlaylistDetail", { playlistId: item.id })}
        onLongPress={() => item.kind === "manual" && handleDelete(item.id)}
        delayLongPress={400}
      >
        {/* Glossy Playlist Icon Badge */}
        <View style={styles.iconShadow}>
          <View style={styles.iconContainer}>
            <LinearGradient
              colors={colors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            {/* Diagonal Gloss Sheen */}
            <LinearGradient
              colors={["rgba(255, 255, 255, 0.42)", "rgba(255, 255, 255, 0.08)", "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.7, y: 0.7 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            {/* Specular Rim */}
            <View style={styles.iconRim} pointerEvents="none" />
            <Text style={styles.iconLetter}>{item.name[0]?.toUpperCase() ?? "P"}</Text>
          </View>
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
    <View style={styles.root}>
      {/* Ambient background gradient */}
      <LinearGradient
        colors={["#160c1c", "#0a0910", "#030305"]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.largeTitle}>Playlists</Text>
          <TouchableOpacity
            onPress={handleCreate}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <Ionicons name="add-circle" size={30} color={COLORS.accent} />
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
              <Ionicons name="musical-notes-outline" size={54} color={COLORS.muted} />
              <Text style={styles.emptyText}>No playlists yet</Text>
              <Text style={styles.emptySubtext}>Tap + to create one</Text>
            </View>
          }
        />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  safe: {
    flex: 1,
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
    letterSpacing: -0.4,
  },
  listContent: {
    paddingBottom: 120,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
    gap: SPACING.md,
  },
  iconShadow: {
    ...SHADOW.gloss,
    borderRadius: RADIUS.md,
  },
  iconContainer: {
    width: 52,
    height: 52,
    borderRadius: RADIUS.md,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  iconRim: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.20)",
    borderTopColor: "rgba(255, 255, 255, 0.45)",
  },
  iconLetter: {
    fontSize: 22,
    fontWeight: "800",
    color: "#ffffff",
  },
  textBlock: {
    flex: 1,
  },
  name: {
    fontSize: FONT.body,
    fontWeight: "600",
    color: COLORS.label,
  },
  sub: {
    fontSize: FONT.footnote,
    color: COLORS.secondaryLabel,
    marginTop: 2,
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
