import { useEffect, useRef, useState } from "react";
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
import { MaterialIcons } from "@expo/vector-icons";
import { api } from "../api";
import type { ChatMessage } from "../types";
import { usePlayer } from "../store/player";
import { COLORS, ELEVATION, RADIUS, SPACING } from "../theme/android";

export function ChatScreen() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const currentTrack = usePlayer((s) => (s.index >= 0 ? s.queue[s.index] : null));

  useEffect(() => {
    api.chatHistory()
      .then((history) => {
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
    <View style={styles.root}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
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
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            inverted
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        )}
        <View style={styles.inputContainer}>
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
              <MaterialIcons name="arrow-upward" size={20} color={COLORS.onAccent} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  flex: {
    flex: 1,
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
    borderRadius: RADIUS.md,
    ...ELEVATION.card,
  },
  bubbleUser: {
    backgroundColor: COLORS.accent,
    borderBottomRightRadius: RADIUS.sm,
  },
  bubbleAssistant: {
    backgroundColor: COLORS.surfaceVariant,
    borderBottomLeftRadius: RADIUS.sm,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  bubbleTextUser: {
    color: COLORS.onAccent,
  },
  bubbleTextAssistant: {
    color: COLORS.onBg,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLORS.outline,
    ...ELEVATION.card,
  },
  input: {
    flex: 1,
    backgroundColor: COLORS.surfaceVariant,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    fontSize: 15,
    color: COLORS.onBg,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: COLORS.outline,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
});
