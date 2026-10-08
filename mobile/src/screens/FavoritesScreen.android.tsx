import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { MaterialIcons } from "@expo/vector-icons";
import { Artwork } from "../components/Artwork";
import { COLORS, SPACING } from "../theme/android";
import { api } from "../api";
import { usePlayer } from "../store/player";
import type { Track } from "../types";

export function FavoritesScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const [favorites, setFavorites] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  const currentIndex = usePlayer((s) => s.index);
  const queue = usePlayer((s) => s.queue);
  const currentId = currentIndex >= 0 ? queue[currentIndex]?.id : undefined;

  useEffect(() => {
    api.favorites()
      .then(setFavorites)
      .finally(() => setLoading(false));
  }, []);

  function handleUnfavorite(track: Track) {
    api.unfavorite(track.id).catch(() => {});
    setFavorites((prev) => prev.filter((t) => t.id !== track.id));
  }

  if (loading) {
    return (
      <View style={[styles.root, styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={COLORS.accent} />
      </View>
    );
  }

  return (
    <FlatList
      style={[styles.root, { paddingTop: insets.top }]}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Favorites</Text>
          <TouchableOpacity onPress={() => navigation.navigate("Settings" as any)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MaterialIcons name="settings" size={24} color={COLORS.muted} />
          </TouchableOpacity>
        </View>
      }
      data={favorites}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item, index }) => (
        <Pressable
          style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
          onPress={() => usePlayer.getState().playNow(favorites, index)}
        >
          <Artwork artworkId={item.artwork_id} size={48} />
          <View style={styles.info}>
            <Text
              style={[styles.title, item.id === currentId && styles.titlePlaying]}
              numberOfLines={1}
            >
              {item.title}
            </Text>
            <Text style={styles.artist} numberOfLines={1}>{item.artist}</Text>
          </View>
          <TouchableOpacity
            onPress={() => handleUnfavorite(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <MaterialIcons name="favorite" size={22} color={COLORS.accent} />
          </TouchableOpacity>
        </Pressable>
      )}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyText}>No favorites yet</Text>
        </View>
      }
      contentContainerStyle={favorites.length === 0 ? styles.emptyContent : styles.listContent}
    />
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
  },
  emptyContent: {
    flexGrow: 1,
  },
  listContent: {
    paddingBottom: 140,
  },
  emptyText: {
    color: COLORS.muted,
    fontSize: 14,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.outline,
  },
  rowPressed: {
    backgroundColor: COLORS.surfaceVariant,
  },
  info: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: "500",
    color: COLORS.onBg,
  },
  titlePlaying: {
    color: COLORS.accent,
  },
  artist: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
  },
});
