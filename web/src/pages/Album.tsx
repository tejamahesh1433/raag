import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api";
import { Artwork } from "../components/Artwork";
import { TrackList } from "../components/TrackList";
import { IconPlay, IconPlus } from "../components/icons";
import type { Album, Track } from "../types";
import { usePlayer } from "../store/player";

export function AlbumPage() {
  const { id } = useParams();
  const albumId = Number(id);
  const [album, setAlbum] = useState<Album | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrich, setEnrich] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!Number.isFinite(albumId)) return;
    setLoading(true);
    Promise.all([api.albums().then((a) => a.find((x) => x.id === albumId) ?? null), api.albumTracks(albumId)])
      .then(([al, ts]) => {
        setAlbum(al);
        setTracks(ts);
      })
      .finally(() => setLoading(false));
  }, [albumId]);

  if (loading) return <div className="px-8 py-12 text-sm text-muted">Loading…</div>;
  if (!album) return <div className="px-8 py-12 text-sm text-muted">Album not found.</div>;

  const totalMinutes = Math.round(tracks.reduce((sum, t) => sum + t.duration, 0) / 60);
  const artworkMap = { [album.id]: album.artwork_id };

  return (
    <div>
      <header className="page-header !items-center">
        <Artwork
          artworkId={album.artwork_id}
          size={200}
          className="!h-36 !w-36 shrink-0 shadow-xl sm:!h-44 sm:!w-44"
        />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Album</p>
          <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">{album.title}</h1>
          <p className="mt-2 text-sm text-muted">
            {album.artist}
            {album.year ? ` · ${album.year}` : ""} · {album.track_count} tracks · {totalMinutes} min
          </p>
          {enrich && (
            <p className="mt-2 max-w-xl text-xs leading-relaxed text-muted">
              {enrich.disambiguation ? `${enrich.disambiguation} · ` : ""}
              {enrich.type ? String(enrich.type) : ""}
              {enrich.country ? ` · ${String(enrich.country)}` : ""}
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
              Play
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
                  .albumEnrichment(albumId)
                  .then(setEnrich)
                  .catch(() => setEnrich(null));
              }}
            >
              Fetch info
            </button>
          </div>
        </div>
      </header>

      <TrackList tracks={tracks} showAlbum={false} artworkByAlbumId={artworkMap} />
    </div>
  );
}
