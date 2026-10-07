import React, { useRef } from "react";
import { Animated, StyleSheet, Text, TouchableWithoutFeedback, View } from "react-native";
import { Image } from "expo-image";
import type { Album } from "../types";
import { api } from "../api";
import { COLORS, FONT, SPACING } from "../theme/ios";

interface Props {
  album: Album;
  onPress: () => void;
  style?: any;
}

export default function AlbumCard({ album, onPress, style }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  function handlePressIn() {
    Animated.spring(scale, {
      toValue: 0.95,
      useNativeDriver: true,
      speed: 20,
      bounciness: 4,
    }).start();
  }

  function handlePressOut() {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 4,
    }).start();
  }

  const artworkUri = api.artworkUrl(album.artwork_id);

  return (
    <TouchableWithoutFeedback
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
    >
      <Animated.View style={[styles.container, { transform: [{ scale }] }, style]}>
        <View style={styles.artworkWrapper}>
          {artworkUri ? (
            <Image
              source={{ uri: artworkUri }}
              style={styles.artwork}
              contentFit="cover"
            />
          ) : (
            <View style={[styles.artwork, styles.artworkPlaceholder]} />
          )}
        </View>
        <Text style={styles.title} numberOfLines={1}>{album.title}</Text>
        <Text style={styles.artist} numberOfLines={1}>{album.artist}</Text>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  artworkWrapper: {
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  artwork: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: COLORS.surfaceSecondary,
  },
  artworkPlaceholder: {
    backgroundColor: COLORS.surfaceSecondary,
  },
  title: {
    marginTop: SPACING.xs,
    fontSize: FONT.footnote,
    fontWeight: "600",
    color: COLORS.label,
  },
  artist: {
    fontSize: FONT.footnote,
    fontWeight: "400",
    color: COLORS.secondaryLabel,
    marginTop: 1,
  },
});
