import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { AlbumCard } from "../components/Artwork";
import { TrackList } from "../components/TrackList";
import { IconPlay, IconShuffle } from "../components/icons";
import { EmptyState, PageHeader, SegmentedControl } from "../components/ui";
import type { Album, Artist, Track } from "../types";
import { usePlayer } from "../store/player";

type Tab = "tracks" | "albums" | "artists";

export function LibraryPage() {
  const [tab, setTab] = useState<Tab>("tracks");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const artworkByAlbumId = useMemo(
    () => Object.fromEntries(albums.map((a) => [a.id, a.artwork_id])),
    [albums],
  );

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [t, a, ar] = await Promise.all([
        api.tracks({ limit: 500, order: "artist" }),
        api.albums(),
        api.artists(),
      ]);
      setTracks(t.items);
      setAlbums(a);
      setArtists(ar);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load library");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: "tracks", label: "Tracks" },
    { id: "albums", label: "Albums" },
    { id: "artists", label: "Artists" },
  ];

  return (
    <div>
      <PageHeader
        title="Library"
        subtitle={tracks.length ? `${tracks.length} tracks` : undefined}
        actions={
          tracks.length > 0 ? (
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => usePlayer.getState().playNow(tracks, 0)}
              >
                <IconPlay size={16} />
                Play all
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  usePlayer.getState().toggleShuffle();
                  if (tracks.length > 0) usePlayer.getState().playNow(tracks, 0);
                }}
              >
                <IconShuffle size={16} />
                Shuffle
              </button>
            </>
          ) : undefined
        }
      />

      <div className="px-5 sm:px-8">
        <SegmentedControl value={tab} onChange={setTab} options={tabs} />
      </div>

      {loading && <div className="px-8 py-12 text-sm text-muted">Loading your library…</div>}
      {error && (
        <div className="mx-8 rounded-xl border border-rose-900/40 bg-rose-950/30 px-4 py-3 text-sm text-rose-300">
          {error}
        </div>
      )}

      {!loading && !error && tab === "tracks" && (
        <TrackList tracks={tracks} artworkByAlbumId={artworkByAlbumId} />
      )}

      {!loading && !error && tab === "albums" && (
        <div className="flex flex-wrap gap-x-4 gap-y-6 px-5 pb-8 sm:px-8">
          {albums.map((album) => (
            <AlbumCard key={album.id} album={album} />
          ))}
          {albums.length === 0 && <EmptyLibrary />}
        </div>
      )}

      {!loading && !error && tab === "artists" && (
        <div className="grid grid-cols-1 gap-2 px-5 pb-8 sm:grid-cols-2 sm:px-8 lg:grid-cols-3">
          {artists.map((artist) => (
            <Link
              key={artist.id}
              to={`/artists/${artist.id}`}
              className="flex items-center justify-between rounded-2xl border border-transparent px-4 py-3 transition-colors hover:border-border-subtle hover:bg-panel/60"
            >
              <span className="truncate font-medium">{artist.name}</span>
              <span className="shrink-0 text-xs text-muted">
                {artist.album_count} albums · {artist.track_count} tracks
              </span>
            </Link>
          ))}
          {artists.length === 0 && <EmptyLibrary />}
        </div>
      )}
    </div>
  );
}

function EmptyLibrary() {
  return (
    <EmptyState>
      Your library is empty. Open{" "}
      <Link to="/settings" className="text-accent-bright underline underline-offset-2">
        Settings
      </Link>{" "}
      to add folders and run a scan.
    </EmptyState>
  );
}
