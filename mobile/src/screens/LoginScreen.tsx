/**
 * Shared login screen — platform adaptive styling.
 * Shown when no authenticated session exists.
 */
import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useAuth } from "../store/auth";
import { DEFAULT_BASE_URL, getBaseUrl } from "../api";

const ACCENT = Platform.OS === "ios" ? "#ff375f" : "#f43f5e";
const BG = "#0a0a0a";
const SURFACE = Platform.OS === "ios" ? "#1c1c1e" : "#1a1a1a";
const LABEL = "#ffffff";
const MUTED = "#888888";
const INPUT_BG = Platform.OS === "ios" ? "#2c2c2e" : "#2a2a2a";

export function LoginScreen() {
  const { login, loginDirectly, loading, error } = useAuth();
  const [serverUrl, setServerUrl] = useState(getBaseUrl() || DEFAULT_BASE_URL);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoRow}>
          <Image
            source={require("../../assets/icon.png")}
            style={styles.logoImage}
          />
          <Text style={styles.logo}>Raag</Text>
          <Text style={styles.tagline}>Your music. Your server.</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionLabel}>SERVER URL</Text>
          <TextInput
            style={styles.input}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder="https://music.tejainfo.xyz"
            placeholderTextColor={MUTED}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="next"
          />

          <Text style={[styles.sectionLabel, { marginTop: 16 }]}>USERNAME</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="admin"
            placeholderTextColor={MUTED}
            autoCapitalize="none"
            returnKeyType="next"
          />

          <Text style={[styles.sectionLabel, { marginTop: 16 }]}>PASSWORD</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={MUTED}
            secureTextEntry
            returnKeyType="done"
            onSubmitEditing={() => loginDirectly(serverUrl)}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={({ pressed }) => [styles.btn, (pressed || loading) && styles.btnPressed]}
            onPress={() => loginDirectly(serverUrl)}
            disabled={loading}
          >
            {loading ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator color="#fff" size="small" style={{ marginRight: 8 }} />
                <Text style={styles.btnText}>Connecting…</Text>
              </View>
            ) : (
              <Text style={styles.btnText}>Connect Directly</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.hint}>
          Your Raag server runs in open-access mode.{"\n"}Just tap Connect to start listening!
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG },
  scroll: { flexGrow: 1, justifyContent: "center", padding: 24 },
  logoRow: { alignItems: "center", marginBottom: 40 },
  logoImage: { width: 72, height: 72, borderRadius: 18, marginBottom: 12 },
  logo: {
    fontSize: 48,
    fontWeight: "800",
    color: ACCENT,
    letterSpacing: -1,
  },
  tagline: { fontSize: 15, color: MUTED, marginTop: 6 },
  card: {
    backgroundColor: SURFACE,
    borderRadius: Platform.OS === "ios" ? 16 : 12,
    padding: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: MUTED,
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  input: {
    backgroundColor: INPUT_BG,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: LABEL,
  },
  error: {
    color: "#cf6679",
    fontSize: 13,
    marginTop: 12,
    textAlign: "center",
  },
  btn: {
    backgroundColor: ACCENT,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 20,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  btnPressed: { opacity: 0.8 },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  hint: {
    color: MUTED,
    fontSize: 12,
    textAlign: "center",
    marginTop: 28,
    lineHeight: 18,
  },
});
