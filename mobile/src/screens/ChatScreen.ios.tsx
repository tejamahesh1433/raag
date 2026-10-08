import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { api } from "../api";
import type { ChatMessage, Track } from "../types";
import { usePlayer } from "../store/player";
import { COLORS, FONT, RADIUS, SPACING } from "../theme/ios";

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

  useEffect(() => {
    api.chatHistory()
      .then((history) => {
        // newest-first for inverted FlatList
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
            type?: string;
            mode?: string;
            tracks?: Track[];
            name?: string;
          };
          if (action.type === "play" && Array.isArray(action.tracks)) {
            const player = usePlayer.getState();
            if (action.mode === "queue") {
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
          <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
            <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant]}>
              {item.content}
            </Text>
          </View>
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={styles.largeTitle}>Chat</Text>
      <KeyboardAvoidingView behavior="padding" style={styles.flex}>
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
        <SafeAreaView edges={["bottom"]} style={styles.inputContainer}>
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
              style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
              onPress={handleSend}
              disabled={!input.trim() || sending}
            >
              {sending ? (
                <ActivityIndicator size="small" color={COLORS.onAccent} />
              ) : (
                <Ionicons name="arrow-up" size={18} color={COLORS.onAccent} />
              )}
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  flex: {
    flex: 1,
  },
  largeTitle: {
    fontSize: 34,
    fontWeight: "700",
    color: COLORS.label,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.xs,
  },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  listContent: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
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
    maxWidth: "78%",
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
    maxWidth: "78%",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: RADIUS.lg,
  },
  bubbleUser: {
    backgroundColor: COLORS.accent,
    borderBottomRightRadius: RADIUS.sm,
  },
  bubbleAssistant: {
    backgroundColor: COLORS.surfaceSecondary,
    borderBottomLeftRadius: RADIUS.sm,
  },
  bubbleText: {
    fontSize: FONT.body,
    lineHeight: 22,
  },
  bubbleTextUser: {
    color: COLORS.onAccent,
  },
  bubbleTextAssistant: {
    color: COLORS.label,
  },
  inputContainer: {
    backgroundColor: COLORS.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.separator,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.surfaceSecondary,
    borderRadius: RADIUS.xl,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: FONT.body,
    color: COLORS.label,
    maxHeight: 120,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
