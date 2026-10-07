import { useRef, useState } from "react"
import { api } from "../api"
import { IconClose } from "../components/icons"
import { EmptyState, PageHeader } from "../components/ui"
import { usePlayer } from "../store/player"

function fmt(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00"
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

export function QueuePage() {
  const queue = usePlayer((s) => s.queue)
  const index = usePlayer((s) => s.index)
  const dragIdx = useRef(-1)
  const [dragOver, setDragOver] = useState(-1)

  if (queue.length === 0) {
    return (
      <div>
        <PageHeader title="Up Next" />
        <EmptyState>Queue is empty</EmptyState>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Up Next"
        subtitle={`${queue.length} tracks`}
        actions={
          <button
            type="button"
            className="btn btn-ghost text-danger"
            onClick={() => usePlayer.getState().clear()}
          >
            Clear
          </button>
        }
      />
      <div className="px-4 pb-8 sm:px-8">
        {queue.map((track, i) => {
          const isCurrent = i === index
          return (
            <div
              key={`${track.id}-${i}`}
              draggable
              className={[
                "flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors",
                isCurrent ? "bg-accent/10" : "hover:bg-panel",
                dragOver === i ? "ring-1 ring-inset ring-accent/40" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={() => {
                if (!isCurrent) usePlayer.getState().jumpTo(i)
              }}
              onDragStart={() => {
                dragIdx.current = i
              }}
              onDragOver={(e) => {
                e.preventDefault()
                if (dragIdx.current !== i) setDragOver(i)
              }}
              onDragLeave={() => setDragOver(-1)}
              onDrop={() => {
                const from = dragIdx.current
                if (from !== -1 && from !== i) {
                  usePlayer.getState().reorderQueue(from, i)
                }
                dragIdx.current = -1
                setDragOver(-1)
              }}
              onDragEnd={() => {
                dragIdx.current = -1
                setDragOver(-1)
              }}
            >
              <span className="w-6 shrink-0 select-none text-center text-xs tabular-nums text-muted">
                {i + 1}
              </span>
              {track.album_id ? (
                <img
                  src={api.artworkUrl(track.album_id)}
                  alt=""
                  className="h-10 w-10 shrink-0 rounded-lg object-cover"
                  onError={(e) => {
                    ;(e.currentTarget as HTMLImageElement).style.visibility = "hidden"
                  }}
                />
              ) : (
                <div className="h-10 w-10 shrink-0 rounded-lg bg-border-subtle" />
              )}
              <div className="min-w-0 flex-1">
                <div
                  className={`truncate text-sm ${
                    isCurrent ? "font-semibold text-accent" : "text-ink"
                  }`}
                >
                  {track.title}
                </div>
                <div className="truncate text-xs text-muted">{track.artist}</div>
              </div>
              <div className="shrink-0 text-xs tabular-nums text-muted">
                {fmt(track.duration)}
              </div>
              <button
                type="button"
                className="btn-icon !h-7 !w-7 shrink-0 hover:text-danger"
                title="Remove from queue"
                onClick={(e) => {
                  e.stopPropagation()
                  usePlayer.getState().removeFromQueue(i)
                }}
              >
                <IconClose size={14} />
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
