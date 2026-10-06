import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { usePlayer } from "../store/player";
import { Artwork } from "./Artwork";
import {
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [artworkId, setArtworkId] = useState<number | null>(null);

  const queue = usePlayer((s) => s.queue);
  const index = usePlayer((s) => s.index);
  const playing = usePlayer((s) => s.playing);
  const playToken = usePlayer((s) => s.playToken);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const current = index >= 0 ? queue[index] ?? null : null;

  if (!audioRef.current && typeof Audio !== "undefined") {
    audioRef.current = new Audio();
  }

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    audio.src = api.streamUrl(current.id);
    audio.currentTime = 0;
    if (playing) {
      void audio.play().catch(() => usePlayer.getState().setPlaying(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, playToken]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (playing) void audio.play().catch(() => usePlayer.getState().setPlaying(false));
    else audio.pause();
  }, [playing, current]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setProgress(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);
    const onEnded = () => usePlayer.getState().next(true);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnded);
    };
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
    ms.setActionHandler("nexttrack", () => usePlayer.getState().next());
    ms.setActionHandler("previoustrack", () => usePlayer.getState().prev());
  }, [current]);

  const reportedRef = useRef<number | null>(null);
  useEffect(() => {
    if (current && reportedRef.current !== current.id) {
      reportedRef.current = current.id;
      void api.recordPlayed(current.id).catch(() => undefined);
    }
  }, [current]);

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

  const seek = (value: number) => {
    const audio = audioRef.current;
    if (audio && Number.isFinite(value)) {
      audio.currentTime = value;
      setProgress(value);
    }
  };

  if (!current) return null;

  const bottomClass = "bottom-[calc(4.25rem+env(safe-area-inset-bottom))] lg:bottom-0";

  return (
    <div className={`player-dock ${bottomClass}`}>
      <div
        className="group/progress h-2 w-full cursor-pointer bg-ink"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          seek(ratio * duration);
        }}
      >
        <div
          className="relative h-full bg-accent transition-[width] duration-150"
          style={{ width: duration ? `${(progress / duration) * 100}%` : "0%" }}
        />
      </div>

      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:gap-5 sm:px-6">
        <Artwork
          artworkId={artworkId}
          size={52}
          className="!rounded-none border-2 !border-accent"
        />

        <div className="min-w-0 flex-1">
          <div className="mb-0.5 flex items-center gap-2">
            {playing && (
              <span className="on-air !px-1.5 !py-0 !text-[9px]">
                <span className="on-air-dot" />
                Live
              </span>
            )}
            <div className="truncate text-sm font-semibold text-panel">{current.title}</div>
          </div>
          <div className="truncate font-mono text-[11px] uppercase tracking-wide text-panel/60">
            {current.artist}
            <span className="text-panel/35"> · </span>
            {current.album}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            className={`btn-icon !text-panel hover:!bg-accent hover:!text-ink ${shuffle ? "!border-accent !bg-accent !text-ink" : ""} hidden sm:flex`}
            onClick={() => usePlayer.getState().toggleShuffle()}
            title="Shuffle"
          >
            <IconShuffle size={18} />
          </button>
          <button
            type="button"
            className="btn-icon !text-panel hover:!bg-accent hover:!text-ink"
            onClick={() => usePlayer.getState().prev()}
            title="Previous"
          >
            <IconSkipBack size={20} />
          </button>
          <button
            type="button"
            className="flex h-11 w-11 items-center justify-center border-2 border-accent bg-accent text-ink shadow-[3px_3px_0_0_var(--color-signal)] transition-transform hover:-translate-y-px"
            onClick={() => usePlayer.getState().toggle()}
            title={playing ? "Pause" : "Play"}
          >
            {playing ? <IconPause size={22} /> : <IconPlay size={22} className="ml-0.5" />}
          </button>
          <button
            type="button"
            className="btn-icon !text-panel hover:!bg-accent hover:!text-ink"
            onClick={() => usePlayer.getState().next()}
            title="Next"
          >
            <IconSkipForward size={20} />
          </button>
          <button
            type="button"
            className={`btn-icon !text-panel hover:!bg-accent hover:!text-ink ${repeat !== "off" ? "!border-accent !bg-accent !text-ink" : ""} hidden sm:flex`}
            onClick={() => usePlayer.getState().cycleRepeat()}
            title={`Repeat: ${repeat}`}
          >
            {repeat === "one" ? <IconRepeatOne size={18} /> : <IconRepeat size={18} />}
          </button>
        </div>

        <div className="hidden w-28 text-right font-mono text-xs tabular-nums text-accent md:block">
          {fmt(progress)} / {fmt(duration)}
        </div>
      </div>
    </div>
  );
}
