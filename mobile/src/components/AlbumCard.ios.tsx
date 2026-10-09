import React, { useRef } from "react";
import { Animated, StyleSheet, Text, TouchableWithoutFeedback, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import type { Album } from "../types";
import { api } from "../api";
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from "../theme/ios";

interface Props {
  album: Album;
  onPress: () => void;
  style?: any;
}

export default function AlbumCard({ album, onPress, style }: Props) {
  const scale = useRef(new Animated.Value(1)).current;

  function handlePressIn() {
    Animated.spring(scale, {
      toValue: 0.94,
      useNativeDriver: true,
      speed: 24,
      bounciness: 4,
    }).start();
  }

  function handlePressOut() {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 24,
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
        <View style={styles.shadowBox}>
          <View style={styles.artworkWrapper}>
            {artworkUri ? (
              <Image
                source={{ uri: artworkUri }}
                style={styles.artwork}
                contentFit="cover"
              />
            ) : (
              <View style={[styles.artwork, styles.artworkPlaceholder]}>
                <LinearGradient
                  colors={["#2c2c36", "#14141a"]}
                  style={StyleSheet.absoluteFill}
                />
              </View>
            )}
            {/* Apple Glossy Sheen Overlay */}
            <LinearGradient
              colors={["rgba(255, 255, 255, 0.32)", "rgba(255, 255, 255, 0.06)", "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.65, y: 0.65 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            {/* Specular Rim Highlight */}
            <View style={styles.rimHighlight} pointerEvents="none" />
          </View>
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
  shadowBox: {
    borderRadius: RADIUS.md,
    ...SHADOW.gloss,
    marginBottom: SPACING.xs,
  },
  artworkWrapper: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: RADIUS.md,
    overflow: "hidden",
    position: "relative",
    backgroundColor: COLORS.surfaceSecondary,
  },
  artwork: {
    width: "100%",
    height: "100%",
  },
  artworkPlaceholder: {
    backgroundColor: COLORS.surfaceSecondary,
  },
  rimHighlight: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.14)",
    borderTopColor: "rgba(255, 255, 255, 0.38)",
  },
  title: {
    marginTop: 2,
    fontSize: FONT.footnote,
    fontWeight: "600",
    color: COLORS.label,
    letterSpacing: -0.2,
  },
  artist: {
    fontSize: FONT.footnote,
    fontWeight: "400",
    color: COLORS.secondaryLabel,
    marginTop: 1,
  },
});
