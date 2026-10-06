import { create } from "zustand";
import { pauseAudio, stopAudio } from "../audioEngine";
import type { Track } from "../types";

export type RepeatMode = "off" | "all" | "one";

interface PlayerState {
  queue: Track[];
  index: number;
  playing: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  /** True when playback was (re)started explicitly — drives <audio> loads. */
  playToken: number;

  current: () => Track | null;
  playNow: (tracks: Track[], startIndex?: number) => void;
  enqueue: (tracks: Track[]) => void;
  toggle: () => void;
  setPlaying: (playing: boolean) => void;
  next: (auto?: boolean) => void;
  prev: () => void;
  jumpTo: (index: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  clear: () => void;
  removeFromQueue: (idx: number) => void;
  reorderQueue: (from: number, to: number) => void;
}

/** Fisher–Yates shuffle of an array (copy). */
export function shuffleArray<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Fisher–Yates shuffle that keeps `except` index locked at position 0. */
export function shuffledIndices(length: number, except: number): number[] {
  const idx = Array.from({ length }, (_, i) => i).filter((i) => i !== except);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return except >= 0 ? [except, ...idx] : idx;
}

function withCurrentFirst(tracks: Track[], startIndex: number): Track[] {
  if (tracks.length <= 1) return [...tracks];
  const index = Math.min(Math.max(startIndex, 0), tracks.length - 1);
  const current = tracks[index];
  const rest = tracks.filter((_, i) => i !== index);
  return [current, ...shuffleArray(rest)];
}

const STORAGE_KEY = "raag-player";

interface PersistedPlayer {
  queue: Track[];
  index: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

function loadPersisted(): Partial<PersistedPlayer> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as PersistedPlayer;
    if (!Array.isArray(data.queue) || typeof data.index !== "number") return {};
    if (data.queue.length === 0 || data.index < 0 || data.index >= data.queue.length) {
      return { queue: [], index: -1, shuffle: data.shuffle ?? false, repeat: data.repeat ?? "off" };
    }
    return data;
  } catch {
    return {};
  }
}

function savePersisted(queue: Track[], index: number, shuffle: boolean, repeat: RepeatMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ queue, index, shuffle, repeat }));
  } catch {
    // Storage errors are non-fatal
  }
}

const persisted = loadPersisted();

