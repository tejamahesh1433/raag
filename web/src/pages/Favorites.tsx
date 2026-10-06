import { useEffect, useState } from "react";
import { api } from "../api";
import { TrackList } from "../components/TrackList";
import { IconPlay } from "../components/icons";
import { PageHeader, SegmentedControl } from "../components/ui";
import type { Track } from "../types";
import { usePlayer } from "../store/player";

type Pane = "favorites" | "history";

export function FavoritesPage() {
  const [pane, setPane] = useState<Pane>("favorites");
  const [favorites, setFavorites] = useState<Track[]>([]);
  const [history, setHistory] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([api.favorites(), api.history()])
      .then(([f, h]) => {
        setFavorites(f);
        setHistory(h);
      })
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const rows = pane === "favorites" ? favorites : history;

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
          ]}
        />
      </div>

      {loading ? (
        <div className="px-8 py-12 text-sm text-muted">Loading…</div>
      ) : (
        <TrackList
          tracks={rows}
          onRemoved={pane === "favorites" ? () => load() : undefined}
        />
      )}
    </div>
  );
}
