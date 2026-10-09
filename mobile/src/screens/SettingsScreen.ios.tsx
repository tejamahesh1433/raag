import React, { useEffect, useState } from "react";
import {
  ActionSheetIOS,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api, getBaseUrl, getStreamQuality, setBaseUrl, setStreamQuality, type StreamQuality } from "../api";
import { useAuth } from "../store/auth";
import { COLORS, FONT, RADIUS, SPACING } from "../theme/ios";

interface Props {
  navigation: NativeStackNavigationProp<any>;
}

const QUALITY_OPTIONS: StreamQuality[] = ["original", "high", "medium", "low"];

export default function SettingsScreen({ navigation }: Props) {
  const { user, login, logout } = useAuth();
  // Open-access connect: master's login() falls back to api.me() when credentials are empty.
  const loginDirectly = (url: string) => login(url, "", "");
  const [serverUrl, setServerUrl] = useState(getBaseUrl);
  const [serverStatus, setServerStatus] = useState<"checking" | "ok" | "error">("checking");
  const [quality, setQuality] = useState<StreamQuality>(getStreamQuality);

  useEffect(() => {
    checkServer();
  }, []);

  async function checkServer() {
    setServerStatus("checking");
    try {
      await api.health();
      setServerStatus("ok");
    } catch {
      setServerStatus("error");
    }
  }

  function editServerUrl() {
    Alert.prompt(
      "Server URL",
      "Enter the URL of your Raag server",
      async (url) => {
        if (!url?.trim()) return;
        await setBaseUrl(url.trim());
        setServerUrl(url.trim());
        await loginDirectly(url.trim());
        checkServer();
      },
      "plain-text",
      serverUrl,
    );
  }

  function pickQuality() {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: "Stream Quality",
        options: [...QUALITY_OPTIONS, "Cancel"],
        cancelButtonIndex: QUALITY_OPTIONS.length,
      },
      async (idx) => {
        if (idx < QUALITY_OPTIONS.length) {
          const selected = QUALITY_OPTIONS[idx];
          await setStreamQuality(selected);
          setQuality(selected);
        }
      },
    );
  }

  function handleLogout() {
    Alert.alert("Reset Session", "This will reset your session and reconnect as guest.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: async () => {
          await logout();
          checkServer();
        },
      },
    ]);
  }

  const statusIcon = serverStatus === "ok"
    ? { name: "checkmark-circle" as any, color: "#30d158" }
    : serverStatus === "error"
      ? { name: "close-circle" as any, color: COLORS.accent }
      : { name: "ellipse-outline" as any, color: COLORS.muted };

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="close" size={22} color={COLORS.secondaryLabel} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Settings</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Server section */}
        <Text style={styles.sectionHeader}>Server</Text>
        <View style={styles.group}>
          <TouchableOpacity style={styles.row} onPress={editServerUrl} activeOpacity={0.7}>
            <Text style={styles.rowLabel}>Server URL</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue} numberOfLines={1}>{serverUrl || "Not set"}</Text>
              <Ionicons name="chevron-forward" size={14} color={COLORS.muted} />
            </View>
          </TouchableOpacity>
          <View style={styles.separator} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Status</Text>
            <View style={styles.rowRight}>
              <Text style={[styles.rowValue, { color: serverStatus === "ok" ? "#30d158" : serverStatus === "error" ? COLORS.accent : COLORS.muted }]}>
                {serverStatus === "ok" ? "Connected" : serverStatus === "error" ? "Offline" : "Checking…"}
              </Text>
              <Ionicons
                name={serverStatus === "ok" ? "checkmark-circle" : serverStatus === "error" ? "close-circle" : "ellipsis-horizontal-circle"}
                size={18}
                color={serverStatus === "ok" ? "#30d158" : serverStatus === "error" ? COLORS.accent : COLORS.muted}
              />
            </View>
          </View>
        </View>

        {/* Playback section */}
        <Text style={styles.sectionHeader}>Playback</Text>
        <View style={styles.group}>
          <TouchableOpacity style={styles.row} onPress={pickQuality} activeOpacity={0.7}>
            <Text style={styles.rowLabel}>Stream Quality</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>
                {quality.charAt(0).toUpperCase() + quality.slice(1)}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={COLORS.muted} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Account section */}
        <Text style={styles.sectionHeader}>Account</Text>
        <View style={styles.group}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Username</Text>
            <Text style={styles.rowValue}>{user?.username ?? "guest"}</Text>
          </View>
          <View style={styles.separator} />
          <TouchableOpacity
            style={styles.row}
            onPress={async () => {
              await loginDirectly(serverUrl);
              checkServer();
              Alert.alert("Connected", "Direct login refreshed successfully.");
            }}
            activeOpacity={0.7}
          >
            <Text style={[styles.rowLabel, { color: COLORS.accent }]}>Direct Login / Reconnect</Text>
            <Ionicons name="refresh" size={16} color={COLORS.accent} />
          </TouchableOpacity>
          <View style={styles.separator} />
          <TouchableOpacity style={styles.row} onPress={handleLogout} activeOpacity={0.7}>
            <Text style={[styles.rowLabel, { color: COLORS.muted }]}>Reset Session</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  navBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.separator,
  },
  navTitle: {
    fontSize: FONT.headline,
    fontWeight: "600",
    color: COLORS.label,
  },
  scrollContent: {
    paddingBottom: 60,
  },
  sectionHeader: {
    fontSize: FONT.footnote,
    fontWeight: "400",
    color: COLORS.secondaryLabel,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: SPACING.xl,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.xs,
  },
  group: {
    marginHorizontal: SPACING.md,
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: SPACING.md,
    paddingVertical: 14,
    minHeight: 48,
  },
  rowLabel: {
    fontSize: FONT.body,
    fontWeight: "400",
    color: COLORS.label,
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    maxWidth: "55%",
  },
  rowValue: {
    fontSize: FONT.callout,
    color: COLORS.secondaryLabel,
    textAlign: "right",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.separator,
    marginLeft: SPACING.md,
  },
});
