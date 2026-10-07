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
import type { ChatMessage } from "../types";
import { usePlayer } from "../store/player";
import { COLORS, FONT, RADIUS, SPACING } from "../theme/ios";

export default function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const currentTrack = usePlayer((s) => (s.index >= 0 ? s.queue[s.index] : null));

  useEffect(() => {
    api.chatHistory()
      .then((history) => {
        // newest-first for inverted FlatList
        const sorted = [...history].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );
        setMessages(sorted);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");

    const userMsg: ChatMessage = {
      id: `local-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [userMsg, ...prev]);

    setSending(true);
    try {
      const nowPlaying = currentTrack
        ? { title: currentTrack.title, artist: currentTrack.artist }
        : undefined;
      const response = await api.chat(text, nowPlaying);
      setMessages((prev) => [response, ...prev]);
    } catch {}
    setSending(false);
  }

  function renderItem({ item }: { item: ChatMessage }) {
    const isUser = item.role === "user";
    return (
      <View style={[styles.bubbleRow, isUser ? styles.bubbleRowUser : styles.bubbleRowAssistant]}>
        <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}>
          <Text style={[styles.bubbleText, isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant]}>
            {item.content}
          </Text>
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
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            inverted
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
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
