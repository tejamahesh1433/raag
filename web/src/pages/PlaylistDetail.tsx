import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { TrackList } from "../components/TrackList";
import { IconPlay, IconPlus, IconSpark } from "../components/icons";
import { PageHeader } from "../components/ui";
import type { Playlist, Track } from "../types";
import { usePlayer } from "../store/player";

export function PlaylistDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const playlistId = Number(id);
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!Number.isFinite(playlistId)) return;
    setLoading(true);
    Promise.all([api.playlist(playlistId), api.playlistTracks(playlistId)])
      .then(([pl, ts]) => {
        setPlaylist(pl);
        setTracks(ts);
      })
      .catch(() => setPlaylist(null))
      .finally(() => setLoading(false));
  };

  useEffect(load, [playlistId]);

  if (loading) return <div className="px-4 py-8 text-sm text-muted">Loading…</div>;
  if (!playlist) return <div className="px-4 py-8 text-sm text-muted">Playlist not found.</div>;

  const manual = playlist.kind === "manual";

  const reorder = async (from: number, to: number) => {
    const reordered = [...tracks];
    const [row] = reordered.splice(from, 1);
    reordered.splice(to, 0, row);
    setTracks(reordered);
    await api.reorderPlaylist(playlist.id, reordered.map((t) => t.id));
  };

  const remove = async (trackId: number) => {
    await api.removeFromPlaylist(playlist.id, trackId);
    setTracks((ts) => ts.filter((t) => t.id !== trackId));
  };

  const destroy = async () => {
    if (!confirm(`Delete playlist “${playlist.name}”?`)) return;
    await api.deletePlaylist(playlist.id);
    navigate("/playlists");
  };

  return (
    <div>
      <PageHeader
        eyebrow={playlist.kind === "smart" ? "Smart playlist" : "Playlist"}
        title={playlist.name}
        subtitle={`${tracks.length} tracks`}
        actions={
          <>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => usePlayer.getState().playNow(tracks, 0)}
              disabled={tracks.length === 0}
            >
              <IconPlay size={16} />
              Play
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => usePlayer.getState().enqueue(tracks)}
              disabled={tracks.length === 0}
            >
              <IconPlus size={16} />
              Queue
            </button>
            <a className="btn btn-ghost" href={`/api/playlists/${playlist.id}/export`}>
              M3U
            </a>
            <button type="button" className="btn btn-ghost text-rose-400" onClick={destroy}>
              Delete
            </button>
          </>
        }
      />
      {!manual && (
        <p className="mx-8 -mt-2 mb-4 flex items-center gap-2 text-xs text-muted">
          <IconSpark size={14} className="text-accent" />
          Smart playlists update automatically from their rules.
        </p>
      )}

      <TrackList
        tracks={tracks}
        showAlbum={false}
        onRemove={manual ? remove : undefined}
        onRemoved={() => load()}
        onReorder={manual ? (from, to) => void reorder(from, to) : undefined}
      />

      <div className="px-4 py-4 text-xs text-muted">
        <Link to="/playlists" className="underline">
          All playlists
        </Link>
      </div>
    </div>
  );
}
