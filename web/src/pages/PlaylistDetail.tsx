import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { TrackList } from "../components/TrackList";
import { SmartPlaylistBuilder, EMPTY_RULE_TREE } from "../components/SmartPlaylistBuilder";
import { IconPlay, IconPlus, IconSpark } from "../components/icons";
import { Card, PageHeader } from "../components/ui";
import type { Playlist, Rule, RuleTree, Track } from "../types";
import { usePlayer } from "../store/player";

const OP_LABELS: Record<string, string> = {
  contains: "contains",
  equals: "is",
  not_contains: "doesn't contain",
  gt: ">",
  lt: "<",
  gte: "≥",
  lte: "≤",
};

function formatRule(rule: Rule): string {
  const fieldLabel: Record<string, string> = {
    genre: "genre",
    artist: "artist",
    album: "album",
    title: "title",
    year: "year",
    play_count: "play count",
    is_favorite: "favorite",
  };
  const field = fieldLabel[rule.field] ?? rule.field;
  const op = OP_LABELS[rule.op] ?? rule.op;
  const val =
    rule.field === "is_favorite"
      ? rule.value === "true" || rule.value === 1
        ? "yes"
        : "no"
      : String(rule.value);
  return `${field} ${op} ${val}`;
}

export function PlaylistDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const playlistId = Number(id);
  const [playlist, setPlaylist] = useState<Playlist | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRules, setEditingRules] = useState(false);
  const [editTree, setEditTree] = useState<RuleTree>(EMPTY_RULE_TREE);
  const [savingRules, setSavingRules] = useState(false);

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
    if (!confirm(`Delete playlist "${playlist.name}"?`)) return;
    await api.deletePlaylist(playlist.id);
    navigate("/playlists");
  };

  const startEditRules = () => {
    setEditTree(playlist.rules ?? EMPTY_RULE_TREE);
    setEditingRules(true);
  };

  const saveRules = async () => {
    setSavingRules(true);
    try {
      await api.updatePlaylist(playlist.id, { rules: editTree });
      setEditingRules(false);
      load();
    } finally {
      setSavingRules(false);
    }
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
            <button type="button" className="btn btn-ghost text-danger" onClick={destroy}>
              Delete
            </button>
          </>
        }
      />

      {!manual && (
        <div className="mx-5 mb-4 space-y-3 sm:mx-8">
          <p className="-mt-2 flex items-center gap-2 text-xs text-muted">
            <IconSpark size={14} className="text-accent" />
            Smart playlists update automatically from their rules.
          </p>

          <Card>
            {editingRules ? (
              <div className="space-y-4">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Edit rules
                </div>
                <SmartPlaylistBuilder value={editTree} onChange={setEditTree} />
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => void saveRules()}
                    disabled={savingRules}
                  >
                    Save rules
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setEditingRules(false)}
                    disabled={savingRules}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
                    Rules
                  </div>
                  {playlist.rules ? (
                    <p className="text-sm text-ink">
                      <span className="font-medium">
                        Match {playlist.rules.match === "all" ? "ALL" : "ANY"}:
                      </span>{" "}
                      {playlist.rules.rules.map(formatRule).join(" · ")}
                    </p>
                  ) : (
                    <p className="text-sm text-muted">No rules defined.</p>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-secondary shrink-0"
                  onClick={startEditRules}
                >
                  Edit rules
                </button>
              </div>
            )}
          </Card>
        </div>
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
