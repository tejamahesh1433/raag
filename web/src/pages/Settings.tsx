import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Card, PageHeader } from "../components/ui";
import type { Job, Settings } from "../types";
import { useAuth } from "../store/auth";

export function SettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [rootsText, setRootsText] = useState("");
  const [aiProvider, setAiProvider] = useState("ollama");
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [aiChatModel, setAiChatModel] = useState("qwen2.5:7b-instruct");
  const [aiEmbedModel, setAiEmbedModel] = useState("nomic-embed-text");
  const [onlineEnrichment, setOnlineEnrichment] = useState(true);
  const [scanInterval, setScanInterval] = useState(0);
  const [transcodeEnabled, setTranscodeEnabled] = useState(false);
  const [scanJob, setScanJob] = useState<Job | null>(null);
  const [embedJob, setEmbedJob] = useState<Job | null>(null);
  const [embedStatus, setEmbedStatus] = useState<{
    indexed: number;
    total: number;
    model: string;
    ready: boolean;
  } | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof api.healthDetail>> | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const s = await api.settings();
      setSettings(s);
      setRootsText(s.library_roots.join("\n"));
      setAiProvider(s.ai.provider ?? "ollama");
      setAiBaseUrl(s.ai.base_url ?? "");
      setAiChatModel(s.ai.chat_model ?? "qwen2.5:7b-instruct");
      setAiEmbedModel(s.ai.embed_model ?? "nomic-embed-text");
      setOnlineEnrichment(s.ai.online_enrichment ?? true);
      setScanInterval(s.scan_interval_hours ?? 0);
      setTranscodeEnabled(Boolean(s.transcode_enabled));
      setDetail(await api.healthDetail());
      try {
        setEmbedStatus(await api.discoveryStatus());
      } catch {
        setEmbedStatus(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const flash = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(""), 4000);
  };

  const saveRoots = async () => {
    const roots = rootsText.split("\n").map((r) => r.trim()).filter(Boolean);
    const s = await api.saveSettings({ library_roots: roots });
    setSettings(s);
    flash("Library folders saved");
  };

  const saveAi = async () => {
    const s = await api.saveSettings({
      ai: {
        provider: aiProvider,
        base_url: aiBaseUrl,
        chat_model: aiChatModel,
        embed_model: aiEmbedModel,
        online_enrichment: onlineEnrichment,
      },
    });
    setSettings(s);
    flash("AI settings saved");
    try {
      setDetail(await api.healthDetail());
    } catch {
      /* health detail is best-effort */
    }
  };

  const pollJob = async (jobId: number, setJob: (j: Job) => void) => {
    for (let i = 0; i < 600; i++) {
      const job = await api.job(jobId);
      setJob(job);
      if (job.status === "done" || job.status === "error") return job;
      await new Promise((r) => setTimeout(r, 400));
    }
    return null;
  };

  const runScan = async () => {
    setError("");
    try {
      const { job_id } = await api.scan();
      flash(`Scan started (job #${job_id})`);
      const job = await pollJob(job_id, setScanJob);
      if (job) flash(job.message || `Scan ${job.status}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    }
  };

  const runEmbed = async () => {
    setError("");
    try {
      const { job_id } = await api.startEmbed();
      flash(`Embedding started (job #${job_id})`);
      const job = await pollJob(job_id, setEmbedJob);
      if (job) flash(job.message || `Embed ${job.status}`);
      setEmbedStatus(await api.discoveryStatus());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Embed failed");
    }
  };

  const restoreRef = useRef<HTMLInputElement>(null);

  const doBackup = async () => {
    try {
      const { message: msg } = await api.backup();
      flash(msg);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backup failed");
    }
  };

  const doRestore = async (file: File) => {
    if (!window.confirm("Restore will replace ALL current data. Are you sure?")) return;
    try {
      const { message: msg } = await api.restore(file);
      flash(msg);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Restore failed");
    }
  };

  if (!settings) {
    return <div className="px-4 py-8 text-sm text-muted">{error || "Loading…"}</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-5 pb-10 sm:px-8">
      <PageHeader
        title="Settings"
        subtitle={user?.username ? `Signed in as ${user.username}` : "Open access · files stay original"}
      />

      {message && (
        <div className="rounded-lg bg-emerald-950 px-3 py-2 text-sm text-emerald-300">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-lg bg-rose-950 px-3 py-2 text-sm text-rose-300">{error}</div>
      )}

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-ink">Library folders</h2>
        <p className="mb-3 text-xs text-muted">
          One absolute path per line. Prefer a single folder (e.g.{" "}
          <span className="font-mono">D:\Music\Downloads</span>). Avoid the parent{" "}
          <span className="font-mono">D:\Music</span> if it also contains copies in{" "}
          <span className="font-mono">All Songs</span> / <span className="font-mono">freyr</span> —
          duplicates are skipped, but one root is cleaner.
        </p>
        <textarea
          className="input mb-3 h-28 font-mono text-xs"
          value={rootsText}
          onChange={(e) => setRootsText(e.target.value)}
          placeholder={"D:\\Music\\Downloads"}
        />
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => void saveRoots()}>
            Save folders
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void runScan()}>
            Scan now
          </button>
          {user?.is_admin && (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => void doBackup()}>
                Backup DB
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => restoreRef.current?.click()}>
                Restore DB
              </button>
              <input
                ref={restoreRef}
                type="file"
                accept=".db"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void doRestore(f);
                  e.target.value = "";
                }}
              />
            </>
          )}
        </div>
        {scanJob && (
          <div className="mt-3 text-xs text-muted">
            Scan #{scanJob.id}: {scanJob.status} — {scanJob.message}
            {scanJob.total > 0 ? ` (${scanJob.progress}/${scanJob.total})` : ""}
          </div>
        )}
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-ink">Scheduled rescan</h2>
        <p className="mb-3 text-xs text-muted">
          Automatically re-index library folders on an interval. Off by default.
        </p>
        <label className="text-xs text-muted">
          Interval
          <select
            className="input mt-1"
            value={scanInterval}
            onChange={(e) => setScanInterval(Number(e.target.value))}
          >
            <option value={0}>Off</option>
            <option value={1}>Every hour</option>
            <option value={6}>Every 6 hours</option>
            <option value={12}>Every 12 hours</option>
            <option value={24}>Every day</option>
          </select>
        </label>
        <button
          type="button"
          className="btn btn-primary mt-3"
          onClick={() =>
            void api
              .saveSettings({ scan_interval_hours: scanInterval })
              .then((s) => {
                setSettings(s);
                flash(
                  scanInterval
                    ? `Scheduled rescan every ${scanInterval}h`
                    : "Scheduled rescan off",
                );
              })
              .catch((err) => setError(err instanceof Error ? err.message : "Save failed"))
          }
        >
          Save schedule
        </button>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-ink">Playback / transcoding</h2>
        <p className="mb-3 text-xs text-muted">
          Exotic formats (WMA, AIFF, WavPack, …) can be streamed via ffmpeg → MP3 when enabled.
          Requires <code className="text-ink">ffmpeg</code> on PATH. Native formats are unchanged.
          Seeking is limited on transcoded streams.
        </p>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={transcodeEnabled}
            onChange={(e) => setTranscodeEnabled(e.target.checked)}
          />
          Enable ffmpeg transcoding for non-browser formats
        </label>
        {detail && (
          <p className="mt-2 text-xs text-muted">
            ffmpeg:{" "}
            {detail.ffmpeg_available
              ? "found on PATH"
              : "not found — install ffmpeg to use this"}
          </p>
        )}
        <button
          type="button"
          className="btn btn-primary mt-3"
          onClick={() =>
            void api
              .saveSettings({ transcode_enabled: transcodeEnabled })
              .then((s) => {
                setSettings(s);
                flash(transcodeEnabled ? "Transcoding enabled" : "Transcoding disabled");
              })
              .catch((err) => setError(err instanceof Error ? err.message : "Save failed"))
          }
        >
          Save playback settings
        </button>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-ink">Local AI (free, private)</h2>
        <p className="mb-3 text-xs text-muted">
          Points the app at your local Ollama or LM Studio server. Nothing ever leaves
          your machines.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted">
            Provider
            <select
              className="input mt-1"
              value={aiProvider}
              onChange={(e) => setAiProvider(e.target.value)}
            >
              <option value="ollama">Ollama (default :11434)</option>
              <option value="lm-studio">LM-studio (default :1234)</option>
              <option value="custom">Custom OpenAI-compatible</option>
            </select>
          </label>
          <label className="text-xs text-muted">
            Base URL (leave blank for default)
            <input
              className="input mt-1 font-mono text-xs"
              value={aiBaseUrl}
              onChange={(e) => setAiBaseUrl(e.target.value)}
              placeholder="http://192.168.1.10:11434/v1"
            />
          </label>
          <label className="text-xs text-muted">
            Chat model
            <input
              className="input mt-1 font-mono text-xs"
              value={aiChatModel}
              onChange={(e) => setAiChatModel(e.target.value)}
            />
          </label>
          <label className="text-xs text-muted">
            Embeddings model
            <input
              className="input mt-1 font-mono text-xs"
              value={aiEmbedModel}
              onChange={(e) => setAiEmbedModel(e.target.value)}
            />
          </label>
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={onlineEnrichment}
            onChange={(e) => setOnlineEnrichment(e.target.checked)}
          />
          Allow online enrichment (LRCLIB lyrics) — off = air-gapped, local sidecars only
        </label>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => void saveAi()}>
            Save AI settings
          </button>
          {user?.is_admin && (
            <button type="button" className="btn btn-secondary" onClick={() => void runEmbed()}>
              Index embeddings
            </button>
          )}
        </div>
        {embedStatus && (
          <div className="mt-2 text-xs text-muted">
            Embeddings: {embedStatus.indexed}/{embedStatus.total} ({embedStatus.model})
            {embedStatus.ready ? " · ready" : ""}
          </div>
        )}
        {embedJob && (
          <div className="mt-1 text-xs text-muted">
            Embed #{embedJob.id}: {embedJob.status} — {embedJob.message}
            {embedJob.total > 0 ? ` (${embedJob.progress}/${embedJob.total})` : ""}
          </div>
        )}

        {detail && (
          <div className="mt-3 rounded-lg bg-panel-2 p-3 text-xs">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  detail.ai.reachable ? "bg-emerald-400" : "bg-rose-400"
                }`}
              />
              {detail.ai.reachable ? (
                <span>
                  {detail.ai.provider} reachable — {detail.ai.models.length} model(s):{" "}
                  {detail.ai.models.slice(0, 5).join(", ")}
                </span>
              ) : (
                <span>
                  {detail.ai.provider} not reachable — the app works without AI; start
                  Ollama/LM Studio to enable it.
                </span>
              )}
            </div>
          </div>
        )}
      </Card>

      <Card className="text-xs text-muted">
        <h2 className="mb-2 text-sm font-semibold text-ink">Status</h2>
        <div>Library roots: {settings.library_roots.length}</div>
        {detail && (
          <>
            <div>
              Disk free: {(detail.storage.free_bytes / 1024 ** 3).toFixed(1)} GB /{" "}
              {(detail.storage.total_bytes / 1024 ** 3).toFixed(1)} GB
            </div>
            <div>Last scan: {detail.last_scan ? detail.last_scan.message : "never"}</div>
            <div>
              Scheduled rescan:{" "}
              {detail.scan_interval_hours
                ? `every ${detail.scan_interval_hours}h`
                : "off"}
            </div>
            <div>
              Transcode: {detail.transcode_enabled ? "on" : "off"}
              {detail.ffmpeg_available ? " · ffmpeg ready" : " · ffmpeg missing"}
            </div>
          </>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold text-ink">Sessions</h2>
        <p className="mb-3 text-xs text-muted">Revoke devices you no longer trust.</p>
        <SessionList />
      </Card>
    </div>
  );
}

function SessionList() {
  const [rows, setRows] = useState<Array<{ token: string; created_at: string; expires_at: string }>>(
    [],
  );
  const load = () => void api.sessions().then(setRows).catch(() => setRows([]));
  useEffect(() => {
    load();
  }, []);
  if (!rows.length) return <p className="text-xs text-muted">No active sessions listed.</p>;
  return (
    <div className="space-y-2">
      {rows.map((s) => (
        <div
          key={s.token}
          className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle px-3 py-2 text-xs"
        >
          <div className="min-w-0">
            <div className="truncate font-mono text-[11px] text-ink">{s.token.slice(0, 12)}…</div>
            <div className="text-muted">Expires {new Date(s.expires_at).toLocaleString()}</div>
          </div>
          <button
            type="button"
            className="btn btn-ghost !py-1 !text-xs"
            onClick={() => void api.revokeSession(s.token).then(load)}
          >
            Revoke
          </button>
        </div>
      ))}
    </div>
  );
}
