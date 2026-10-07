import { useEffect, useState } from "react";
import { api } from "../api";
import { TrackList } from "../components/TrackList";
import { IconPlay } from "../components/icons";
import { PageHeader, SegmentedControl } from "../components/ui";
import type { Track } from "../types";
import { usePlayer } from "../store/player";
import { listOfflineTracks } from "../lib/offline";

type Pane = "favorites" | "history" | "offline";

export function FavoritesPage() {
  const [pane, setPane] = useState<Pane>("favorites");
  const [favorites, setFavorites] = useState<Track[]>([]);
  const [history, setHistory] = useState<Track[]>([]);
  const [offline, setOffline] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([api.favorites(), api.history(), listOfflineTracks()])
      .then(([f, h, o]) => {
        setFavorites(f);
        setHistory(h);
        setOffline(o);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const rows = pane === "favorites" ? favorites : pane === "history" ? history : offline;

  return (
    <div>
      <PageHeader
        title="Collection"
        actions={
          rows.length > 0 ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => usePlayer.getState().playNow(rows, 0)}
            >
              <IconPlay size={16} />
              Play
            </button>
          ) : undefined
        }
      />

      <div className="px-5 sm:px-8">
        <SegmentedControl
          value={pane}
          onChange={setPane}
          options={[
            { id: "favorites", label: `Favorites (${favorites.length})` },
            { id: "history", label: `Recently played (${history.length})` },
            { id: "offline", label: `Offline (${offline.length})` },
          ]}
        />
      </div>

      {loading ? (
        <div className="px-8 py-12 text-sm text-muted">Loading…</div>
      ) : rows.length === 0 && pane === "offline" ? (
        <div className="px-8 py-12 text-sm text-muted">
          No offline downloads yet. Save tracks from the player or an album.
        </div>
      ) : (
        <TrackList
          tracks={rows}
          onRemoved={pane === "favorites" ? () => load() : undefined}
        />
      )}
    </div>
  );
}
