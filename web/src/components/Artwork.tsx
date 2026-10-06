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
        className={`flex items-center justify-center rounded-lg border border-border-subtle bg-gradient-to-br from-panel-2 to-panel text-accent-dim ${className}`}
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
      className={`rounded-lg border border-border-subtle bg-panel-2 object-cover shadow-sm ${className}`}
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
      <div className="overflow-hidden rounded-xl shadow-md transition-transform duration-300 group-hover:scale-[1.02]">
        <Artwork
          artworkId={album.artwork_id}
          size={176}
          className="!h-auto !w-full aspect-square !rounded-xl"
        />
      </div>
      <div className="min-w-0 px-0.5">
        <div className="truncate text-sm font-medium text-ink group-hover:text-accent-bright">
          {album.title}
        </div>
        <div className="truncate text-xs text-muted">
          {album.artist}
          {album.year ? ` · ${album.year}` : ""}
        </div>
      </div>
    </Link>
  );
}
