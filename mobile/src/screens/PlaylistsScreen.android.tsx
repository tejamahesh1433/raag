import { useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { PlaylistsStackParamList } from "../navigation/types";
import { useNavigation } from "@react-navigation/native";
import { api } from "../api";
import type { Playlist } from "../types";
import { COLORS, ELEVATION, RADIUS, SPACING } from "../theme/android";

const ACCENT_PALETTE = [
  COLORS.accent,
  "#30d158",
  "#0a84ff",
  "#ff9f0a",
  "#bf5af2",
  "#5ac8fa",
  "#ff6961",
  "#ffb347",
];

function playlistColor(id: number): string {
  return ACCENT_PALETTE[id % ACCENT_PALETTE.length];
}

export function PlaylistsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<PlaylistsStackParamList>>();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [creating, setCreating] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");

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
    setNewPlaylistName("");
    setCreating(true);
  }

  async function submitCreate() {
    const name = newPlaylistName.trim();
    if (!name) return;
    try {
      await api.createPlaylist(name);
      setCreating(false);
      setNewPlaylistName("");
      loadPlaylists();
    } catch {}
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
      <Pressable
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
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
        <MaterialIcons name="chevron-right" size={20} color={COLORS.muted} />
      </Pressable>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.largeTitle}>Playlists</Text>
        <TouchableOpacity onPress={handleCreate} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <MaterialIcons name="add-circle" size={28} color={COLORS.accent} />
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
            <MaterialIcons name="queue-music" size={48} color={COLORS.muted} />
            <Text style={styles.emptyText}>No playlists yet</Text>
            <Text style={styles.emptySubtext}>Tap + to create one</Text>
          </View>
        }
      />

      <Modal
        visible={creating}
        transparent
        animationType="fade"
        onRequestClose={() => setCreating(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.dialog}>
            <Text style={styles.dialogTitle}>New Playlist</Text>
            <Text style={styles.dialogHelp}>Enter a name for your playlist</Text>
            <TextInput
              value={newPlaylistName}
              onChangeText={setNewPlaylistName}
              placeholder="Playlist name"
              placeholderTextColor={COLORS.muted}
              autoFocus
              style={styles.dialogInput}
              onSubmitEditing={() => void submitCreate()}
            />
            <View style={styles.dialogActions}>
              <TouchableOpacity
                onPress={() => setCreating(false)}
                style={styles.dialogButton}
              >
                <Text style={styles.dialogButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void submitCreate()}
                style={styles.dialogButton}
              >
                <Text style={[styles.dialogButtonText, styles.dialogButtonPrimary]}>Create</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    fontSize: 28,
    fontWeight: "900",
    color: COLORS.accent,
    letterSpacing: -0.5,
  },
  listContent: {
    paddingBottom: 120,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.outline,
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
  },
  rowPressed: {
    backgroundColor: COLORS.surfaceVariant,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  iconLetter: {
    fontSize: 20,
    fontWeight: "800",
    color: COLORS.onAccent,
  },
  textBlock: {
    flex: 1,
  },
  name: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.onBg,
  },
  sub: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
  },
  empty: {
    alignItems: "center",
    paddingTop: 80,
    gap: SPACING.sm,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.muted,
  },
  emptySubtext: {
    fontSize: 13,
    color: COLORS.muted,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: SPACING.lg,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  dialog: {
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  dialogTitle: {
    color: COLORS.onBg,
    fontSize: 20,
    fontWeight: "700",
  },
  dialogHelp: {
    color: COLORS.muted,
    fontSize: 14,
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
  },
  dialogInput: {
    color: COLORS.onBg,
    backgroundColor: COLORS.surfaceVariant,
    borderColor: COLORS.outline,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    fontSize: 16,
  },
  dialogActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: SPACING.sm,
    marginTop: SPACING.lg,
  },
  dialogButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.sm,
  },
  dialogButtonText: {
    color: COLORS.muted,
    fontSize: 14,
    fontWeight: "600",
  },
  dialogButtonPrimary: {
    color: COLORS.accent,
  },
});