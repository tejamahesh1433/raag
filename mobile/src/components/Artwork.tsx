import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import { api } from "../api";

interface Props {
  artworkId: number | null | undefined;
  size: number;
  style?: object;
}

export function Artwork({ artworkId, size, style }: Props) {
  const uri = artworkId ? api.artworkUrl(artworkId) : null;

  if (!uri) {
    return (
      <View
        style={[
          styles.fallback,
          { width: size, height: size, borderRadius: size === 48 ? 8 : 12 },
          style,
        ]}
      />
    );
  }

  const headers = api.mediaHeaders();
  const source = headers ? { uri, headers } : { uri };

  return (
    <Image
      source={source}
      style={[
        size > 0 ? { width: size, height: size, borderRadius: size === 48 ? 8 : 12 } : {},
        style,
      ]}
      contentFit="cover"
    />
  );
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: "#2a2a2a",
    alignItems: "center",
    justifyContent: "center",
  },
});
