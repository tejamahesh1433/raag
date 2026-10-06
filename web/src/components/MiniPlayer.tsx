import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import {
  addAudioListener,
  airPlayAvailable,
  getAudio,
  getCrossfade,
  handoffTo,
  isNormalizeOn,
  pauseAudio,
  playUrl,
  preloadNext,
  remainingTime,
  setNormalize,
  showAirPlayPicker,
  stopAudio,
  ensureAnalyser,
  isGapless,
} from "../audioEngine";
import { SpectrumVisualizer } from "./SpectrumVisualizer";
import { getStreamQuality, setStreamQuality, type StreamQuality } from "../lib/streamQuality";
import { downloadTrack, isOffline, removeOfflineTrack } from "../lib/offline";
import { absoluteUrl, castMedia, initCast, isCastAvailable } from "../lib/cast";
import { publishState, onPartyMessage, getPartyMeta } from "../lib/party";
import { usePlayer } from "../store/player";
import type { Track } from "../types";
import { Artwork } from "./Artwork";
import { LyricsPanel } from "./LyricsPanel";
import {
  IconChevronDown,
  IconClose,
  IconClock,
  IconHeart,
  IconPause,
  IconPlay,
  IconRepeat,
  IconRepeatOne,
  IconShuffle,
  IconSkipBack,
  IconSkipForward,
} from "./icons";

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const artworkCache = new Map<number, number | null>();

