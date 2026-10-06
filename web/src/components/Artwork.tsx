import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { Album } from "../types";
import { IconMusic } from "./icons";

export function Artwork({
  artworkId,
  size = 40,
  className = "",
}: {
  artworkId: number | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [artworkId]);

  if (!artworkId || failed) {
    return (
      <div
        className={`flex items-center justify-center border-2 border-ink bg-accent text-ink ${className}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <IconMusic size={Math.max(16, size * 0.38)} />
      </div>
    );
  }
  return (
    <img
      src={api.artworkUrl(artworkId)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`border-2 border-ink bg-panel-2 object-cover ${className}`}
      style={{ width: size, height: size }}
    />
  );
}

export function AlbumCard({ album }: { album: Album }) {
  return (
    <Link
      to={`/albums/${album.id}`}
      className="group flex w-[9.5rem] shrink-0 flex-col gap-3 sm:w-44"
    >
      <div className="overflow-hidden border-2 border-ink shadow-[4px_4px_0_0_var(--color-ink)] transition-transform duration-150 group-hover:-translate-x-0.5 group-hover:-translate-y-0.5 group-hover:shadow-[6px_6px_0_0_var(--color-ink)]">
        <Artwork
          artworkId={album.artwork_id}
          size={176}
          className="!h-auto !w-full aspect-square !rounded-none !border-0"
        />
      </div>
      <div className="min-w-0 px-0.5">
        <div className="truncate text-sm font-semibold text-ink group-hover:underline">
          {album.title}
        </div>
        <div className="truncate font-mono text-[11px] uppercase tracking-wide text-muted">
          {album.artist}
          {album.year ? ` · ${album.year}` : ""}
        </div>
      </div>
    </Link>
  );
}
