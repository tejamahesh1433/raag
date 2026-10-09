import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { api } from "../api";
import type { ChatMessage, Track } from "../types";
import { usePlayer } from "../store/player";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { COLORS, FONT, RADIUS, SHADOW, SPACING } from "../theme/ios";

function messageKey(item: ChatMessage): string {
  return String(item.id);
}

function messageTime(item: ChatMessage): number {
  const raw = item.created_at ?? item.timestamp;
  const t = raw ? new Date(raw).getTime() : NaN;
  return Number.isNaN(t) ? 0 : t;
}

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notices, setNotices] = useState<Record<string, string[]>>({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const currentTrack = usePlayer((s) => (s.index >= 0 ? s.queue[s.index] : null));
  let tabBarHeight = 84;
  try {
    tabBarHeight = useBottomTabBarHeight();
  } catch {}

  useEffect(() => {
    api.chatHistory()
      .then((history) => {
        const sorted = [...history].sort(
          (a, b) => messageTime(b) - messageTime(a),
        );
        setMessages(sorted);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function appendNotice(key: string, notice: string) {
    setNotices((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), notice] }));
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setError("");

    const draftKey = `local-${Date.now()}`;
    const userMsg: ChatMessage = {
      id: draftKey,
      role: "user",
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [userMsg, ...prev]);

    setSending(true);
    try {
      const nowPlaying = currentTrack
        ? { title: currentTrack.title, artist: currentTrack.artist }
        : undefined;
      const pendingId = `stream-${Date.now()}`;
      let started = false;
      await api.streamChat(text, nowPlaying, (ev) => {
        if (ev.event === "token") {
          const piece = String((ev.data as { text?: unknown }).text ?? "");
          setMessages((prev) => {
            if (started) {
              return prev.map((m) =>
                String(m.id) === pendingId ? { ...m, content: m.content + piece } : m,
              );
            }
            started = true;
            return [
              {
                id: pendingId,
                role: "assistant",
                content: piece,
                created_at: new Date().toISOString(),
              } satisfies ChatMessage,
              ...prev,
            ];
          });
        } else if (ev.event === "action") {
          const action = ev.data as unknown as {
            type: string;
            tracks?: Track[];
            queue_only?: boolean;
            name?: string;
          };
          const player = usePlayer.getState();
          if (action.type === "play_tracks" && Array.isArray(action.tracks) && action.tracks.length) {
            if (action.queue_only) {
              player.enqueue(action.tracks);
              appendNotice(draftKey, `+ Queued ${action.tracks.length} track(s)`);
            } else {
              void player.playNow(action.tracks, 0);
              appendNotice(draftKey, `▶ Playing ${action.tracks.length} track(s)`);
            }
          } else if (action.type === "playlist_created") {
            appendNotice(draftKey, `Created playlist “${action.name ?? ""}”`);
          }
        } else if (ev.event === "error") {
          setError(String((ev.data as { detail?: unknown }).detail ?? "AI error"));
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat failed");
    }
    setSending(false);
  }

  function renderItem({ item }: { item: ChatMessage }) {
    const isUser = item.role === "user";
    const extra = notices[String(item.id)] ?? [];
    return (
      <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
        <View style={styles.bubbleColumn}>
          {extra.map((n) => (
            <Text key={n} style={styles.noticeText}>
              {n}
            </Text>
          ))}
          {isUser ? (
            <View style={styles.userBubbleShadow}>
              <LinearGradient
                colors={COLORS.accentGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.bubble, styles.bubbleUser]}
              >
                {/* Diagonal Gloss Sheen */}
                <LinearGradient
                  colors={["rgba(255, 255, 255, 0.35)", "transparent"]}
                  style={styles.bubbleGloss}
                  pointerEvents="none"
                />
                <Text style={styles.bubbleTextUser}>{item.content}</Text>
              </LinearGradient>
            </View>
          ) : (
            <View style={[styles.bubble, styles.bubbleAssistant]}>
              <View style={styles.assistantRim} pointerEvents="none" />
              <Text style={styles.bubbleTextAssistant}>{item.content}</Text>
            </View>
          )}
        </View>
      </View>
    );
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
          <Text style={styles.largeTitle}>Chat</Text>
        </View>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
          style={styles.flex}
        >
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={COLORS.accent} />
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={messageKey}
              renderItem={renderItem}
              inverted
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* Frosted Glass Input Container */}
          <View style={[styles.inputContainer, { marginBottom: tabBarHeight }]}>
            <BlurView tint="dark" intensity={80} style={styles.inputBlur}>
              <View style={styles.inputRim} pointerEvents="none" />
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.input}
                  value={input}
                  onChangeText={setInput}
                  placeholder="Ask about your music…"
                  placeholderTextColor={COLORS.muted}
                  returnKeyType="send"
                  onSubmitEditing={handleSend}
                  multiline
                />
                <TouchableOpacity
                  style={[
                    styles.sendBtn,
                    (!input.trim() || sending) && styles.sendBtnDisabled,
                  ]}
                  onPress={handleSend}
                  disabled={!input.trim() || sending}
                >
                  <LinearGradient
                    colors={
                      !input.trim() || sending
                        ? ["#444", "#333"]
                        : COLORS.accentGradient
                    }
                    style={StyleSheet.absoluteFill}
                  />
                  {sending ? (
                    <ActivityIndicator size="small" color={COLORS.onAccent} />
                  ) : (
                    <Ionicons name="arrow-up" size={18} color={COLORS.onAccent} />
                  )}
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>
        </KeyboardAvoidingView>
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
  flex: {
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
  },
  listContent: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    paddingBottom: 20,
  },
  bubbleRow: {
    marginVertical: SPACING.xs,
    flexDirection: "row",
  },
  bubbleRowUser: {
    justifyContent: "flex-end",
  },
  bubbleRowAssistant: {
    justifyContent: "flex-start",
  },
  bubbleColumn: {
    maxWidth: "80%",
  },
  userBubbleShadow: {
    ...SHADOW.glow(COLORS.accent),
    borderRadius: RADIUS.lg,
  },
  noticeText: {
    fontSize: 12,
    color: COLORS.accent,
    fontWeight: "600",
    marginBottom: 2,
  },
  errorText: {
    fontSize: 12,
    color: "#ff453a",
    textAlign: "center",
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  bubble: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
    position: "relative",
    overflow: "hidden",
  },
  bubbleUser: {
    borderBottomRightRadius: RADIUS.xs,
  },
  bubbleGloss: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 14,
  },
  bubbleAssistant: {
    backgroundColor: "rgba(38, 38, 48, 0.72)",
    borderBottomLeftRadius: RADIUS.xs,
    ...SHADOW.card,
  },
  assistantRim: {
    ...StyleSheet.absoluteFill,
    borderRadius: RADIUS.lg,
    borderBottomLeftRadius: RADIUS.xs,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    borderTopColor: "rgba(255, 255, 255, 0.28)",
  },
  bubbleTextUser: {
    color: COLORS.onAccent,
    fontSize: FONT.body,
    lineHeight: 22,
  },
  bubbleTextAssistant: {
    color: COLORS.label,
    fontSize: FONT.body,
    lineHeight: 22,
  },
  inputContainer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.separator,
  },
  inputBlur: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: "rgba(18, 18, 24, 0.85)",
  },
  inputRim: {
    ...StyleSheet.absoluteFill,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.10)",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: SPACING.sm,
  },
  input: {
    flex: 1,
    backgroundColor: "rgba(42, 42, 54, 0.65)",
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT.body,
    color: COLORS.label,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.10)",
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
