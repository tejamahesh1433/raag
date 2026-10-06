import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { AlbumCard } from "../components/Artwork";
import { TrackList } from "../components/TrackList";
import { IconSearch } from "../components/icons";
import { PageHeader, SectionLabel } from "../components/ui";
import type { SearchResults } from "../types";

export function SearchPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) {
      setResults(null);
      return;
    }
    timer.current = setTimeout(() => {
      setLoading(true);
      api
        .search(q.trim())
        .then(setResults)
        .catch(() => setResults(null))
        .finally(() => setLoading(false));
    }, 200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q]);

  const artworkByAlbumId = results
    ? Object.fromEntries(results.albums.map((a) => [a.id, a.artwork_id]))
    : undefined;

  return (
    <div>
      <PageHeader title="Search" subtitle="Tracks, artists, albums, genres" />

      <div className="px-5 pb-6 sm:px-8">
        <div className="relative">
          <IconSearch
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            className="input pl-11"
            placeholder="Start typing to search…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>
      </div>

      {loading && <div className="px-8 py-4 text-sm text-muted">Searching…</div>}

      {results && !loading && (
        <div className="space-y-8 pb-8">
          {results.artists.length > 0 && (
            <section>
              <SectionLabel>Artists</SectionLabel>
              <div className="flex flex-wrap gap-2 px-5 sm:px-8">
                {results.artists.map((a) => (
                  <Link
                    key={a.id}
                    to={`/artists/${a.id}`}
                    className="rounded-full border border-border-subtle bg-panel/60 px-4 py-2 text-sm transition-colors hover:border-accent-dim hover:bg-panel-2"
                  >
                    {a.name}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {results.albums.length > 0 && (
            <section>
              <SectionLabel>Albums</SectionLabel>
              <div className="flex flex-wrap gap-4 px-5 sm:px-8">
                {results.albums.map((a) => (
                  <AlbumCard key={a.id} album={a} />
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionLabel>Tracks</SectionLabel>
            <TrackList tracks={results.tracks} artworkByAlbumId={artworkByAlbumId} />
          </section>

          {results.tracks.length === 0 &&
            results.artists.length === 0 &&
            results.albums.length === 0 && (
              <div className="empty-state">
                Nothing matched “{q}”. Try another spelling or a shorter query.
              </div>
            )}
        </div>
      )}
    </div>
  );
}