export function MiniPlayer() {
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [artworkId, setArtworkId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [favorite, setFavorite] = useState(false);
  const [lyrics, setLyrics] = useState<{
    plain: string;
    synced: Array<{ t: number; text: string }>;
    source: string;
  } | null>(null);
  const [lyricsError, setLyricsError] = useState("");
  const [similar, setSimilar] = useState<Array<{ track: Track; score: number }>>([]);
  const [panel, setPanel] = useState<"upnext" | "similar" | "lyrics">("upnext");
  const [sleepMins, setSleepMins] = useState<number | null>(null);
  const [sleepLeft, setSleepLeft] = useState(0);
  const sleepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sleepTick = useRef<ReturnType<typeof setInterval> | null>(null);
  const [normalize, setNormalizeState] = useState(isNormalizeOn());
  const [streamQuality, setStreamQualityState] = useState<StreamQuality>(getStreamQuality());
  const [offlineSaved, setOfflineSaved] = useState(false);
  const queueDragIdx = useRef(-1);
  const [queueDragOver, setQueueDragOver] = useState(-1);
  const scrobbledRef = useRef<number | null>(null);
  const handoffLock = useRef(false);
  const skipLoadRef = useRef(false);

  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const playing = usePlayer((s) => s.playing);
  const playToken = usePlayer((s) => s.playToken);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const current = index >= 0 ? queue[index] ?? null : null;
  const upNext = current ? queue.slice(index + 1) : [];

  // Dual-buffer listeners — active element swaps during gapless handoff.
  useEffect(() => {
    initCast();
    const onTime = () => setProgress(getAudio().currentTime);
    const onMeta = () => setDuration(getAudio().duration || 0);
    const onEnded = () => {
      // Dual-buffer handoff owns advancement when gapless/crossfade is on.
      if (isGapless() || getCrossfade() > 0) return;
      usePlayer.getState().next(true);
    };
    const offTime = addAudioListener("timeupdate", onTime);
    const offMeta = addAudioListener("loadedmetadata", onMeta);
    const offEnded = addAudioListener("ended", onEnded);
    return () => {
      offTime();
      offMeta();
      offEnded();
      pauseAudio();
      usePlayer.getState().setPlaying(false);
    };
  }, []);

  useEffect(() => {
    if (!current) {
      stopAudio();
      setProgress(0);
      setDuration(0);
      return;
    }
    if (skipLoadRef.current) {
      skipLoadRef.current = false;
      const s = usePlayer.getState();
      const nextTrack = s.queue[s.index + 1];
      if (nextTrack) preloadNext(api.streamUrl(nextTrack.id));
      return;
    }
    const url = api.streamUrl(current.id);
    void playUrl(url, 0)
      .then(() => {
        if (!usePlayer.getState().playing) pauseAudio();
      })
      .catch(() => usePlayer.getState().setPlaying(false));
    setProgress(0);
    const s = usePlayer.getState();
    const nextTrack = s.queue[s.index + 1];
    if (nextTrack) preloadNext(api.streamUrl(nextTrack.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, playToken]);

  useEffect(() => {
    if (!current) return;
    const audio = getAudio();
    if (playing) {
      void audio.play().catch(() => usePlayer.getState().setPlaying(false));
    } else {
      audio.pause();
    }
  }, [playing, current]);

  // Gapless / crossfade handoff near the end
  useEffect(() => {
    if (!current || !playing) return;
    handoffLock.current = false;
    const tick = () => {
      const s = usePlayer.getState();
      const nextTrack = s.queue[s.index + 1];
      if (!nextTrack) {
        if (remainingTime() <= 0.05) usePlayer.getState().next(true);
        return;
      }
      if (handoffLock.current) return;
      const fade = getCrossfade();
      const need = fade > 0 ? fade : isGapless() ? 0.35 : 0;
      if (need <= 0) return;
      const rem = remainingTime();
      if (rem <= need + 0.05) {
        handoffLock.current = true;
        const url = api.streamUrl(nextTrack.id);
        if (handoffTo(url)) {
          skipLoadRef.current = true;
          usePlayer.setState({ index: s.index + 1, playing: true });
          const after = usePlayer.getState().queue[usePlayer.getState().index + 1];
          if (after) preloadNext(api.streamUrl(after.id));
        } else {
          handoffLock.current = false;
        }
      } else if (rem < 20) {
        preloadNext(api.streamUrl(nextTrack.id));
      }
    };
    return addAudioListener("timeupdate", tick);
  }, [current, playing]);

  // Host publishes party state
  useEffect(() => {
    const meta = getPartyMeta();
    if (meta.role !== "host") return;
    const id = window.setInterval(() => {
      const s = usePlayer.getState();
      const cur = s.current();
      publishState({
        trackId: cur?.id ?? null,
        title: cur?.title,
        artist: cur?.artist,
        playing: s.playing,
        position: getAudio().currentTime || 0,
        queueIds: s.queue.map((t) => t.id),
        index: s.index,
      });
    }, 1500);
    return () => clearInterval(id);
  }, [current?.id, playing]);

  // Listen for remote commands when hosting
  useEffect(() => {
    return onPartyMessage((msg) => {
      if (msg.type !== "cmd") return;
      const meta = getPartyMeta();
      if (meta.role !== "host") return;
      const player = usePlayer.getState();
      const cmd = String(msg.cmd || "");
      if (cmd === "toggle") player.toggle();
      else if (cmd === "next") player.next();
      else if (cmd === "prev") player.prev();
      else if (cmd === "play") player.setPlaying(true);
      else if (cmd === "pause") player.setPlaying(false);
      else if (cmd === "seek") {
        const t = Number((msg.payload as { t?: number })?.t);
        if (Number.isFinite(t)) getAudio().currentTime = t;
      }
    });
  }, []);

  // Followers apply host state
  useEffect(() => {
    return onPartyMessage((msg) => {
      if (msg.type !== "state") return;
      const meta = getPartyMeta();
      if (meta.role !== "listener") return;
      const state = msg.state as {
        trackId?: number;
        playing?: boolean;
        position?: number;
        queueIds?: number[];
        index?: number;
      };
      // Soft sync: only seek if drift is large; track changes via queue if present
      if (typeof state.position === "number") {
        const audio = getAudio();
        if (Math.abs(audio.currentTime - state.position) > 2) {
          audio.currentTime = state.position;
        }
      }
      if (typeof state.playing === "boolean") {
        usePlayer.getState().setPlaying(state.playing);
      }
    });
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator) || !current) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: current.title,
      artist: current.artist,
      album: current.album,
    });
    const ms = navigator.mediaSession;
    ms.setActionHandler("play", () => usePlayer.getState().setPlaying(true));
    ms.setActionHandler("pause", () => usePlayer.getState().setPlaying(false));
    ms.setActionHandler("stop", () => {
      usePlayer.getState().setPlaying(false);
      pauseAudio();
    });
    ms.setActionHandler("nexttrack", () => usePlayer.getState().next());
    ms.setActionHandler("previoustrack", () => usePlayer.getState().prev());
  }, [current]);

  const reportedRef = useRef<number | null>(null);
  useEffect(() => {
    scrobbledRef.current = null;
    reportedRef.current = null;
    if (!current) {
      setOfflineSaved(false);
      return;
    }
    void isOffline(current.id).then(setOfflineSaved).catch(() => setOfflineSaved(false));
  }, [current?.id]);

  // Scrobble / play-count at Last.fm rule: 50% or 4 minutes.
  useEffect(() => {
    if (!current || !playing) return;
    const audio = getAudio();
    const maybeScrobble = () => {
      if (scrobbledRef.current === current.id) return;
      const t = audio.currentTime;
      const d = audio.duration || current.duration || 0;
      if (t >= 240 || (d > 0 && t >= d * 0.5)) {
        scrobbledRef.current = current.id;
        reportedRef.current = current.id;
        void api.recordPlayed(current.id).catch(() => undefined);
      }
    };
    audio.addEventListener("timeupdate", maybeScrobble);
    return () => audio.removeEventListener("timeupdate", maybeScrobble);
  }, [current, playing]);

  useEffect(() => {
    if (playing) ensureAnalyser();
  }, [playing]);

  useEffect(() => {
    setFavorite(Boolean(current?.is_favorite));
  }, [current?.id, current?.is_favorite]);

  useEffect(() => {
    if (!current?.album_id) {
      setArtworkId(null);
      return;
    }
    const cached = artworkCache.get(current.album_id);
    if (cached !== undefined) {
      setArtworkId(cached);
      return;
    }
    void api.albums().then((albums) => {
      for (const a of albums) artworkCache.set(a.id, a.artwork_id);
      setArtworkId(artworkCache.get(current.album_id!) ?? null);
    });
  }, [current?.album_id]);

  useEffect(() => {
    if (!expanded || !current) return;
    setLyrics(null);
    setLyricsError("");
    setSimilar([]);
    void api
      .lyrics(current.id)
      .then(setLyrics)
      .catch(() => setLyricsError("No lyrics yet"));
    void api
      .similarTracks(current.id)
      .then(setSimilar)
      .catch(() => setSimilar([]));
  }, [expanded, current?.id]);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [expanded]);

  // Global keyboard shortcuts — registered once, reads live state via getState()
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName ?? "";
      if (["INPUT", "TEXTAREA", "SELECT"].includes(tag)) return;
      const player = usePlayer.getState();
      if (e.key === " ") {
        e.preventDefault();
        player.toggle();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        player.prev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        player.next();
      } else if (e.key === "l") {
        const cur = player.current();
        if (cur) {
          void (cur.is_favorite ? api.unfavorite(cur.id) : api.favorite(cur.id))
            .then((updated) => {
              setFavorite(updated.is_favorite);
              cur.is_favorite = updated.is_favorite;
              usePlayer.setState({ queue: [...usePlayer.getState().queue] });
            })
            .catch(() => undefined);
        }
      } else if (e.key === "m") {
        const a = getAudio();
        a.muted = !a.muted;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const seek = (value: number) => {
    const audio = getAudio();
    if (Number.isFinite(value)) {
      audio.currentTime = value;
      setProgress(value);
    }
  };

  const seekFromEvent = (e: { currentTarget: HTMLDivElement; clientX: number }) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    seek(ratio * duration);
  };

  const startSleep = (mins: number) => {
    if (sleepTimer.current) clearTimeout(sleepTimer.current);
    if (sleepTick.current) clearInterval(sleepTick.current);
    const endMs = Date.now() + mins * 60_000;
    setSleepMins(mins);
    setSleepLeft(mins * 60);
    sleepTimer.current = setTimeout(() => {
      usePlayer.getState().setPlaying(false);
      setSleepMins(null);
      setSleepLeft(0);
      if (sleepTick.current) clearInterval(sleepTick.current);
    }, mins * 60_000);
    sleepTick.current = setInterval(() => {
      const rem = Math.max(0, Math.ceil((endMs - Date.now()) / 1000));
      setSleepLeft(rem);
      if (rem === 0) clearInterval(sleepTick.current!);
    }, 1000);
  };

  const cancelSleep = () => {
    if (sleepTimer.current) clearTimeout(sleepTimer.current);
    if (sleepTick.current) clearInterval(sleepTick.current);
    setSleepMins(null);
    setSleepLeft(0);
  };

  const toggleNormalize = () => {
    const next = !normalize;
    setNormalize(next);
    setNormalizeState(next);
  };

  const toggleFavorite = async () => {
    if (!current) return;
    try {
      const updated = favorite
        ? await api.unfavorite(current.id)
        : await api.favorite(current.id);
      setFavorite(updated.is_favorite);
      current.is_favorite = updated.is_favorite;
      usePlayer.setState({ queue: [...usePlayer.getState().queue] });
    } catch {
      /* ignore */
    }
  };

  if (!current) return null;

  const bottomClass = "bottom-[calc(4.25rem+env(safe-area-inset-bottom))] lg:bottom-0";
  const artUrl = artworkId ? api.artworkUrl(artworkId) : null;
  const progressPct = duration ? `${(progress / duration) * 100}%` : "0%";

  const transport = (size: "dock" | "full") => (
    <div
      className={
        size === "full"
          ? "mt-6 flex items-center justify-center gap-2"
          : "flex items-center gap-1"
      }
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={`btn-icon ${size === "full" ? "" : "hidden sm:flex"} ${shuffle ? "btn-icon-active" : ""}`}
        onClick={() => usePlayer.getState().toggleShuffle()}
        title="Shuffle"
      >
        <IconShuffle size={size === "full" ? 20 : 18} />
      </button>
      <button
        type="button"
        className="btn-icon"
        onClick={() => usePlayer.getState().prev()}
        title="Previous"
      >
        <IconSkipBack size={size === "full" ? 24 : 20} />
      </button>
      <button
        type="button"
        className={
          size === "full"
            ? "mx-1 flex h-16 w-16 items-center justify-center rounded-full bg-ink text-surface shadow-xl transition-transform hover:scale-105"
            : "flex h-12 w-12 items-center justify-center rounded-full bg-ink text-surface shadow-lg transition-transform hover:scale-105"
        }
        onClick={() => usePlayer.getState().toggle()}
        title={playing ? "Pause" : "Play"}
      >
        {playing ? (
          <IconPause size={size === "full" ? 28 : 22} />
        ) : (
          <IconPlay size={size === "full" ? 28 : 22} className="ml-0.5" />
        )}
      </button>
      <button
        type="button"
        className="btn-icon"
        onClick={() => usePlayer.getState().next()}
        title="Next"
      >
        <IconSkipForward size={size === "full" ? 24 : 20} />
      </button>
      <button
        type="button"
        className={`btn-icon ${size === "full" ? "" : "hidden sm:flex"} ${repeat !== "off" ? "btn-icon-active" : ""}`}
        onClick={() => usePlayer.getState().cycleRepeat()}
        title={`Repeat: ${repeat}`}
      >
        {repeat === "one" ? (
          <IconRepeatOne size={size === "full" ? 20 : 18} />
        ) : (
          <IconRepeat size={size === "full" ? 20 : 18} />
        )}
      </button>
    </div>
  );

  return (
    <>
      {!expanded && (
        <div
          className={`player-dock ${bottomClass} cursor-pointer`}
          role="button"
          tabIndex={0}
          aria-label="Open now playing"
          onClick={() => setExpanded(true)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setExpanded(true);
            }
          }}
        >
          <div
            className="group/progress h-1 w-full cursor-pointer bg-white/10"
            onClick={(e) => {
              e.stopPropagation();
              seekFromEvent(e);
            }}
          >
            <div
              className="relative h-full bg-gradient-to-r from-accent to-white transition-[width] duration-150"
              style={{ width: progressPct }}
            />
          </div>

          <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-5 sm:px-6">
            <Artwork artworkId={artworkId} size={52} className="!rounded-xl shadow-lg" />

            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex items-center gap-2">
                {playing && (
                  <span className="on-air !px-1.5 !py-0 !text-[9px]">
                    <span className="on-air-dot" />
                    Live
                  </span>
                )}
                <div className="truncate track-title text-sm text-ink">{current.title}</div>
              </div>
              <div className="meta-line truncate">
                {current.artist}
                <span className="text-muted/50"> · </span>
                {current.album}
              </div>
            </div>

            {transport("dock")}

            <div className="hidden w-28 text-right text-xs tabular-nums text-muted md:block">
              {fmt(progress)} / {fmt(duration)}
            </div>
          </div>
        </div>
      )}

      {expanded && (
        <div className={`now-playing ${playing ? "is-playing" : ""}`} role="dialog" aria-label="Now playing">
          <div className="now-playing-stage">
            {artUrl ? (
              <div className="now-playing-bg" style={{ backgroundImage: `url(${artUrl})` }} />
            ) : (
              <div
                className="now-playing-bg"
                style={{
                  background:
                    "radial-gradient(circle at 40% 40%, rgba(251,113,133,0.45), transparent 55%), #12121a",
                }}
              />
            )}
            <div className="now-playing-veil" />

            <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-4 py-4 sm:px-7">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3.5 py-2 text-xs text-ink backdrop-blur-md hover:bg-white/12"
                onClick={() => setExpanded(false)}
              >
                <IconChevronDown size={16} />
                Library
              </button>
              <button
                type="button"
                className={`btn-icon !bg-white/8 !text-ink backdrop-blur-md ${favorite ? "!text-accent-bright" : ""}`}
                onClick={() => void toggleFavorite()}
                title={favorite ? "Unsave" : "Save"}
              >
                <IconHeart size={18} filled={favorite} />
              </button>
            </div>

            <div className="now-playing-stack">
              <div className="now-playing-disc-wrap">
                <div className={`now-playing-disc-ring ${playing ? "is-playing" : ""}`} />
                <div className={`now-playing-disc ${playing ? "is-playing" : ""}`}>
                  <Artwork
                    artworkId={artworkId}
                    size={340}
                    className="!h-full !w-full !rounded-[22px] !border-0"
                  />
                </div>
              </div>

              <div className="on-air mb-3">
                <span className="on-air-dot" />
                Now playing
              </div>
              <h1 className="now-playing-title text-3xl sm:text-4xl">{current.title}</h1>
              <p className="meta-line mt-2 text-sm">
                <span className="font-semibold tracking-wide text-ink/90">{current.artist}</span>
                <span className="text-muted/50"> · </span>
                {current.album}
              </p>

              <div className={`now-playing-bars ${playing ? "is-playing" : ""}`} aria-hidden>
                <span /><span /><span /><span /><span />
              </div>
              <SpectrumVisualizer active={expanded && playing} />

              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <label className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-[11px] text-muted backdrop-blur-md">
                  Quality
                  <select
                    className="bg-transparent text-ink outline-none"
                    value={streamQuality}
                    onChange={(e) => {
                      const q = e.target.value as StreamQuality;
                      setStreamQuality(q);
                      setStreamQualityState(q);
                      // Reload current track at new quality
                      const a = getAudio();
                      const t = a.currentTime;
                      a.src = api.streamUrl(current.id, q);
                      a.currentTime = t;
                      if (playing) void a.play().catch(() => undefined);
                    }}
                  >
                    <option value="original">Original</option>
                    <option value="320">320 kbps</option>
                    <option value="256">256 kbps</option>
                    <option value="192">192 kbps</option>
                    <option value="128">128 kbps</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-[11px] text-ink backdrop-blur-md hover:bg-white/12"
                  onClick={() => {
                    void (async () => {
                      try {
                        if (offlineSaved) {
                          await removeOfflineTrack(current.id);
                          setOfflineSaved(false);
                        } else {
                          await downloadTrack(current);
                          setOfflineSaved(true);
                        }
                      } catch {
                        /* ignore */
                      }
                    })();
                  }}
                >
                  {offlineSaved ? "Remove offline" : "Save offline"}
                </button>
                {isCastAvailable() && (
                  <button
                    type="button"
                    className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-[11px] text-ink backdrop-blur-md hover:bg-white/12"
                    onClick={() => {
                      void castMedia({
                        contentUrl: absoluteUrl(api.streamUrl(current.id)),
                        title: current.title,
                        subtitle: current.artist,
                        imageUrl: artUrl ? absoluteUrl(artUrl) : undefined,
                        currentTime: getAudio().currentTime,
                      }).catch(() => undefined);
                    }}
                  >
                    Cast
                  </button>
                )}
                {airPlayAvailable() && (
                  <button
                    type="button"
                    className="rounded-full border border-white/10 bg-white/8 px-3 py-1.5 text-[11px] text-ink backdrop-blur-md hover:bg-white/12"
                    onClick={() => showAirPlayPicker()}
                  >
                    AirPlay
                  </button>
                )}
              </div>

              <div className="mt-6 w-full">
                <div
                  className="group h-1.5 w-full cursor-pointer rounded-full bg-white/15"
                  onClick={seekFromEvent}
                >
                  <div
                    className="relative h-full rounded-full bg-gradient-to-r from-accent to-white transition-[width] duration-150"
                    style={{ width: progressPct }}
                  >
                    <span className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full bg-white opacity-0 shadow group-hover:opacity-100" />
                  </div>
                </div>
                <div className="mt-2 flex justify-between text-xs tabular-nums text-muted">
                  <span>{fmt(progress)}</span>
                  <span>{fmt(duration)}</span>
                </div>
              </div>

              {transport("full")}

              {/* Sleep timer + normalize row */}
              <div className="mt-4 flex w-full items-center justify-center gap-3 text-[11px]">
                <IconClock size={13} className="text-muted/70" />
                {sleepMins ? (
                  <>
                    <span className="tabular-nums text-muted">
                      {fmt(sleepLeft)} left
                    </span>
                    <button
                      type="button"
                      className="rounded-full bg-white/10 px-2.5 py-0.5 text-ink hover:bg-white/15"
                      onClick={cancelSleep}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-muted/60">Sleep:</span>
                    {[15, 30, 45, 60].map((m) => (
                      <button
                        key={m}
                        type="button"
                        className="rounded-full bg-white/8 px-2.5 py-0.5 text-muted hover:bg-white/15 hover:text-ink"
                        onClick={() => startSleep(m)}
                      >
                        {m}m
                      </button>
                    ))}
                  </>
                )}
                <div className="ml-2 h-3 w-px bg-white/15" />
                <button
                  type="button"
                  className={`rounded-full px-2.5 py-0.5 transition-colors ${
                    normalize
                      ? "bg-accent/25 text-accent-bright"
                      : "bg-white/8 text-muted hover:bg-white/15 hover:text-ink"
                  }`}
                  onClick={toggleNormalize}
                  title="Volume normalization (loudness clamp)"
                >
                  Normalize
                </button>
              </div>

              <div className="mt-6 flex w-full gap-2 xl:hidden">
                {(["upnext", "similar", "lyrics"] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`flex-1 rounded-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider ${
                      panel === id ? "bg-white/15 text-ink" : "text-muted"
                    }`}
                    onClick={() => setPanel(id)}
                  >
                    {id === "upnext" ? "Up next" : id === "similar" ? "Similar" : "Lyrics"}
                  </button>
                ))}
              </div>
              <div className="mt-3 w-full max-h-48 overflow-y-auto text-left xl:hidden">
                {panel === "lyrics" && (
                  <div className="rounded-2xl bg-black/20 px-4 py-3 text-sm leading-relaxed text-ink/90">
                    <LyricsPanel
                      plain={lyrics?.plain}
                      synced={lyrics?.synced}
                      source={lyrics?.source}
                      progress={progress}
                      error={lyricsError}
                      onFetch={() => {
                        if (!current) return;
                        void api
                          .fetchLyrics(current.id)
                          .then((l) => {
                            setLyrics(l);
                            setLyricsError("");
                          })
                          .catch(() => setLyricsError("No lyrics found"));
                      }}
                    />
                  </div>
                )}
                {panel === "similar" &&
                  (similar.length === 0 ? (
                    <p className="px-2 py-4 text-center text-sm text-muted">
                      Index embeddings in Settings for similar tracks
                    </p>
                  ) : (
                    similar.map(({ track }) => (
                      <button
                        key={track.id}
                        type="button"
                        className="mb-1 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/5"
                        onClick={() => usePlayer.getState().playNow([track], 0)}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{track.title}</div>
                          <div className="truncate text-xs text-muted">{track.artist}</div>
                        </div>
                      </button>
                    ))
                  ))}
                {panel === "upnext" &&
                  (upNext.length === 0 ? (
                    <p className="px-2 py-4 text-center text-sm text-muted">End of queue</p>
                  ) : (
                    upNext.map((track, i) => (
                      <div
                        key={`${track.id}-m-${i}`}
                        draggable
                        className={`mb-1 flex w-full cursor-grab items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-white/5 active:cursor-grabbing ${
                          queueDragOver === index + 1 + i ? "ring-1 ring-inset ring-accent/40" : ""
                        }`}
                        onClick={() => usePlayer.getState().jumpTo(index + 1 + i)}
                        onDragStart={() => { queueDragIdx.current = index + 1 + i; }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (queueDragIdx.current !== index + 1 + i) setQueueDragOver(index + 1 + i);
                        }}
                        onDragLeave={() => setQueueDragOver(-1)}
                        onDrop={() => {
                          const from = queueDragIdx.current;
                          if (from !== -1 && from !== index + 1 + i) {
                            usePlayer.getState().reorderQueue(from, index + 1 + i);
                          }
                          queueDragIdx.current = -1;
                          setQueueDragOver(-1);
                        }}
                        onDragEnd={() => { queueDragIdx.current = -1; setQueueDragOver(-1); }}
                      >
                        <span className="shrink-0 text-muted/40 select-none">⠿</span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{track.title}</div>
                          <div className="truncate text-xs text-muted">{track.artist}</div>
                        </div>
                        <div className="text-xs tabular-nums text-muted">{fmt(track.duration)}</div>
                        <button
                          type="button"
                          className="btn-icon !h-6 !w-6 shrink-0 hover:text-rose-400"
                          title="Remove from queue"
                          onClick={(e) => {
                            e.stopPropagation();
                            usePlayer.getState().removeFromQueue(index + 1 + i);
                          }}
                        >
                          <IconClose size={14} />
                        </button>
                      </div>
                    ))
                  ))}
              </div>
            </div>
          </div>

          <aside className="now-playing-queue">
            <div className="border-b border-white/10 px-5 py-5">
              <h3 className="font-display text-lg text-ink">Listening</h3>
              <div className="mt-3 flex gap-2">
                {(["upnext", "similar", "lyrics"] as const).map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider ${
                      panel === id ? "bg-white/12 text-ink" : "text-muted hover:text-ink"
                    }`}
                    onClick={() => setPanel(id)}
                  >
                    {id === "upnext" ? "Up next" : id === "similar" ? "Similar" : "Lyrics"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {panel === "lyrics" && (
                <div className="px-2 py-2 text-sm leading-relaxed text-ink/90">
                  <LyricsPanel
                    plain={lyrics?.plain}
                    synced={lyrics?.synced}
                    source={lyrics?.source}
                    progress={progress}
                    error={lyricsError}
                    onFetch={() => {
                      if (!current) return;
                      void api
                        .fetchLyrics(current.id)
                        .then((l) => {
                          setLyrics(l);
                          setLyricsError("");
                        })
                        .catch(() => setLyricsError("No lyrics found"));
                    }}
                  />
                </div>
              )}
              {panel === "similar" &&
                (similar.length === 0 ? (
                  <p className="px-2 py-6 text-center text-sm text-muted">
                    Index embeddings in Settings for similar tracks
                  </p>
                ) : (
                  similar.map(({ track }) => (
                    <button
                      key={track.id}
                      type="button"
                      className="mb-1 flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/5"
                      onClick={() => usePlayer.getState().playNow([track, ...queue], 0)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-ink">{track.title}</div>
                        <div className="truncate text-xs text-muted">{track.artist}</div>
                      </div>
                    </button>
                  ))
                ))}
              {panel === "upnext" && (
                <>
                  {upNext.length === 0 && (
                    <p className="px-2 py-6 text-center text-sm text-muted">End of queue</p>
                  )}
                  {upNext.map((track, i) => (
                    <div
                      key={`${track.id}-${i}`}
                      draggable
                      className={`mb-1 flex w-full cursor-grab items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors hover:bg-white/5 active:cursor-grabbing ${
                        queueDragOver === index + 1 + i ? "ring-1 ring-inset ring-accent/40" : ""
                      }`}
                      onClick={() => usePlayer.getState().jumpTo(index + 1 + i)}
                      onDragStart={() => { queueDragIdx.current = index + 1 + i; }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (queueDragIdx.current !== index + 1 + i) setQueueDragOver(index + 1 + i);
                      }}
                      onDragLeave={() => setQueueDragOver(-1)}
                      onDrop={() => {
                        const from = queueDragIdx.current;
                        if (from !== -1 && from !== index + 1 + i) {
                          usePlayer.getState().reorderQueue(from, index + 1 + i);
                        }
                        queueDragIdx.current = -1;
                        setQueueDragOver(-1);
                      }}
                      onDragEnd={() => { queueDragIdx.current = -1; setQueueDragOver(-1); }}
                    >
                      <span className="shrink-0 text-muted/40 select-none">⠿</span>
                      <Artwork
                        artworkId={
                          track.album_id ? artworkCache.get(track.album_id) ?? null : null
                        }
                        size={48}
                        className="!rounded-[10px]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-ink">{track.title}</div>
                        <div className="truncate text-xs text-muted">{track.artist}</div>
                      </div>
                      <div className="text-xs tabular-nums text-muted">{fmt(track.duration)}</div>
                      <button
                        type="button"
                        className="btn-icon !h-6 !w-6 shrink-0 hover:text-rose-400"
                        title="Remove from queue"
                        onClick={(e) => {
                          e.stopPropagation();
                          usePlayer.getState().removeFromQueue(index + 1 + i);
                        }}
                      >
                        <IconClose size={14} />
                      </button>
                    </div>
                  ))}
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
