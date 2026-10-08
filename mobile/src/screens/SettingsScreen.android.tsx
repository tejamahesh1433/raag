import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { SafeAreaView } from "react-native-safe-area-context";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { api, APP_VERSION, getBaseUrl, getStreamQuality, setBaseUrl, setStreamQuality, type StreamQuality } from "../api";
import { useAuth } from "../store/auth";
import { useAppUpdate } from "../hooks/useAppUpdate";
import { COLORS, ELEVATION, RADIUS, SPACING } from "../theme/android";

interface Props {
  navigation: NativeStackNavigationProp<any>;
}

const QUALITY_OPTIONS: StreamQuality[] = ["original", "high", "medium", "low"];

export function SettingsScreen({ navigation }: Props) {
  const { user, logout } = useAuth();
  const [serverUrl, setServerUrl] = useState(getBaseUrl);
  const [serverStatus, setServerStatus] = useState<"checking" | "ok" | "error">("checking");
  const [quality, setQualityState] = useState<StreamQuality>(getStreamQuality);
  const [editingServer, setEditingServer] = useState(false);
  const [serverDraft, setServerDraft] = useState(serverUrl);

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
    setServerDraft(serverUrl);
    setEditingServer(true);
  }

  async function saveServerUrl() {
    const url = serverDraft.trim();
    if (!url) return;
    await setBaseUrl(url);
    setServerUrl(url);
    setEditingServer(false);
    void checkServer();
  }

  function pickQuality() {
    const buttons = QUALITY_OPTIONS.map((q) => ({
      text: q.charAt(0).toUpperCase() + q.slice(1),
      onPress: () => {
        setQualityState(q);
        void setStreamQuality(q);
      },
    }));
    buttons.push({ text: "Cancel", onPress: () => {} });
    Alert.alert("Stream Quality", "", buttons);
  }

  function handleLogout() {
    Alert.alert("Log Out", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: () => logout() },
    ]);
  }

  const statusColor = serverStatus === "ok" ? "#30d158" : serverStatus === "error" ? COLORS.accent : COLORS.muted;
  const statusIcon = serverStatus === "ok" ? "check-circle" : serverStatus === "error" ? "cancel" : "help-outline";

  const { state: updateState, progress: dlProgress, serverVersion, error: updateError, checkForUpdate, downloadAndInstall } = useAppUpdate();

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <MaterialIcons name="close" size={24} color={COLORS.muted} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Server section */}
        <Text style={styles.sectionHeader}>Server</Text>
        <View style={[styles.group, ELEVATION.card]}>
          <TouchableOpacity style={styles.row} onPress={editServerUrl} activeOpacity={0.7}>
            <Text style={styles.rowLabel}>Server URL</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue} numberOfLines={1}>{serverUrl || "Not set"}</Text>
              <MaterialIcons name="chevron-right" size={20} color={COLORS.muted} />
            </View>
          </TouchableOpacity>
          <View style={styles.separator} />
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Status</Text>
            <View style={styles.rowRight}>
              <Text style={[styles.rowValue, { color: statusColor }]}>
                {serverStatus === "ok" ? "Connected" : serverStatus === "error" ? "Offline" : "Checking…"}
              </Text>
              <MaterialIcons name={statusIcon} size={20} color={statusColor} />
            </View>
          </View>
        </View>

        {/* Playback section */}
        <Text style={styles.sectionHeader}>Playback</Text>
        <View style={[styles.group, ELEVATION.card]}>
          <TouchableOpacity style={styles.row} onPress={pickQuality} activeOpacity={0.7}>
            <Text style={styles.rowLabel}>Stream Quality</Text>
            <View style={styles.rowRight}>
              <Text style={styles.rowValue}>
                {quality.charAt(0).toUpperCase() + quality.slice(1)}
              </Text>
              <MaterialIcons name="chevron-right" size={20} color={COLORS.muted} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Account section */}
        <Text style={styles.sectionHeader}>Account</Text>
        <View style={[styles.group, ELEVATION.card]}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Username</Text>
            <Text style={styles.rowValue}>{user?.username ?? "—"}</Text>
          </View>
          <View style={styles.separator} />
          <TouchableOpacity style={styles.row} onPress={handleLogout} activeOpacity={0.7}>
            <Text style={[styles.rowLabel, { color: COLORS.accent }]}>Log Out</Text>
          </TouchableOpacity>
        </View>

        {/* App Update section */}
        <Text style={styles.sectionHeader}>App</Text>
        <View style={[styles.group, ELEVATION.card]}>
          <View style={styles.row}>
            <Text style={styles.rowLabel}>Version</Text>
            <Text style={styles.rowValue}>{APP_VERSION}</Text>
          </View>
          {updateState === "available" && (
            <>
              <View style={styles.separator} />
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: "#30d158" }]}>
                  Update available ({serverVersion})
                </Text>
              </View>
            </>
          )}
          {updateState === "uptodate" && (
            <>
              <View style={styles.separator} />
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: COLORS.muted }]}>Up to date</Text>
              </View>
            </>
          )}
          {updateState === "error" && (
            <>
              <View style={styles.separator} />
              <View style={styles.row}>
                <Text style={[styles.rowLabel, { color: COLORS.accent }]}>{updateError}</Text>
              </View>
            </>
          )}
          {(updateState === "downloading" || updateState === "installing") && (
            <>
              <View style={styles.separator} />
              <View style={styles.row}>
                <Text style={styles.rowLabel}>
                  {updateState === "installing" ? "Installing…" : "Downloading…"}
                </Text>
                <ActivityIndicator size="small" color={COLORS.accent} />
              </View>
            </>
          )}
          <View style={styles.separator} />
          {updateState === "available" ? (
            <TouchableOpacity style={styles.row} onPress={downloadAndInstall} activeOpacity={0.7}>
              <Text style={[styles.rowLabel, { color: COLORS.accent, fontWeight: "700" }]}>
                Download &amp; Install Update
              </Text>
              <MaterialIcons name="system-update" size={20} color={COLORS.accent} />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={styles.row}
              onPress={checkForUpdate}
              disabled={updateState === "checking" || updateState === "downloading" || updateState === "installing"}
              activeOpacity={0.7}
            >
              <Text style={styles.rowLabel}>
                {updateState === "checking" ? "Checking…" : "Check for Updates"}
              </Text>
              {updateState === "checking"
                ? <ActivityIndicator size="small" color={COLORS.muted} />
                : <MaterialIcons name="refresh" size={20} color={COLORS.muted} />}
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <Modal visible={editingServer} transparent animationType="fade" onRequestClose={() => setEditingServer(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.dialog, ELEVATION.modal]}>
            <Text style={styles.dialogTitle}>Server URL</Text>
            <Text style={styles.dialogHelp}>Enter the address of your Raag server.</Text>
            <TextInput
              value={serverDraft}
              onChangeText={setServerDraft}
              placeholder="http://192.168.1.10:8765"
              placeholderTextColor={COLORS.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={styles.urlInput}
            />
            <View style={styles.dialogActions}>
              <TouchableOpacity onPress={() => setEditingServer(false)} style={styles.dialogButton}>
                <Text style={styles.dialogButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void saveServerUrl()} style={styles.dialogButton}>
                <Text style={[styles.dialogButtonText, styles.dialogButtonPrimary]}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    borderBottomColor: COLORS.outline,
  },
  navTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: COLORS.onBg,
  },
  scrollContent: {
    paddingBottom: 140,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "500",
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
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
    fontSize: 16,
    fontWeight: "500",
    color: COLORS.onBg,
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: SPACING.xs,
    maxWidth: "55%",
  },
  rowValue: {
    fontSize: 14,
    color: COLORS.muted,
    textAlign: "right",
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: COLORS.outline,
    marginLeft: SPACING.md,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: SPACING.lg,
    backgroundColor: "rgba(0,0,0,0.72)",
  },
  dialog: {
    padding: SPACING.lg,
    borderRadius: RADIUS.lg,
    backgroundColor: COLORS.surface,
  },
  dialogTitle: {
    color: COLORS.onBg,
    fontSize: 20,
    fontWeight: "700",
  },
  dialogHelp: {
    color: COLORS.muted,
    fontSize: 14,
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
  },
  urlInput: {
    color: COLORS.onBg,
    backgroundColor: COLORS.surfaceVariant,
    borderColor: COLORS.outline,
    borderWidth: 1,
    borderRadius: RADIUS.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    fontSize: 15,
  },
  dialogActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: SPACING.sm,
    marginTop: SPACING.md,
  },
  dialogButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  dialogButtonText: {
    color: COLORS.muted,
    fontWeight: "700",
  },
  dialogButtonPrimary: {
    color: COLORS.accent,
  },
});
