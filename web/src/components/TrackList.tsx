import { useEffect, useState } from "react";
import { api } from "../api";
import type { Playlist, Track } from "../types";
import { usePlayer } from "../store/player";
import { Artwork } from "./Artwork";
import {
  IconClose,
  IconHeart,
  IconMore,
  IconMusic,
  IconPlay,
  IconPlus,
  IconSpark,
} from "./icons";

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function TrackList({
  tracks,
  showArtwork = true,
  showAlbum = true,
  artworkByAlbumId,
  onRemoved,
  onRemove,
}: {
  tracks: Track[];
  showArtwork?: boolean;
  showAlbum?: boolean;
  artworkByAlbumId?: Record<number, number | null>;
  onRemoved?: (trackId: number) => void;
  onRemove?: (trackId: number) => void;
}) {
  const currentTrack = usePlayer((s) => (s.index >= 0 ? s.queue[s.index] ?? null : null));
  const playing = usePlayer((s) => s.playing);
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [menuFor, setMenuFor] = useState<number | null>(null);

  useEffect(() => {
    if (menuFor !== null && playlists === null) {
      void api.playlists().then(setPlaylists).catch(() => setPlaylists([]));
    }
  }, [menuFor, playlists]);

  const toggleFavorite = async (track: Track) => {
    const updated = track.is_favorite
      ? await api.unfavorite(track.id)
      : await api.favorite(track.id);
    track.is_favorite = updated.is_favorite;
    usePlayer.setState({ queue: [...usePlayer.getState().queue] });
  };

  if (tracks.length === 0) {
    return <div className="empty-state">No tracks here yet.</div>;
  }

  return (
    <div className="pb-6">
      <div className="track-table-header">
        <span>#</span>
        <span className="hidden lg:block" />
        <span>Title</span>
        <span className="hidden sm:block">Year</span>
        <span>Time</span>
        <span className="hidden lg:block" />
      </div>

      <div className="space-y-0.5 px-2 sm:px-4 lg:px-6">
        {tracks.map((track, i) => {
          const isCurrent = currentTrack?.id === track.id;
          const artId =
            track.album_id && artworkByAlbumId ? artworkByAlbumId[track.album_id] ?? null : null;

          return (
            <div
              key={`${track.id}-${i}`}
              className={`track-row group/track ${isCurrent ? "track-row-active" : ""}`}
            >
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center font-mono text-xs tabular-nums text-muted transition-colors hover:border-2 hover:border-ink hover:bg-accent hover:text-ink"
                onClick={() => usePlayer.getState().playNow(tracks, i)}
                title="Play"
              >
                {isCurrent && playing ? (
                  <IconMusic size={16} className="text-ink" />
                ) : (
                  <>
                    <span className="group-hover/track:hidden">{String(i + 1).padStart(2, "0")}</span>
                    <span className="hidden text-ink group-hover/track:inline">
                      <IconPlay size={14} className="ml-0.5" />
                    </span>
                  </>
                )}
              </button>

              {showArtwork && (
                <div className="hidden lg:block">
                  <Artwork artworkId={artId} size={44} />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div
                  className={`truncate text-sm font-semibold ${isCurrent ? "text-ink underline decoration-2" : "text-ink"}`}
                >
                  {track.title}
                </div>
                <div className="truncate font-mono text-[11px] uppercase tracking-wide text-muted">
                  {track.artist}
                  {showAlbum ? ` · ${track.album}` : ""}
                </div>
              </div>

              <div className="hidden text-right text-xs tabular-nums text-muted sm:block">
                {track.year ?? "—"}
              </div>
              <div className="text-right text-xs tabular-nums text-muted">
                {fmtDuration(track.duration)}
              </div>

              <div className="flex items-center justify-end gap-0.5 lg:col-span-1">
                <button
                  type="button"
                  className={`btn-icon !h-9 !w-9 ${
                    track.is_favorite
                      ? "!border-ink !bg-signal !text-panel"
                      : "opacity-0 [.track-row:hover_&]:opacity-100 sm:opacity-100"
                  }`}
                  onClick={() => void toggleFavorite(track)}
                  title={track.is_favorite ? "Unfavorite" : "Favorite"}
                >
                  <IconHeart size={18} filled={track.is_favorite} />
                </button>

                <button
                  type="button"
                  className="btn-icon !hidden !h-9 !w-9 sm:!flex"
                  onClick={() => usePlayer.getState().enqueue([track])}
                  title="Add to queue"
                >
                  <IconPlus size={18} />
                </button>

                {onRemove && (
                  <button
                    type="button"
                    className="btn-icon !h-9 !w-9 hover:text-rose-400"
                    onClick={() => onRemove(track.id)}
                    title="Remove from playlist"
                  >
                    <IconClose size={18} />
                  </button>
                )}

                <div className="relative">
                  <button
                    type="button"
                    className="btn-icon !h-9 !w-9"
                    onClick={() => setMenuFor(menuFor === track.id ? null : track.id)}
                    title="Add to playlist"
                  >
                    <IconMore size={18} />
                  </button>
                  {menuFor === track.id && (
                    <div className="absolute right-0 top-10 z-40 w-52 border-2 border-ink bg-panel-2 p-1.5 shadow-[4px_4px_0_0_var(--color-ink)]">
                      {playlists === null && (
                        <div className="px-2 py-2 font-mono text-xs text-muted">Loading…</div>
                      )}
                      {playlists?.map((pl) => (
                        <button
                          key={pl.id}
                          type="button"
                          className="flex w-full items-center gap-2 truncate px-2 py-2 text-left text-xs hover:bg-accent"
                          onClick={async () => {
                            await api.addToPlaylist(pl.id, [track.id]);
                            setMenuFor(null);
                            onRemoved?.(track.id);
                          }}
                        >
                          {pl.kind !== "manual" && (
                            <IconSpark size={14} className="shrink-0 text-signal" />
                          )}
                          {pl.name}
                        </button>
                      ))}
                      {playlists?.length === 0 && (
                        <div className="px-2 py-2 font-mono text-xs text-muted">No playlists yet</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
