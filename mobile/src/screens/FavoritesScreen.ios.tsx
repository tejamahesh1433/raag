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
import { LinearGradient } from "expo-linear-gradient";
import { api } from "../api";
import type { Track } from "../types";
import { usePlayer } from "../store/player";
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from "../theme/ios";

export default function FavoritesScreen() {
  const [favorites, setFavorites] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  const currentIndex = usePlayer((s) => s.index);
  const queue = usePlayer((s) => s.queue);
  const isPlaying = usePlayer((s) => s.playing);
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
    <View style={styles.root}>
      {/* Ambient background gradient */}
      <LinearGradient
        colors={["#160c1c", "#0a0910", "#030305"]}
        style={StyleSheet.absoluteFill}
      />

      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.largeTitle}>Favorites</Text>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={COLORS.accent} />
          </View>
        ) : (
          <FlatList
            data={favorites}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={favorites.length === 0 ? styles.emptyContent : styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.center}>
                <Ionicons name="heart-dislike-outline" size={54} color={COLORS.muted} />
                <Text style={styles.emptyText}>No favorites yet</Text>
                <Text style={styles.emptySubtext}>Heart your favorite songs to see them here</Text>
              </View>
            }
            renderItem={({ item, index }) => {
              const artworkUri = api.artworkUrl(item.artwork_id);
              const isCurrent = item.id === currentId;
              return (
                <TouchableOpacity
                  style={[styles.listRow, isCurrent && styles.listRowActive]}
                  activeOpacity={0.7}
                  onPress={() => usePlayer.getState().playNow(favorites, index)}
                >
                  {/* Glossy Artwork Thumbnail */}
                  <View style={styles.artworkContainer}>
                    {artworkUri ? (
                      <Image
                        source={{ uri: artworkUri }}
                        style={styles.artwork}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={[styles.artwork, styles.artworkFallback]} />
                    )}
                    {/* Subtle Sheen */}
                    <LinearGradient
                      colors={["rgba(255, 255, 255, 0.28)", "transparent"]}
                      style={StyleSheet.absoluteFill}
                      pointerEvents="none"
                    />
                    <View style={styles.thumbnailRim} pointerEvents="none" />
                  </View>

                  <View style={styles.rowText}>
                    <Text
                      style={[styles.rowTitle, isCurrent && styles.rowTitlePlaying]}
                      numberOfLines={1}
                    >
                      {item.title}
                    </Text>
                    <Text style={styles.rowSub} numberOfLines={1}>{item.artist}</Text>
                  </View>

                  {isCurrent && (
                    <Ionicons
                      name={isPlaying ? "volume-high" : "pause"}
                      size={16}
                      color={COLORS.accent}
                      style={{ marginRight: 6 }}
                    />
                  )}

                  <TouchableOpacity
                    onPress={() => handleUnfavorite(item)}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    style={styles.heartButton}
                  >
                    <Ionicons name="heart" size={22} color={COLORS.accent} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            }}
          />
        )}
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: SPACING.xl,
    gap: SPACING.sm,
  },
  emptyContent: {
    flexGrow: 1,
  },
  listContent: {
    paddingBottom: 120,
  },
  emptyText: {
    fontSize: FONT.body,
    fontWeight: "600",
    color: COLORS.secondaryLabel,
    textAlign: "center",
    marginTop: SPACING.xs,
  },
  emptySubtext: {
    fontSize: FONT.subheadline,
    color: COLORS.muted,
    textAlign: "center",
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
    gap: SPACING.md,
  },
  listRowActive: {
    backgroundColor: "rgba(255, 45, 85, 0.08)",
  },
  artworkContainer: {
    width: 48,
    height: 48,
    borderRadius: RADIUS.sm,
    overflow: "hidden",
    position: "relative",
    backgroundColor: COLORS.surfaceSecondary,
    ...SHADOW.card,
  },
  artwork: {
    width: "100%",
    height: "100%",
  },
  artworkFallback: {
    backgroundColor: COLORS.surfaceSecondary,
  },
  thumbnailRim: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS.sm,
    borderWidth: 0.5,
    borderColor: "rgba(255, 255, 255, 0.16)",
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
    fontWeight: "600",
    color: COLORS.accent,
  },
  rowSub: {
    fontSize: FONT.footnote,
    color: COLORS.secondaryLabel,
    marginTop: 2,
  },
  heartButton: {
    padding: 4,
  },
});
