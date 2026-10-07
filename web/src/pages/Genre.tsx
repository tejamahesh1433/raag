import { useEffect, useMemo, useState } from "react"
import { useParams } from "react-router-dom"
import { api } from "../api"
import { TrackList } from "../components/TrackList"
import { IconPlay, IconShuffle } from "../components/icons"
import { EmptyState, PageHeader } from "../components/ui"
import type { Album, Track } from "../types"
import { usePlayer } from "../store/player"

export function GenrePage() {
  const { name } = useParams<{ name: string }>()
  const decodedName = decodeURIComponent(name ?? "")

  const [tracks, setTracks] = useState<Track[]>([])
  const [albums, setAlbums] = useState<Album[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const { playNow, toggleShuffle, shuffle } = usePlayer()

  const artworkByAlbumId = useMemo(
    () => Object.fromEntries(albums.map((a) => [a.id, a.artwork_id])),
    [albums],
  )

  useEffect(() => {
    if (!decodedName) return
    setLoading(true)
    setError("")
    Promise.all([
      api.tracks({ genre: decodedName, limit: 500 }),
      api.albums(),
    ])
      .then(([t, a]) => {
        setTracks(t.items)
        setAlbums(a)
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load genre"))
      .finally(() => setLoading(false))
  }, [decodedName])

  function handlePlayAll() {
    if (tracks.length > 0) playNow(tracks, 0)
  }

  function handleShuffle() {
    if (tracks.length === 0) return
    if (!shuffle) toggleShuffle()
    playNow(tracks, 0)
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted">Loading…</div>
    )
  }

  if (error) {
    return <EmptyState>{error}</EmptyState>
  }

  return (
    <div className="p-6 lg:p-10">
      <PageHeader
        eyebrow="Genre"
        title={decodedName}
        subtitle={loading ? "" : `${tracks.length} tracks`}
        actions={
          tracks.length > 0 ? (
            <>
              <button type="button" onClick={handlePlayAll} className="btn btn-primary flex items-center gap-2">
                <IconPlay size={16} />
                Play All
              </button>
              <button type="button" onClick={handleShuffle} className="btn btn-ghost flex items-center gap-2">
                <IconShuffle size={16} />
                Shuffle
              </button>
            </>
          ) : undefined
        }
      />

      {tracks.length === 0 ? (
        <EmptyState>No tracks in this genre</EmptyState>
      ) : (
        <TrackList tracks={tracks} artworkByAlbumId={artworkByAlbumId} />
      )}
    </div>
  )
}
