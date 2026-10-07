import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Artwork } from "./Artwork";
import { COLORS, ELEVATION, RADIUS, SPACING } from "../theme/android";
import type { Album } from "../types";

interface Props {
  album: Album;
  onPress: () => void;
}

export function AlbumCard({ album, onPress }: Props) {
  if (!album) return null;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.artworkWrap}>
        <Artwork
          artworkId={album.artwork_id}
          size={0}
          style={styles.artwork}
        />
      </View>
      <View style={styles.info}>
        <Text style={styles.title} numberOfLines={1}>
          {album.title ?? "Unknown Album"}
        </Text>
        <Text style={styles.artist} numberOfLines={1}>
          {album.artist ?? "Unknown Artist"}
        </Text>
        {album.year != null && (
          <View style={styles.chip}>
            <Text style={styles.chipText}>{album.year}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    overflow: "hidden",
    ...ELEVATION.card,
  },
  cardPressed: {
    opacity: 0.85,
  },
  artworkWrap: {
    width: "100%",
    aspectRatio: 1,
    backgroundColor: COLORS.surfaceVariant,
  },
  artwork: {
    width: "100%",
    height: "100%",
    borderRadius: 0,
    borderTopLeftRadius: RADIUS.md,
    borderTopRightRadius: RADIUS.md,
  },
  info: {
    padding: SPACING.sm,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.onBg,
  },
  artist: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 2,
  },
  chip: {
    marginTop: SPACING.xs,
    alignSelf: "flex-start",
    backgroundColor: COLORS.surfaceVariant,
    paddingHorizontal: SPACING.xs + 2,
    paddingVertical: 2,
    borderRadius: SPACING.xs,
  },
  chipText: {
    fontSize: 10,
    color: COLORS.muted,
  },
});
