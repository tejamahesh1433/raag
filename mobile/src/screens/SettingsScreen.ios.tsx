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
import { api, getBaseUrl, setBaseUrl } from "../api";
import { useAuth } from "../store/auth";
import { COLORS, FONT, RADIUS, SPACING } from "../theme/ios";

interface Props {
  navigation: NativeStackNavigationProp<any>;
}

type Quality = "original" | "high" | "medium" | "low";
const QUALITY_OPTIONS: Quality[] = ["original", "high", "medium", "low"];

export default function SettingsScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const [serverUrl, setServerUrl] = useState(getBaseUrl);
  const [serverStatus, setServerStatus] = useState<"checking" | "ok" | "error">("checking");
  const [quality, setQuality] = useState<Quality>("original");

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
      (idx) => {
        if (idx < QUALITY_OPTIONS.length) setQuality(QUALITY_OPTIONS[idx]);
      },
    );
  }

  function handleLogout() {
    Alert.alert("Log Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: () => logout() },
    ]);
  }

  const statusIcon = serverStatus === "ok"
    ? { name: "checkmark.circle.fill" as any, color: "#30d158" }
    : serverStatus === "error"
      ? { name: "xmark.circle.fill" as any, color: COLORS.accent }
      : { name: "circle" as any, color: COLORS.muted };

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
            <Text style={styles.rowValue}>{user?.username ?? "—"}</Text>
          </View>
          <View style={styles.separator} />
          <TouchableOpacity style={styles.row} onPress={handleLogout} activeOpacity={0.7}>
            <Text style={[styles.rowLabel, { color: COLORS.accent }]}>Log Out</Text>
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
