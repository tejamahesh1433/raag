import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { AlbumCard } from "../components/Artwork";
import { TrackList } from "../components/TrackList";
import { IconPlay, IconShuffle } from "../components/icons";
import { EmptyState, PageHeader, SegmentedControl } from "../components/ui";
import type { Album, Artist, Track } from "../types";
import { usePlayer } from "../store/player";

type Tab = "tracks" | "albums" | "artists" | "genres" | "years" | "folders" | "recent";

export function LibraryPage() {
  const [tab, setTab] = useState<Tab>("tracks");
  const [tracks, setTracks] = useState<Track[]>([]);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [genres, setGenres] = useState<{ genre: string; count: number }[]>([]);
  const [folders, setFolders] = useState<{ folder: string; count: number }[]>([]);
  const [genreFilter, setGenreFilter] = useState<string | null>(null);
  const [yearFilter, setYearFilter] = useState<number | null>(null);
  const [folderFilter, setFolderFilter] = useState<string | null>(null);
  const [folderTracks, setFolderTracks] = useState<Track[]>([]);
  const [recentAdded, setRecentAdded] = useState<Track[]>([]);
  const [recentPlayed, setRecentPlayed] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const artworkByAlbumId = useMemo(
    () => Object.fromEntries(albums.map((a) => [a.id, a.artwork_id])),
    [albums],
  );

  const years = useMemo(() => {
    const counts = new Map<number, number>();
    for (const a of albums) {
      if (a.year != null) counts.set(a.year, (counts.get(a.year) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[0] - a[0]);
  }, [albums]);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [t, a, ar, g, f] = await Promise.all([
        api.tracks({ limit: 500, order: "artist" }),
        api.albums(),
        api.artists(),
        api.genres(),
        api.folders(),
      ]);
      setTracks(t.items);
      setAlbums(a);
      setArtists(ar);
      setGenres(g);
      setFolders(f);
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

  useEffect(() => {
    if (tab !== "recent") return;
    void Promise.all([api.tracks({ limit: 80, order: "newest" }), api.history()])
      .then(([added, played]) => {
        setRecentAdded(added.items);
        setRecentPlayed(played);
      })
      .catch(() => {
        setRecentAdded([]);
        setRecentPlayed([]);
      });
  }, [tab]);

  useEffect(() => {
    if (!genreFilter) return;
    void api
      .tracks({ limit: 500, order: "artist", genre: genreFilter })
      .then((page) => setTracks(page.items))
      .catch(() => undefined);
  }, [genreFilter]);

  useEffect(() => {
    if (folderFilter == null) {
      setFolderTracks([]);
      return;
    }
    void api
      .tracks({ limit: 500, order: "album", folder: folderFilter })
      .then((page) => setFolderTracks(page.items))
      .catch(() => setFolderTracks([]));
  }, [folderFilter]);

  const tabs: { id: Tab; label: string }[] = [
    { id: "tracks", label: "Tracks" },
    { id: "albums", label: "Albums" },
    { id: "artists", label: "Artists" },
    { id: "genres", label: "Genres" },
    { id: "years", label: "Years" },
    { id: "folders", label: "Folders" },
    { id: "recent", label: "Recent" },
  ];

  const visibleAlbums =
    yearFilter == null ? albums : albums.filter((a) => a.year === yearFilter);

  const playable =
    tab === "recent"
      ? recentAdded
      : tab === "folders" && folderFilter != null
        ? folderTracks
        : tracks;

  const showPlayActions =
    playable.length > 0 &&
    (tab === "tracks" ||
      tab === "recent" ||
      (tab === "genres" && genreFilter != null) ||
      (tab === "folders" && folderFilter != null));

  return (
    <div>
      <PageHeader
        title="Library"
        subtitle={
          genreFilter
            ? `Genre · ${genreFilter}`
            : folderFilter != null
              ? `Folder · ${folderFilter === "." ? "(library root)" : folderFilter}`
              : yearFilter != null
                ? `Year · ${yearFilter}`
                : tracks.length
                  ? `${tracks.length} tracks`
                  : undefined
        }
        actions={
          showPlayActions ? (
            <>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => usePlayer.getState().playNow(playable, 0)}
              >
                <IconPlay size={16} />
                Play all
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  usePlayer.setState({ shuffle: true });
                  if (playable.length > 0) usePlayer.getState().playNow(playable, 0);
                }}
              >
                <IconShuffle size={16} />
                Shuffle
              </button>
            </>
          ) : undefined
        }
      />

      <div className="overflow-x-auto px-5 sm:px-8">
        <SegmentedControl
          value={tab}
          onChange={(next) => {
            const leavingGenres = tab === "genres" && next !== "genres";
            setTab(next);
            if (next !== "genres") setGenreFilter(null);
            if (next !== "years") setYearFilter(null);
            if (next !== "folders") setFolderFilter(null);
            if (leavingGenres) void load();
          }}
          options={tabs}
        />
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

      {!loading && !error && tab === "genres" && (
        <div className="space-y-4 px-5 pb-8 sm:px-8">
          {genreFilter ? (
            <button
              type="button"
              className="btn btn-ghost !text-xs"
              onClick={() => {
                setGenreFilter(null);
                void load();
              }}
            >
              ← All genres
            </button>
          ) : null}
          {!genreFilter && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {genres.map((g) => (
                <button
                  key={g.genre}
                  type="button"
                  className="flex items-center justify-between rounded-2xl border border-border-subtle bg-panel/40 px-4 py-3 text-left transition-colors hover:bg-panel/70"
                  onClick={() => setGenreFilter(g.genre)}
                >
                  <span className="truncate font-medium text-ink">{g.genre}</span>
                  <span className="text-xs text-muted">{g.count}</span>
                </button>
              ))}
              {genres.length === 0 && (
                <EmptyState>No genre tags found in your library yet.</EmptyState>
              )}
            </div>
          )}
          {genreFilter && <TrackList tracks={tracks} artworkByAlbumId={artworkByAlbumId} />}
        </div>
      )}

      {!loading && !error && tab === "years" && (
        <div className="space-y-4 px-5 pb-8 sm:px-8">
          {yearFilter != null ? (
            <button
              type="button"
              className="btn btn-ghost !text-xs"
              onClick={() => setYearFilter(null)}
            >
              ← All years
            </button>
          ) : null}
          {yearFilter == null ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {years.map(([year, count]) => (
                <button
                  key={year}
                  type="button"
                  className="rounded-2xl border border-border-subtle bg-panel/40 px-4 py-3 text-left transition-colors hover:bg-panel/70"
                  onClick={() => setYearFilter(year)}
                >
                  <div className="font-display text-xl text-ink">{year}</div>
                  <div className="text-xs text-muted">{count} albums</div>
                </button>
              ))}
              {years.length === 0 && <EmptyState>No year tags on albums yet.</EmptyState>}
            </div>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-6">
              {visibleAlbums.map((album) => (
                <AlbumCard key={album.id} album={album} />
              ))}
              {visibleAlbums.length === 0 && <EmptyLibrary />}
            </div>
          )}
        </div>
      )}

      {!loading && !error && tab === "folders" && (
        <div className="space-y-4 px-5 pb-8 sm:px-8">
          {folderFilter != null ? (
            <button
              type="button"
              className="btn btn-ghost !text-xs"
              onClick={() => setFolderFilter(null)}
            >
              ← All folders
            </button>
          ) : null}
          {folderFilter == null ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {folders.map((f) => (
                <button
                  key={f.folder}
                  type="button"
                  className="flex items-center justify-between gap-3 rounded-2xl border border-border-subtle bg-panel/40 px-4 py-3 text-left transition-colors hover:bg-panel/70"
                  onClick={() => setFolderFilter(f.folder)}
                >
                  <span className="truncate font-mono text-sm text-ink">
                    {f.folder === "." ? "(library root)" : f.folder}
                  </span>
                  <span className="shrink-0 text-xs text-muted">{f.count}</span>
                </button>
              ))}
              {folders.length === 0 && <EmptyState>No folders yet — run a library scan.</EmptyState>}
            </div>
          ) : (
            <TrackList tracks={folderTracks} artworkByAlbumId={artworkByAlbumId} />
          )}
        </div>
      )}

      {!loading && !error && tab === "recent" && (
        <div className="space-y-8 pb-8">
          <section>
            <h2 className="mb-2 px-5 text-xs font-semibold uppercase tracking-[0.16em] text-muted sm:px-8">
              Recently added
            </h2>
            {recentAdded.length === 0 ? (
              <p className="px-5 text-sm text-muted sm:px-8">Nothing scanned yet.</p>
            ) : (
              <TrackList tracks={recentAdded} artworkByAlbumId={artworkByAlbumId} />
            )}
          </section>
          <section>
            <h2 className="mb-2 px-5 text-xs font-semibold uppercase tracking-[0.16em] text-muted sm:px-8">
              Recently played
            </h2>
            {recentPlayed.length === 0 ? (
              <p className="px-5 text-sm text-muted sm:px-8">Play something to fill this list.</p>
            ) : (
              <TrackList tracks={recentPlayed} artworkByAlbumId={artworkByAlbumId} />
            )}
          </section>
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
