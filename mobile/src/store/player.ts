import {
  createAudioPlayer,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioStatus,
} from "expo-audio";
import { create } from "zustand";
import { api } from "../api";
import type { Track } from "../types";

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

async function _stopCurrent(): Promise<void> {
  if (_sound) {
    try {
      _sound.clearLockScreenControls();
      _sound.pause();
      _sound.remove();
    } catch {}
    _sound = null;
  }
}

async function _playTrack(track: Track): Promise<void> {
  await _stopCurrent();
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
  const sound = createAudioPlayer(api.streamSource(track.id), { updateInterval: 500 });
  const repeatMode = usePlayer.getState().repeat;
  sound.loop = repeatMode === "one";

  try {
    const artworkUrl = api.artworkUrl(track.artwork_id) ?? undefined;
    sound.setActiveForLockScreen(true, {
      title: track.title,
      artist: track.artist,
      albumTitle: track.album,
      artworkUrl,
    });
  } catch {}

  sound.addListener("playbackStatusUpdate", (status: AudioStatus) => {
    if (!status.isLoaded) return;
    usePlayer.setState({
      position: status.currentTime,
      duration: status.duration,
      loading: status.isBuffering,
    });
    if (status.didJustFinish) {
      if (usePlayer.getState().repeat !== "one") {
        usePlayer.getState().next();
      }
    }
  });
  _sound = sound;
  sound.play();
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
    let nextIdx: number;
    if (shuffle && queue.length > 1) {
      const pool = queue.map((_, i) => i).filter((i) => i !== index);
      nextIdx = pool[Math.floor(Math.random() * pool.length)];
    } else {
      nextIdx = index + 1;
    }
    if (nextIdx >= queue.length) {
      if (repeat === "all") nextIdx = 0;
      else { set({ playing: false }); return; }
    }
    set({ index: nextIdx, loading: true, position: 0 });
    await _playTrack(queue[nextIdx]);
  },

  prev: async () => {
    const { queue, index, position, repeat } = get();
    if (!queue.length) return;
    if (position > 3) {
      await _sound?.seekTo(0);
      set({ position: 0 });
      return;
    }
    let prevIdx = index - 1;
    if (prevIdx < 0) {
      if (repeat === "all") prevIdx = queue.length - 1;
      else prevIdx = 0;
    }
    set({ index: prevIdx, loading: true, position: 0 });
    await _playTrack(queue[prevIdx]);
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

  cycleRepeat: () => {
    const nextRepeat: RepeatMode =
      get().repeat === "none" ? "all" : get().repeat === "all" ? "one" : "none";
    if (_sound) {
      _sound.loop = nextRepeat === "one";
    }
    set({ repeat: nextRepeat });
  },

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
    _stopCurrent();
    set({ queue: [], index: -1, playing: false, loading: false, position: 0, duration: 0 });
  },

  removeFromQueue: (idx) => {
    const { queue, index } = get();
    const nextQueue = queue.filter((_, i) => i !== idx);
    if (!nextQueue.length) {
      _stopCurrent();
      set({ queue: [], index: -1, playing: false, position: 0, duration: 0 });
      return;
    }
    if (idx === index) {
      const newIdx = Math.min(index, nextQueue.length - 1);
      set({ queue: nextQueue, index: newIdx, position: 0 });
      _playTrack(nextQueue[newIdx]);
    } else {
      const newIdx = idx < index ? index - 1 : index;
      set({ queue: nextQueue, index: newIdx });
    }
  },
}));
