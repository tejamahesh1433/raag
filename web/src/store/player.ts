import { create } from "zustand";
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
}

/** Fisher–Yates shuffle that avoids placing the same track adjacent to its
 * previous position when possible — used when enabling shuffle on a queue. */
export function shuffledIndices(length: number, except: number): number[] {
  const idx = Array.from({ length }, (_, i) => i).filter((i) => i !== except);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  if (except >= 0 && idx.length > 0 && idx[0] === except) {
    [idx[0], idx[idx.length - 1]] = [idx[idx.length - 1], idx[0]];
  }
  return except >= 0 ? [except, ...idx] : idx;
}

export const usePlayer = create<PlayerState>((set, get) => ({
  queue: [],
  index: -1,
  playing: false,
  shuffle: false,
  repeat: "off",
  playToken: 0,

  current: () => get().queue[get().index] ?? null,

  playNow: (tracks, startIndex = 0) => {
    if (tracks.length === 0) return;
    const index = Math.min(Math.max(startIndex, 0), tracks.length - 1);
    set((s) => ({ queue: tracks, index, playing: true, playToken: s.playToken + 1 }));
  },

  enqueue: (tracks) => {
    set((s) => {
      if (s.queue.length === 0) {
        return {
          queue: tracks,
          index: 0,
          playing: true,
          playToken: s.playToken + 1,
        };
      }
      // Avoid duplicating the currently playing track.
      const currentId = s.queue[s.index]?.id;
      const filtered = tracks.filter((t) => t.id !== currentId);
      return { queue: [...s.queue, ...filtered] };
    });
  },

  toggle: () => set((s) => ({ playing: !s.playing && s.index >= 0 })),

  setPlaying: (playing) => set({ playing }),

  next: (auto = false) => {
    const s = get();
    if (s.queue.length === 0) return;
    if (auto && s.repeat === "one") {
      set((st) => ({ playToken: st.playToken + 1 }));
      return;
    }
    let nextIndex = s.index + 1;
    if (nextIndex >= s.queue.length) {
      if (s.repeat === "all") nextIndex = 0;
      else {
        set({ playing: false });
        return;
      }
    }
    set((st) => ({ index: nextIndex, playing: true, playToken: st.playToken + 1 }));
  },

  prev: () => {
    const s = get();
    if (s.queue.length === 0) return;
    const prevIndex = s.index <= 0 ? s.queue.length - 1 : s.index - 1;
    set((st) => ({ index: prevIndex, playing: true, playToken: st.playToken + 1 }));
  },

  jumpTo: (index) => {
    const s = get();
    if (index < 0 || index >= s.queue.length) return;
    set((st) => ({ index, playing: true, playToken: st.playToken + 1 }));
  },

  toggleShuffle: () => {
    const s = get();
    if (s.queue.length === 0) {
      set({ shuffle: !s.shuffle });
      return;
    }
    if (!s.shuffle) {
      // Enable: reorder queue so current track stays first.
      const order = shuffledIndices(s.queue.length, s.index);
      const currentTrack = s.queue[s.index];
      const queue = order.map((i) => s.queue[i]);
      set({ queue, index: currentTrack ? 0 : -1, shuffle: true });
    } else {
      // Disable: restore original (title-sorted) order, keep current track.
      const currentTrack = s.queue[s.index];
      const queue = [...s.queue].sort((a, b) => a.title.localeCompare(b.title));
      const index = currentTrack ? queue.findIndex((t) => t.id === currentTrack.id) : -1;
      set({ queue, index, shuffle: false });
    }
  },

  cycleRepeat: () =>
    set((s) => ({
      repeat: s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off",
    })),

  clear: () => set({ queue: [], index: -1, playing: false }),
}));
