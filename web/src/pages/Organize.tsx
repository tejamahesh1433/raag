import { useEffect, useState } from "react";
import { api } from "../api";
import { Card, PageHeader, SegmentedControl } from "../components/ui";
import type { Job } from "../types";

type Tab = "duplicates" | "enrich";

export function OrganizePage() {
  const [tab, setTab] = useState<Tab>("duplicates");
  const [dupes, setDupes] = useState<Awaited<ReturnType<typeof api.duplicates>>["groups"]>([]);
  const [job, setJob] = useState<Job | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadDupes = async () => {
    setDupes((await api.duplicates()).groups);
  };

  useEffect(() => {
    void loadDupes().catch((e) => setError(String(e.message || e)));
  }, []);

  const poll = async (jobId: number) => {
    for (let i = 0; i < 600; i++) {
      const j = await api.job(jobId);
      setJob(j);
      if (j.status === "done" || j.status === "error") return j;
      await new Promise((r) => setTimeout(r, 400));
    }
    return null;
  };

  const flash = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 4000);
  };

  const runEnrich = async () => {
    setBusy(true);
    setError("");
    try {
      const { job_id } = await api.startEnrich();
      const j = await poll(job_id);
      flash(j?.message || "Enrichment finished");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enrich failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-5 pb-10 sm:px-8">
      <PageHeader
        title="Organize"
        subtitle="Duplicates · enrichment — your files stay untouched"
        eyebrow="Library care"
      />

      <Card>
        <p className="text-sm leading-relaxed text-muted">
          Raag plays songs exactly as they are on disk. Audio tags are never rewritten.
        </p>
      </Card>

      <SegmentedControl
        value={tab}
        onChange={setTab}
        options={[
          { id: "duplicates", label: "Duplicates" },
          { id: "enrich", label: "Enrich" },
        ]}
      />

      {message && (
        <div className="rounded-lg bg-emerald-950 px-3 py-2 text-sm text-emerald-300">{message}</div>
      )}
      {error && (
        <div className="rounded-lg bg-rose-950 px-3 py-2 text-sm text-rose-300">{error}</div>
      )}
      {job && (
        <div className="text-xs text-muted">
          Job #{job.id}: {job.status} — {job.message}
          {job.total > 0 ? ` (${job.progress}/${job.total})` : ""}
        </div>
      )}

      {tab === "duplicates" && (
        <Card>
          <p className="mb-4 text-xs text-muted">
            Same content fingerprint or metadata — review paths and keep one copy on disk.
            Raag never deletes files for you.
          </p>
          {dupes.length === 0 && <p className="text-sm text-muted">No duplicate groups found.</p>}
          <div className="space-y-4">
            {dupes.map((g) => (
              <div key={g.fingerprint} className="rounded-xl border border-border-subtle p-3">
                <div className="mb-2 text-xs font-semibold text-accent-bright">
                  {g.count} copies
                </div>
                {g.tracks.map((t) => (
                  <div key={t.id} className="mb-2 text-sm">
                    <div className="font-medium text-ink">
                      {t.title} · {t.artist}
                    </div>
                    <div className="truncate font-mono text-[11px] text-muted">{t.path}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === "enrich" && (
        <Card>
          <p className="mb-4 text-xs text-muted">
            Fetches free MusicBrainz metadata for artists/albums into Raag&apos;s local cache
            only — never writes into your audio files. Requires{" "}
            <strong className="text-ink">online enrichment</strong> enabled in Settings.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void runEnrich()}
          >
            Run enrichment batch
          </button>
        </Card>
      )}
    </div>
  );
}
