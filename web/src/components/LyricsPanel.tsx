import { useEffect, useRef } from "react";

type SyncedLine = { t: number; text: string };

export function LyricsPanel({
  plain,
  synced,
  source,
  progress,
  error,
  onFetch,
}: {
  plain?: string;
  synced?: SyncedLine[];
  source?: string;
  progress: number;
  error?: string;
  onFetch: () => void;
}) {
  const activeRef = useRef<HTMLParagraphElement | null>(null);
  const lines = synced ?? [];
  const activeIdx = (() => {
    if (!lines.length) return -1;
    let idx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].t <= progress + 0.05) idx = i;
      else break;
    }
    return idx;
  })();

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeIdx]);

  if (lines.length > 0) {
    return (
      <div className="space-y-1">
        {lines.map((line, i) => {
          const active = i === activeIdx;
          return (
            <p
              key={`${line.t}-${i}`}
              ref={active ? activeRef : undefined}
              className={
                active
                  ? "rounded-lg bg-white/10 px-2 py-1.5 text-sm font-semibold text-ink"
                  : "px-2 py-1 text-sm text-muted"
              }
            >
              {line.text || "\u00a0"}
            </p>
          );
        })}
        {source && (
          <p className="mt-3 px-2 text-[10px] uppercase tracking-wider text-muted">
            Source · {source}
          </p>
        )}
      </div>
    );
  }

  if (plain) {
    return (
      <div>
        <pre className="whitespace-pre-wrap font-sans text-sm text-ink/90">{plain}</pre>
        {source && (
          <p className="mt-3 text-[10px] uppercase tracking-wider text-muted">
            Source · {source}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2 text-muted">
      <p>{error || "Looking for lyrics…"}</p>
      <button type="button" className="btn btn-secondary !text-xs" onClick={onFetch}>
        Fetch lyrics
      </button>
    </div>
  );
}
