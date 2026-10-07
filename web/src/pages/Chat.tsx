import { useEffect, useRef, useState } from "react";
import { api, type ChatMessageOut } from "../api";
import { IconSpark } from "../components/icons";
import { usePlayer } from "../store/player";
import type { Track } from "../types";

interface ToolChip {
  name: string;
  summary: string;
}

interface UIMessage {
  role: "user" | "assistant";
  content: string;
  tools: ToolChip[];
  notices: string[];
  streaming?: boolean;
}

const SUGGESTIONS = [
  "Play something upbeat",
  "What genres do I have?",
  "Make me a playlist of my most played",
  "Tell me about my library",
];

function fromHistory(rows: ChatMessageOut[]): UIMessage[] {
  return rows.map((row) => ({
    role: row.role,
    content: row.content,
    tools: [],
    notices: (row.actions ?? []).map((a) => {
      if (a.type === "playlist_created") return `📋 Created playlist “${String(a.name)}”`;
      if (a.type === "play") {
        const count = Array.isArray(a.tracks) ? a.tracks.length : 0;
        return `▶ Played ${count} track(s)`;
      }
      return JSON.stringify(a);
    }),
  }));
}

export function ChatPage() {
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    api
      .chatHistory()
      .then((rows) => setMessages(fromHistory(rows)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const nowPlaying = () => {
    const s = usePlayer.getState();
    const t = s.index >= 0 ? s.queue[s.index] : null;
    return t ? { title: t.title, artist: t.artist } : null;
  };

  const updateLast = (fn: (m: UIMessage) => UIMessage) =>
    setMessages((prev) => {
      const next = [...prev];
      const last = next.length - 1;
      if (last >= 0 && next[last].role === "assistant") next[last] = fn(next[last]);
      return next;
    });

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    setInput("");
    setError("");
    setBusy(true);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: message, tools: [], notices: [] },
      { role: "assistant", content: "", tools: [], notices: [], streaming: true },
    ]);

    try {
      await api.streamChat(message, nowPlaying(), (ev) => {
        if (ev.event === "token") {
          const piece = String(ev.data.text ?? "");
          updateLast((m) => ({ ...m, content: m.content + piece }));
        } else if (ev.event === "tool") {
          const chip: ToolChip = {
            name: String(ev.data.name ?? "tool"),
            summary: String(ev.data.summary ?? ""),
          };
          updateLast((m) => ({ ...m, tools: [...m.tools, chip] }));
        } else if (ev.event === "action") {
          const action = ev.data as unknown as {
            type: string;
            mode?: string;
            tracks?: Track[];
            name?: string;
          };
          if (action.type === "play" && Array.isArray(action.tracks)) {
            const player = usePlayer.getState();
            if (action.mode === "queue") player.enqueue(action.tracks);
            else player.playNow(action.tracks, 0);
            const verb = action.mode === "queue" ? "＋ Queued" : "▶ Playing";
            updateLast((m) => ({
              ...m,
              notices: [...m.notices, `${verb} ${action.tracks!.length} track(s)`],
            }));
          } else if (action.type === "playlist_created") {
            updateLast((m) => ({
              ...m,
              notices: [...m.notices, `📋 Created playlist “${action.name ?? ""}”`],
            }));
          }
        } else if (ev.event === "error") {
          setError(String(ev.data.detail ?? "AI error"));
        } else if (ev.event === "done") {
          updateLast((m) => ({ ...m, streaming: false }));
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat failed");
    } finally {
      updateLast((m) => ({ ...m, streaming: false }));
      setBusy(false);
    }
  };

  const clear = async () => {
    try {
      await api.clearChat();
      setMessages([]);
    } catch {
      /* keep history on failure */
    }
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-border-subtle bg-surface/80 px-4 py-4 backdrop-blur">
        <IconSpark className="text-accent" />
        <div>
          <h1 className="text-lg font-semibold">AI Assistant</h1>
          <p className="text-xs text-muted">Local model · your library never leaves home</p>
        </div>
        <div className="flex-1" />
        {messages.length > 0 && (
          <button className="btn btn-ghost text-xs" onClick={() => void clear()}>
            Clear
          </button>
        )}
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-5">
        {messages.length === 0 && (
          <div className="mx-auto max-w-lg py-8 text-center">
            <IconSpark className="mx-auto mb-3 h-10 w-10 text-accent" size={40} />
            <p className="text-sm text-muted">
              Ask your library anything — it can search, play, and build playlists with
              real commands. Powered by your local Ollama/LM Studio.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  className="rounded-full border border-border-subtle bg-panel px-3 py-1.5 text-xs text-muted hover:text-ink"
                  onClick={() => void send(s)}
                  disabled={busy}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-md bg-accent px-4 py-2.5 text-sm text-white"
                  : "max-w-[85%] rounded-2xl rounded-bl-md bg-panel px-4 py-2.5 text-sm"
              }
            >
              {m.tools.length > 0 && (
                <div className="mb-2 space-y-1">
                  {m.tools.map((t, j) => (
                    <div
                      key={j}
                      className="rounded-lg bg-panel-2 px-2 py-1 font-mono text-[11px] text-muted"
                      title={t.summary}
                    >
                      🔧 {t.name} · {t.summary}
                    </div>
                  ))}
                </div>
              )}
              {m.notices.map((n, j) => (
                <div key={j} className="mb-1 text-xs font-medium text-accent-bright">
                  {n}
                </div>
              ))}
              <div className="whitespace-pre-wrap">
                {m.content}
                {m.streaming && <span className="ml-0.5 animate-pulse">▍</span>}
              </div>
            </div>
          </div>
        ))}

        {error && (
          <div className="mx-auto max-w-lg rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-center text-xs text-danger">
            {error}
          </div>
        )}
      </div>

      <form
        className="flex gap-2 border-t border-border-subtle bg-panel/60 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          className="input flex-1"
          placeholder="Ask about your music, or say what to play…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
        />
        <button className="btn btn-primary shrink-0" disabled={busy || !input.trim()}>
          {busy ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
