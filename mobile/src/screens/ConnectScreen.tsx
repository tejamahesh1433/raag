import { useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useAuth } from "../store/auth";
import { getBaseUrl } from "../api";

const BG      = "#14241c";
const SURFACE = "#1a2e22";
const AMBER   = "#d97706";
const LABEL   = "#e2ede5";
const MUTED   = "#7a9e84";
const INPUT   = "#243b2b";

export function ConnectScreen() {
  const { login, loading, error } = useAuth();
  const [url, setUrl] = useState(getBaseUrl);

  function connect() {
    // AUTH_REQUIRED=0: no credentials needed — login with empty strings
    login(url.trim(), "", "");
  }

  return (
    <View style={s.root}>
      <Image source={require("../../assets/icon.png")} style={s.icon} />
      <Text style={s.title}>Raag</Text>
      <Text style={s.sub}>Enter your server address</Text>

      <TextInput
        style={s.input}
        value={url}
        onChangeText={setUrl}
        placeholder="https://music.tejainfo.xyz"
        placeholderTextColor={MUTED}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        onSubmitEditing={connect}
      />

      {error ? <Text style={s.error}>{error}</Text> : null}

      <Pressable
        style={({ pressed }) => [s.btn, pressed && { opacity: 0.8 }]}
        onPress={connect}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color="#fff" />
          : <Text style={s.btnText}>Connect</Text>}
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  root:    { flex: 1, backgroundColor: BG, alignItems: "center", justifyContent: "center", padding: 32 },
  icon:    { width: 80, height: 80, borderRadius: 20, marginBottom: 16 },
  title:   { fontSize: 40, fontWeight: "800", color: AMBER, letterSpacing: -1, marginBottom: 4 },
  sub:     { fontSize: 14, color: MUTED, marginBottom: 32 },
  input:   { width: "100%", backgroundColor: INPUT, borderRadius: 12, paddingHorizontal: 16,
             paddingVertical: 14, fontSize: 15, color: LABEL, marginBottom: 12 },
  error:   { color: "#f87171", fontSize: 13, marginBottom: 12, textAlign: "center" },
  btn:     { width: "100%", backgroundColor: AMBER, borderRadius: 12, paddingVertical: 16,
             alignItems: "center" },
  btnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
