import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { BrandLogo, APP_NAME } from "../components/Brand";

type Step = "welcome" | "library" | "scan" | "ai" | "remote" | "done";

const STEPS: Step[] = ["welcome", "library", "scan", "ai", "remote", "done"];

export function SetupWizard({ onDone }: { onDone: () => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("welcome");
  const [rootsText, setRootsText] = useState("");
  const [status, setStatus] = useState<Awaited<ReturnType<typeof api.setupStatus>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [scanMsg, setScanMsg] = useState("");

  const refresh = async () => {
    const s = await api.setupStatus();
    setStatus(s);
    if (s.library_roots.length) setRootsText(s.library_roots.join("\n"));
    return s;
  };

  useEffect(() => {
    void refresh().catch((e) => setError(String(e.message || e)));
  }, []);

  const saveRoots = async () => {
    setBusy(true);
    setError("");
    try {
      const roots = rootsText.split("\n").map((r) => r.trim()).filter(Boolean);
      await api.saveSettings({ library_roots: roots });
      await refresh();
      setStep("scan");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const runScan = async () => {
    setBusy(true);
    setError("");
    setScanMsg("Scanning…");
    try {
      const { job_id } = await api.scan();
      for (let i = 0; i < 600; i++) {
        const job = await api.job(job_id);
        setScanMsg(job.message || job.status);
        if (job.status === "done" || job.status === "error") {
          if (job.status === "error") throw new Error(job.message);
          break;
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      await refresh();
      setStep("ai");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    onDone();
    navigate("/library");
  };

  return (
    <div className="login-shell">
      <div className="relative z-10 w-full max-w-lg rounded-3xl border border-border bg-panel/90 p-8 shadow-2xl backdrop-blur-xl">
        <div className="mb-2 flex items-center gap-3">
          <BrandLogo size={40} />
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-bright">
            Setup
          </span>
        </div>
        <h1 className="font-display text-3xl text-ink">Welcome to {APP_NAME}</h1>
        <p className="mt-2 text-sm text-muted">
          A few quick steps — everything stays on your machines.
        </p>

        <div className="my-5 flex gap-1.5">
          {STEPS.map((s, i) => (
            <div
              key={s}
              className={`h-1 flex-1 rounded-full ${
                STEPS.indexOf(step) >= i ? "bg-accent" : "bg-white/10"
              }`}
            />
          ))}
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent-bright">
            {error}
          </div>
        )}

        {step === "welcome" && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-muted">
              Add a music folder, scan it, optionally connect local AI, then glance at remote-access
              tips if you want phones outside your Wi‑Fi.
            </p>
            <button type="button" className="btn btn-primary w-full py-3" onClick={() => setStep("library")}>
              Continue
            </button>
          </div>
        )}

        {step === "library" && (
          <div className="space-y-4">
            <label className="block text-xs font-medium text-muted">
              Library folders (one absolute path per line)
            </label>
            <textarea
              className="input h-28 font-mono text-xs"
              value={rootsText}
              onChange={(e) => setRootsText(e.target.value)}
              placeholder={"D:\\Music\\Downloads"}
            />
            <button
              type="button"
              className="btn btn-primary w-full py-3"
              disabled={busy || !rootsText.trim()}
              onClick={() => void saveRoots()}
            >
              Save & continue
            </button>
          </div>
        )}

        {step === "scan" && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Scan indexes tags and artwork. You can re-run this anytime in Settings — or enable a
              scheduled rescan later.
            </p>
            {scanMsg && <p className="text-xs text-accent-bright">{scanMsg}</p>}
            {status && status.track_count > 0 && (
              <p className="text-sm text-ink">{status.track_count} tracks in library</p>
            )}
            <button
              type="button"
              className="btn btn-primary w-full py-3"
              disabled={busy}
              onClick={() => void runScan()}
            >
              {busy ? "Scanning…" : "Scan now"}
            </button>
            <button type="button" className="btn btn-ghost w-full" onClick={() => setStep("ai")}>
              Skip for now
            </button>
          </div>
        )}

        {step === "ai" && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Optional: run Ollama or LM Studio locally for Chat and semantic search.
            </p>
            <div className="rounded-xl bg-panel-2/80 px-4 py-3 text-sm">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    status?.ai_reachable ? "bg-emerald-400" : "bg-rose-400"
                  }`}
                />
                {status?.ai_reachable ? "AI provider reachable" : "AI offline — app still works"}
              </div>
              <p className="mt-2 text-xs text-muted">
                Suggested: <code className="text-ink">ollama pull qwen2.5:7b-instruct</code> and{" "}
                <code className="text-ink">nomic-embed-text</code>
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary w-full"
              onClick={() => void refresh()}
            >
              Re-check AI
            </button>
            <button type="button" className="btn btn-primary w-full py-3" onClick={() => setStep("remote")}>
              Continue
            </button>
          </div>
        )}

        {step === "remote" && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              LAN works out of the box. Use this checklist only if you want access outside home Wi‑Fi.
            </p>
            <ul className="space-y-2 rounded-xl border border-border-subtle bg-panel-2/60 px-4 py-3 text-xs leading-relaxed text-muted">
              <li>
                <strong className="text-ink">Same Wi‑Fi</strong> — open{" "}
                <code className="text-ink">http://&lt;pc-ip&gt;:8765</code> on your phone.
              </li>
              <li>
                <strong className="text-ink">DNS</strong> — optional A record (e.g.{" "}
                <code className="text-ink">music.yourdomain</code>) → home public IP / DDNS.
              </li>
              <li>
                <strong className="text-ink">HTTPS</strong> — Caddy or Cloudflare Tunnel in front of
                port 8765 (see <code className="text-ink">docs/deploy.md</code>).
              </li>
              <li>
                <strong className="text-ink">No open ports?</strong> —{" "}
                <code className="text-ink">cloudflared tunnel</code> or Tailscale Funnel.
              </li>
              <li>
                <strong className="text-accent-bright">Public URL?</strong> set{" "}
                <code className="text-ink">MUSIC_AUTH_REQUIRED=1</code> — never expose raw :8765 to
                the internet.
              </li>
            </ul>
            <button type="button" className="btn btn-primary w-full py-3" onClick={() => setStep("done")}>
              Got it
            </button>
            <button type="button" className="btn btn-ghost w-full" onClick={() => setStep("done")}>
              Skip — LAN only
            </button>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              You’re set. Expand the player while listening, browse Genres / Folders / Recent, and use
              Settings for scheduled scan, embeddings, and ffmpeg transcoding.
            </p>
            <ul className="space-y-1 text-xs text-muted">
              <li>✓ Library roots: {status?.has_library_roots ? "configured" : "none"}</li>
              <li>✓ Tracks: {status?.track_count ?? 0}</li>
              <li>✓ AI: {status?.ai_reachable ? "online" : "optional / offline"}</li>
            </ul>
            <button type="button" className="btn btn-primary w-full py-3" onClick={finish}>
              Open library
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
