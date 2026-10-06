import { useEffect, useState } from "react";
import { api } from "../api";
import { Card, PageHeader } from "../components/ui";
import type { Job, Settings } from "../types";
import { useAuth } from "../store/auth";

export function SettingsPage() {
  const { user, logout } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [rootsText, setRootsText] = useState("");
  const [aiProvider, setAiProvider] = useState("ollama");
  const [aiBaseUrl, setAiBaseUrl] = useState("");
  const [aiChatModel, setAiChatModel] = useState("qwen2.5:7b-instruct");
  const [aiEmbedModel, setAiEmbedModel] = useState("nomic-embed-text");
  const [scanJob, setScanJob] = useState<Job | null>(null);
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
      setDetail(await api.healthDetail());
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
        online_enrichment: settings?.ai.online_enrichment ?? true,
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

  const runScan = async () => {
    setError("");
    try {
      const { job_id } = await api.scan();
      flash(`Scan started (job #${job_id})`);
      // Poll through the API seam until the job finishes.
      for (let i = 0; i < 300; i++) {
        const job = await api.job(job_id);
        setScanJob(job);
        if (job.status === "done" || job.status === "error") {
          flash(job.message || `Scan ${job.status}`);
          return;
        }
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    }
  };

  const doBackup = async () => {
    try {
      const { message: msg } = await api.backup();
      flash(msg);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Backup failed");
    }
  };

  if (!settings) {
    return <div className="px-4 py-8 text-sm text-muted">{error || "Loading…"}</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-5 pb-10 sm:px-8">
      <PageHeader
        title="Settings"
        subtitle={`Signed in as ${user?.username}`}
        actions={
          <button type="button" className="btn btn-secondary" onClick={() => void logout()}>
            Sign out
          </button>
        }
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
          One absolute path per line — folders on this server that contain your music.
        </p>
        <textarea
          className="input mb-3 h-28 font-mono text-xs"
          value={rootsText}
          onChange={(e) => setRootsText(e.target.value)}
          placeholder={"/home/teja/music\nD:\\Music"}
        />
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-primary" onClick={() => void saveRoots()}>
            Save folders
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void runScan()}>
            Scan now
          </button>
          {user?.is_admin && (
            <button type="button" className="btn btn-ghost" onClick={() => void doBackup()}>
              Backup DB
            </button>
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
        <button className="btn btn-primary mt-3" onClick={() => void saveAi()}>
          Save AI settings
        </button>

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
          </>
        )}
      </Card>
    </div>
  );
}