export const usePlayer = create<PlayerState>((set, get) => ({
  queue: persisted.queue ?? [],
  index: persisted.index ?? -1,
  playing: false,
  shuffle: persisted.shuffle ?? false,
  repeat: persisted.repeat ?? "off",
  playToken: 0,

  current: () => get().queue[get().index] ?? null,

  playNow: (tracks, startIndex = 0) => {
    if (tracks.length === 0) return;
    const shuffleOn = get().shuffle;
    let queue: Track[];
    let index: number;
    if (shuffleOn && tracks.length > 1) {
      queue = withCurrentFirst(tracks, startIndex);
      index = 0;
    } else {
      queue = [...tracks];
      index = Math.min(Math.max(startIndex, 0), tracks.length - 1);
    }
    set((s) => ({ queue, index, playing: true, playToken: s.playToken + 1 }));
    savePersisted(queue, index, get().shuffle, get().repeat);
  },

  enqueue: (tracks) => {
    set((s) => {
      if (s.queue.length === 0) {
        const queue =
          s.shuffle && tracks.length > 1 ? withCurrentFirst(tracks, 0) : [...tracks];
        savePersisted(queue, 0, s.shuffle, s.repeat);
        return {
          queue,
          index: 0,
          playing: true,
          playToken: s.playToken + 1,
        };
      }
      const currentId = s.queue[s.index]?.id;
      const filtered = tracks.filter((t) => t.id !== currentId);
      if (filtered.length === 0) return s;
      // With shuffle on, sprinkle new tracks into the upcoming portion.
      if (s.shuffle) {
        const played = s.queue.slice(0, s.index + 1);
        const upcoming = shuffleArray([...s.queue.slice(s.index + 1), ...filtered]);
        const queue = [...played, ...upcoming];
        savePersisted(queue, s.index, s.shuffle, s.repeat);
        return { queue };
      }
      const queue = [...s.queue, ...filtered];
      savePersisted(queue, s.index, s.shuffle, s.repeat);
      return { queue };
    });
  },

  toggle: () =>
    set((s) => {
      const playing = !s.playing && s.index >= 0;
      if (!playing) pauseAudio();
      return { playing };
    }),

  setPlaying: (playing) => {
    if (!playing) pauseAudio();
    set({ playing });
  },

  next: (auto = false) => {
    const s = get();
    if (s.queue.length === 0) return;
    if (auto && s.repeat === "one") {
      set((st) => ({ playToken: st.playToken + 1 }));
      return;
    }
    let nextIndex = s.index + 1;
    if (nextIndex >= s.queue.length) {
      if (s.repeat === "all") {
        if (s.shuffle && s.queue.length > 1) {
          // New shuffled cycle: don't start on the track that just ended.
          const finishedId = s.queue[s.index]?.id;
          const rest = shuffleArray(s.queue.filter((t) => t.id !== finishedId));
          const finished = s.queue[s.index];
          const queue = finished ? [...rest, finished] : rest;
          set((st) => ({
            queue,
            index: 0,
            playing: true,
            playToken: st.playToken + 1,
          }));
          savePersisted(queue, 0, s.shuffle, s.repeat);
          return;
        }
        nextIndex = 0;
      } else {
        set({ playing: false });
        return;
      }
    }
    set((st) => ({ index: nextIndex, playing: true, playToken: st.playToken + 1 }));
    savePersisted(s.queue, nextIndex, s.shuffle, s.repeat);
  },

  prev: () => {
    const s = get();
    if (s.queue.length === 0) return;
    const prevIndex = s.index <= 0 ? s.queue.length - 1 : s.index - 1;
    set((st) => ({ index: prevIndex, playing: true, playToken: st.playToken + 1 }));
    savePersisted(s.queue, prevIndex, s.shuffle, s.repeat);
  },

  jumpTo: (index) => {
    const s = get();
    if (index < 0 || index >= s.queue.length) return;
    set((st) => ({ index, playing: true, playToken: st.playToken + 1 }));
    savePersisted(s.queue, index, s.shuffle, s.repeat);
  },

  toggleShuffle: () => {
    const s = get();
    if (s.queue.length === 0) {
      const shuffle = !s.shuffle;
      set({ shuffle });
      savePersisted(s.queue, s.index, shuffle, s.repeat);
      return;
    }
    if (!s.shuffle) {
      const order = shuffledIndices(s.queue.length, s.index);
      const currentTrack = s.queue[s.index];
      const queue = order.map((i) => s.queue[i]);
      const index = currentTrack ? 0 : -1;
      set({ queue, index, shuffle: true });
      savePersisted(queue, index, true, s.repeat);
    } else {
      // Turn off only — keep the current play order as-is.
      set({ shuffle: false });
      savePersisted(s.queue, s.index, false, s.repeat);
    }
  },

  cycleRepeat: () => {
    const s = get();
    const repeat: RepeatMode = s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off";
    set({ repeat });
    savePersisted(s.queue, s.index, s.shuffle, repeat);
  },

  clear: () => {
    stopAudio();
    const s = get();
    set({ queue: [], index: -1, playing: false });
    savePersisted([], -1, s.shuffle, s.repeat);
  },

  removeFromQueue: (idx: number) => {
    const s = get();
    if (idx < 0 || idx >= s.queue.length) return;
    const queue = [...s.queue];
    queue.splice(idx, 1);

    if (queue.length === 0) {
      stopAudio();
      set({ queue: [], index: -1, playing: false });
      savePersisted([], -1, s.shuffle, s.repeat);
      return;
    }

    let index = s.index;
    if (idx < index) {
      index = index - 1;
      set({ queue, index });
      savePersisted(queue, index, s.shuffle, s.repeat);
    } else if (idx === index) {
      if (index >= queue.length) {
        // Was the last track — clear
        stopAudio();
        set({ queue: [], index: -1, playing: false });
        savePersisted([], -1, s.shuffle, s.repeat);
      } else {
        // index stays same, now points to what was next — bump playToken to play it
        set((st) => ({ queue, index, playToken: st.playToken + 1 }));
        savePersisted(queue, index, s.shuffle, s.repeat);
      }
    } else {
      // idx > index: just remove, index unchanged
      set({ queue, index });
      savePersisted(queue, index, s.shuffle, s.repeat);
    }
  },

  reorderQueue: (from: number, to: number) => {
    const s = get();
    if (from === to) return;
    const queue = [...s.queue];
    const [moved] = queue.splice(from, 1);
    queue.splice(to, 0, moved);

    let index = s.index;
    if (from === index) {
      index = to;
    } else if (from < index && to >= index) {
      index = index - 1;
    } else if (from > index && to <= index) {
      index = index + 1;
    }

    set({ queue, index });
    savePersisted(queue, index, s.shuffle, s.repeat);
  },
}));
