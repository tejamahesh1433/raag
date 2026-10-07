import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { api } from "../api"
import type { Track } from "../types"
import { Card, EmptyState, PageHeader, SectionLabel } from "../components/ui"

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return `${m} min`
  return `${h} hr ${m} min`
}

function fmtTrackDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

interface Stats {
  total_tracks: number
  total_duration_seconds: number
  top_artists: Array<{ artist: string; count: number }>
  top_genres: Array<{ genre: string; count: number }>
}

export function StatsPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [history, setHistory] = useState<Track[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  useEffect(() => {
    setLoading(true)
    Promise.all([api.listeningStats(), api.history()])
      .then(([s, h]) => {
        setStats(s)
        setHistory(h)
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load stats"))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted">Loading…</div>
    )
  }

  if (error) {
    return <EmptyState>{error}</EmptyState>
  }

  if (!stats || stats.total_tracks === 0) {
    return (
      <div className="p-6 lg:p-10">
        <PageHeader title="Stats" />
        <EmptyState>No listening history yet. Start playing some music!</EmptyState>
      </div>
    )
  }

  const topArtistMax = stats.top_artists[0]?.count ?? 1
  const topGenreMax = stats.top_genres[0]?.count ?? 1
  const recentTracks = history.slice(0, 20)

  return (
    <div className="p-6 lg:p-10">
      <PageHeader
        title="Stats"
        subtitle={fmtDuration(stats.total_duration_seconds) + " listened"}
      />

      {/* Summary cards */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 24 24" className="h-8 w-8 shrink-0 text-accent" fill="currentColor" stroke="none">
              <path d="M8 5v14l11-7z" />
            </svg>
            <div>
              <p className="text-2xl font-bold tabular-nums">{stats.total_tracks.toLocaleString()}</p>
              <p className="text-sm text-muted">Tracks played</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 24 24" className="h-8 w-8 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
            <div>
              <p className="text-2xl font-bold">{fmtDuration(stats.total_duration_seconds)}</p>
              <p className="text-sm text-muted">Listening time</p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 24 24" className="h-8 w-8 shrink-0 text-accent" fill="currentColor" stroke="none">
              <rect x="3" y="12" width="4" height="9" rx="1" />
              <rect x="10" y="7" width="4" height="14" rx="1" />
              <rect x="17" y="3" width="4" height="18" rx="1" />
            </svg>
            <div>
              <p className="text-2xl font-bold truncate">{stats.top_genres[0]?.genre ?? "—"}</p>
              <p className="text-sm text-muted">Top genre</p>
            </div>
          </div>
        </Card>
      </div>

      {/* Top Artists */}
      {stats.top_artists.length > 0 && (
        <div className="mt-10">
          <SectionLabel>Top Artists</SectionLabel>
          <div className="mt-3 space-y-2">
            {stats.top_artists.slice(0, 10).map((row, i) => {
              const pct = Math.round((row.count / topArtistMax) * 100)
              return (
                <div key={row.artist} className="relative flex items-center gap-3 rounded-lg px-3 py-2 overflow-hidden">
                  <div
                    className="absolute inset-0 rounded-lg"
                    style={{ width: `${pct}%`, backgroundColor: "color-mix(in srgb, var(--color-accent) 12%, transparent)" }}
                  />
                  <span className="relative w-6 shrink-0 font-mono text-xs tabular-nums text-muted text-right">{i + 1}</span>
                  <span className="relative min-w-0 flex-1 truncate text-sm font-medium">{row.artist}</span>
                  <span className="relative shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white">
                    {row.count}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Top Genres */}
      {stats.top_genres.length > 0 && (
        <div className="mt-10">
          <SectionLabel>Top Genres</SectionLabel>
          <div className="mt-3 space-y-2">
            {stats.top_genres.slice(0, 10).map((row, i) => {
              const pct = Math.round((row.count / topGenreMax) * 100)
              return (
                <div key={row.genre} className="relative flex items-center gap-3 rounded-lg px-3 py-2 overflow-hidden">
                  <div
                    className="absolute inset-0 rounded-lg"
                    style={{ width: `${pct}%`, backgroundColor: "color-mix(in srgb, var(--color-accent) 12%, transparent)" }}
                  />
                  <span className="relative w-6 shrink-0 font-mono text-xs tabular-nums text-muted text-right">{i + 1}</span>
                  <span className="relative min-w-0 flex-1 truncate text-sm font-medium">{row.genre}</span>
                  <span className="relative shrink-0 rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white">
                    {row.count}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recently Played */}
      {recentTracks.length > 0 && (
        <div className="mt-10 mb-4">
          <SectionLabel>Recently Played</SectionLabel>
          <div className="mt-3 space-y-1">
            {recentTracks.map((track) => (
              <div key={track.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-panel/60 transition-colors">
                <div className="h-9 w-9 shrink-0 rounded bg-surface-2 flex items-center justify-center text-muted">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor" stroke="none">
                    <path d="M12 3a9 9 0 1 0 0 18A9 9 0 0 0 12 3zm-1 13V8l6 4-6 4z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  {track.album_id ? (
                    <Link to={`/albums/${track.album_id}`} className="block truncate text-sm font-medium hover:text-accent transition-colors">
                      {track.title}
                    </Link>
                  ) : (
                    <span className="block truncate text-sm font-medium">{track.title}</span>
                  )}
                  <span className="block truncate text-xs text-muted">{track.artist}</span>
                </div>
                <span className="shrink-0 font-mono text-xs text-muted">{fmtTrackDuration(track.duration)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
