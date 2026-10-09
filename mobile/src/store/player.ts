import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from "expo-audio";
import { create } from "zustand";
import { api } from "../api";
import type { Track } from "../types";

// Single persistent player — replace() swaps the track without destroy/recreate,
// which avoids Android issues where remove() doesn't immediately stop audio.
let _sound: AudioPlayer | null = null;
let _audioModeSet = false;

export type RepeatMode = "none" | "all" | "one";

interface PlayerState {
  queue: Track[];
  index: number;
  playing: boolean;
  position: number;
  duration: number;
  repeat: RepeatMode;
  shuffle: boolean;
  loading: boolean;

  playNow: (tracks: Track[], startIndex?: number) => Promise<void>;
  enqueue: (tracks: Track[]) => void;
  toggle: () => Promise<void>;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  jumpTo: (index: number) => Promise<void>;
  seekTo: (seconds: number) => Promise<void>;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  toggleFavorite: (trackId: number) => void;
  removeFromQueue: (index: number) => void;
  stop: () => void;
}

async function _ensureAudioMode(): Promise<void> {
  if (!_audioModeSet) {
    try {
      await setAudioModeAsync({
        shouldPlayInBackground: true,
        playsInSilentMode: true,
        interruptionMode: "doNotMix",
      });
      _audioModeSet = true;
    } catch {}
  }
}

function _getOrCreatePlayer(): AudioPlayer {
  if (!_sound) {
    const p = createAudioPlayer(null, { updateInterval: 500 });
    p.addListener("playbackStatusUpdate", (status: AudioStatus) => {
      if (!status.isLoaded) return;
      usePlayer.setState({
        position: status.currentTime,
        duration: status.duration,
        loading: status.isBuffering,
      });
      if (status.didJustFinish) {
        usePlayer.getState().next();
      }
    });
    _sound = p;
  }
  return _sound;
}

async function _playTrack(track: Track): Promise<void> {
  await _ensureAudioMode();
  const player = _getOrCreatePlayer();
  // replace() atomically swaps the source — old audio stops immediately
  player.replace(api.streamSource(track.id));
  player.play();
  usePlayer.setState({ playing: true, loading: false });
  api.recordPlayed(track.id).catch(() => {});
}

export const usePlayer = create<PlayerState>((set, get) => ({
  queue: [],
  index: -1,
  playing: false,
  position: 0,
  duration: 0,
  repeat: "none",
  shuffle: false,
  loading: false,

  playNow: async (tracks, startIndex = 0) => {
    if (!tracks.length || startIndex < 0 || startIndex >= tracks.length) return;
    set({ queue: tracks, index: startIndex, loading: true, position: 0 });
    try {
      await _playTrack(tracks[startIndex]);
    } catch {
      set({ playing: false, loading: false });
    }
  },

  enqueue: (tracks) => {
    const { queue, index } = get();
    set({ queue: [...queue, ...tracks] });
    if (index === -1) get().playNow(get().queue, 0);
  },

  toggle: async () => {
    if (!_sound) return;
    const { playing } = get();
    if (playing) {
      _sound.pause();
      set({ playing: false });
    } else {
      _sound.play();
      set({ playing: true });
    }
  },

  next: async () => {
    const { queue, index, repeat, shuffle } = get();
    if (!queue.length) return;
    if (repeat === "one") {
      await _playTrack(queue[index]);
      return;
    }
    let next = shuffle ? Math.floor(Math.random() * queue.length) : index + 1;
    if (next >= queue.length) {
      if (repeat === "all") next = 0;
      else { set({ playing: false }); return; }
    }
    set({ index: next, loading: true, position: 0 });
    await _playTrack(queue[next]);
  },

  prev: async () => {
    const { queue, index, position } = get();
    if (!queue.length) return;
    if (position > 3) { await _sound?.seekTo(0); return; }
    const prev = Math.max(0, index - 1);
    set({ index: prev, loading: true, position: 0 });
    await _playTrack(queue[prev]);
  },

  jumpTo: async (idx) => {
    const { queue } = get();
    if (idx < 0 || idx >= queue.length) return;
    set({ index: idx, loading: true, position: 0 });
    await _playTrack(queue[idx]);
  },

  seekTo: async (seconds) => {
    await _sound?.seekTo(seconds);
    set({ position: seconds });
  },

  toggleShuffle: () => set((s) => ({ shuffle: !s.shuffle })),

  cycleRepeat: () => set((s) => ({
    repeat: s.repeat === "none" ? "all" : s.repeat === "all" ? "one" : "none",
  })),

  toggleFavorite: (trackId) => {
    const { queue } = get();
    const track = queue.find((t) => t.id === trackId);
    if (!track) return;
    if (track.is_favorite) {
      api.unfavorite(trackId).catch(() => {});
    } else {
      api.favorite(trackId).catch(() => {});
    }
    set({ queue: queue.map((t) => t.id === trackId ? { ...t, is_favorite: !t.is_favorite } : t) });
  },

  stop: () => {
    if (_sound) {
      try { _sound.pause(); } catch {}
    }
    set({ queue: [], index: -1, playing: false, loading: false, position: 0, duration: 0 });
  },

  removeFromQueue: (idx) => {
    const { queue, index } = get();
    const next = queue.filter((_, i) => i !== idx);
    set({ queue: next, index: idx < index ? index - 1 : idx === index ? Math.min(index, next.length - 1) : index });
  },
}));
