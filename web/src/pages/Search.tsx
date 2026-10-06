import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { AlbumCard } from "../components/Artwork";
import { TrackList } from "../components/TrackList";
import { IconSearch } from "../components/icons";
import { PageHeader, SectionLabel, SegmentedControl } from "../components/ui";
import type { SearchResults, Track } from "../types";

type Mode = "library" | "semantic";

export function SearchPage() {
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<Mode>("library");
  const [results, setResults] = useState<SearchResults | null>(null);
  const [semanticTracks, setSemanticTracks] = useState<Track[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [hint, setHint] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!q.trim()) {
      setResults(null);
      setSemanticTracks(null);
      setHint("");
      return;
    }
    timer.current = setTimeout(() => {
      setLoading(true);
      setHint("");
      if (mode === "library") {
        api
          .search(q.trim())
          .then((r) => {
            setResults(r);
            setSemanticTracks(null);
          })
          .catch(() => setResults(null))
          .finally(() => setLoading(false));
      } else {
        api
          .semanticSearch(q.trim())
          .then((rows) => {
            setSemanticTracks(rows.map((r) => r.track));
            setResults(null);
          })
          .catch((err) => {
            setSemanticTracks([]);
            setHint(err instanceof Error ? err.message : "Semantic search unavailable");
          })
          .finally(() => setLoading(false));
      }
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [q, mode]);

  const artworkByAlbumId = results
    ? Object.fromEntries(results.albums.map((a) => [a.id, a.artwork_id]))
    : undefined;

  return (
    <div>
      <PageHeader title="Search" subtitle="Library text · or semantic mood queries" />

      <div className="px-5 pb-4 sm:px-8">
        <SegmentedControl
          value={mode}
          onChange={setMode}
          options={[
            { id: "library", label: "Library" },
            { id: "semantic", label: "Semantic" },
          ]}
        />
        <div className="relative">
          <IconSearch
            size={18}
            className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            className="input pl-11"
            placeholder={
              mode === "semantic"
                ? "e.g. late night drive, rainy indie…"
                : "Start typing to search…"
            }
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
        </div>
        {mode === "semantic" && (
          <p className="mt-2 text-xs text-muted">
            Needs embeddings indexed in Settings. Uses your local embed model only.
          </p>
        )}
      </div>

      {loading && <div className="px-8 py-4 text-sm text-muted">Searching…</div>}
      {hint && <div className="px-8 py-2 text-sm text-accent-bright">{hint}</div>}

      {mode === "semantic" && semanticTracks && !loading && (
        <div className="pb-8">
          <SectionLabel>Semantic matches</SectionLabel>
          <TrackList tracks={semanticTracks} />
          {semanticTracks.length === 0 && !hint && (
            <div className="empty-state">No semantic matches for “{q}”.</div>
          )}
        </div>
      )}

      {mode === "library" && results && !loading && (
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
