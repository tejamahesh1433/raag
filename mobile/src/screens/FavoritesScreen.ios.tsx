import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { api } from "../api";
import type { Track } from "../types";
import { usePlayer } from "../store/player";
import { COLORS, FONT, RADIUS, SPACING } from "../theme/ios";

export default function FavoritesScreen() {
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

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={styles.largeTitle}>Favorites</Text>
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={COLORS.accent} />
        </View>
      ) : (
        <FlatList
          data={favorites}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={favorites.length === 0 ? styles.emptyContent : styles.listContent}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.center}>
              <Text style={styles.emptyText}>No favorites yet</Text>
            </View>
          }
          renderItem={({ item, index }) => {
            const artworkUri = api.artworkUrl(item.artwork_id);
            const isPlaying = item.id === currentId;
            return (
              <TouchableOpacity
                style={styles.listRow}
                activeOpacity={0.7}
                onPress={() => usePlayer.getState().playNow(favorites, index)}
              >
                {artworkUri ? (
                  <Image
                    source={{ uri: artworkUri }}
                    style={styles.artwork}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.artwork, styles.artworkFallback]} />
                )}
                <View style={styles.rowText}>
                  <Text
                    style={[styles.rowTitle, isPlaying && styles.rowTitlePlaying]}
                    numberOfLines={1}
                  >
                    {item.title}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>{item.artist}</Text>
                </View>
                <TouchableOpacity
                  onPress={() => handleUnfavorite(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="heart" size={22} color={COLORS.accent} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

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
    paddingBottom: 120,
  },
  emptyText: {
    fontSize: FONT.body,
    color: COLORS.secondaryLabel,
    textAlign: "center",
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
  artwork: {
    width: 44,
    height: 44,
    borderRadius: RADIUS.sm,
  },
  artworkFallback: {
    backgroundColor: COLORS.surfaceSecondary,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontSize: FONT.body,
    fontWeight: "400",
    color: COLORS.label,
  },
  rowTitlePlaying: {
    color: COLORS.accent,
  },
  rowSub: {
    fontSize: FONT.footnote,
    color: COLORS.secondaryLabel,
    marginTop: 1,
  },
});
