import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api";
import { AlbumCard } from "../components/Artwork";
import { TrackList } from "../components/TrackList";
import { IconPlay, IconPlus } from "../components/icons";
import { SectionLabel } from "../components/ui";
import type { Album, Artist, Track } from "../types";
import { usePlayer } from "../store/player";

export function ArtistPage() {
  const { id } = useParams();
  const artistId = Number(id);
  const [artist, setArtist] = useState<Artist | null>(null);
  const [albums, setAlbums] = useState<Album[]>([]);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrich, setEnrich] = useState<Record<string, unknown> | null>(null);

  const artworkByAlbumId = useMemo(
    () => Object.fromEntries(albums.map((a) => [a.id, a.artwork_id])),
    [albums],
  );

  useEffect(() => {
    if (!Number.isFinite(artistId)) return;
    setLoading(true);
    Promise.all([
      api.artist(artistId),
      api.albums(artistId),
      api.tracks({ limit: 500, order: "album" }),
    ])
      .then(([ar, als, page]) => {
        setArtist(ar);
        setAlbums(als);
        setTracks(page.items.filter((t) => t.artist_id === artistId));
      })
      .catch(() => setArtist(null))
      .finally(() => setLoading(false));
  }, [artistId]);

  if (loading) return <div className="px-8 py-12 text-sm text-muted">Loading…</div>;
  if (!artist) return <div className="px-8 py-12 text-sm text-muted">Artist not found.</div>;

  return (
    <div>
      <header className="page-header">
        <div>
          <p className="eyebrow">Artist</p>
          <h1 className="font-display text-3xl text-ink sm:text-4xl">{artist.name}</h1>
          <p className="mt-2 text-sm text-muted">
            {artist.album_count} albums · {artist.track_count} tracks
          </p>
          {enrich && (
            <p className="mt-2 max-w-xl text-xs leading-relaxed text-muted">
              {enrich.disambiguation ? `${enrich.disambiguation} · ` : ""}
              {enrich.type ? `${enrich.type}` : ""}
              {enrich.country ? ` · ${enrich.country}` : ""}
              {Array.isArray(enrich.tags) && enrich.tags.length
                ? ` · ${(enrich.tags as string[]).slice(0, 5).join(", ")}`
                : ""}
              <span className="text-muted/60"> · MusicBrainz</span>
            </p>
          )}
          <div className="mt-5 flex flex-wrap gap-2">
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
              onClick={() => usePlayer.getState().enqueue(tracks)}
            >
              <IconPlus size={16} />
              Queue
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                void api
                  .artistEnrichment(artistId)
                  .then(setEnrich)
                  .catch(() => setEnrich(null));
              }}
            >
              Fetch info
            </button>
          </div>
        </div>
      </header>

      {albums.length > 0 && (
        <section className="pb-6">
          <SectionLabel>Albums</SectionLabel>
          <div className="flex flex-wrap gap-4 px-5 sm:px-8">
            {albums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        </section>
      )}

      <SectionLabel>Tracks</SectionLabel>
      <TrackList tracks={tracks} artworkByAlbumId={artworkByAlbumId} />

      <div className="px-8 py-6 text-sm">
        <Link to="/library" className="text-accent-bright underline underline-offset-2">
          Back to library
        </Link>
      </div>
    </div>
  );
}
