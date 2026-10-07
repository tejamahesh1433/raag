import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Card, PageHeader } from "../components/ui";
import type { Job, Settings, User } from "../types";
import { useAuth } from "../store/auth";
import {
  getCrossfade,
  getEqPreset,
  isGapless,
  setCrossfade,
  setEqPreset,
  setGapless,
  type EqPreset,
} from "../audioEngine";
import { getStreamQuality, setStreamQuality, type StreamQuality } from "../lib/streamQuality";

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
  const [eqPreset, setEqPresetState] = useState<EqPreset>(getEqPreset());
  const [crossfadeSec, setCrossfadeSec] = useState<number>(getCrossfade());
  const [streamQuality, setStreamQualityState] = useState<StreamQuality>(getStreamQuality());
  const [lfmEnabled, setLfmEnabled] = useState(false);
  const [lfmKey, setLfmKey] = useState("");
  const [lfmSecret, setLfmSecret] = useState("");
  const [lfmSession, setLfmSession] = useState("");
  const [lfmUser, setLfmUser] = useState("");
  const [lfmPass, setLfmPass] = useState("");
  const [lbEnabled, setLbEnabled] = useState(false);
  const [lbToken, setLbToken] = useState("");
  const [discordEnabled, setDiscordEnabled] = useState(false);
  const [discordUrl, setDiscordUrl] = useState("");
  const [discordContent, setDiscordContent] = useState("Now playing on Raag");
  const [acoustidKey, setAcoustidKey] = useState("");
  const [gaplessOn, setGaplessOn] = useState(isGapless());
  const [scanJob, setScanJob] = useState<Job | null>(null);
  const [embedJob, setEmbedJob] = useState<Job | null>(null);
  const [embedStatus, setEmbedStatus] = useState<{
    indexed: number;
    total: number;
    model: string;
    ready: boolean;
  } | null>(null);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof api.listeningStats>> | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof api.healthDetail>> | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [users, setUsers] = useState<User[]>([]);
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newIsAdmin, setNewIsAdmin] = useState(false);


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
      const sc = s.scrobble ?? {};
      setLfmEnabled(Boolean(sc.lastfm_enabled));
      setLfmKey(sc.lastfm_api_key ?? "");
      setLfmSecret(sc.lastfm_api_secret ?? "");
      setLfmSession(sc.lastfm_session_key ?? "");
      setLbEnabled(Boolean(sc.listenbrainz_enabled));
      setLbToken(sc.listenbrainz_token ?? "");
      const d = s.discord ?? {};
      setDiscordEnabled(Boolean(d.enabled));
      setDiscordUrl(d.webhook_url ?? "");
      setDiscordContent(d.content ?? "Now playing on Raag");
      setAcoustidKey(s.acoustid?.api_key ?? "");
      setDetail(await api.healthDetail());
      try {
        setEmbedStatus(await api.discoveryStatus());
      } catch {
        setEmbedStatus(null);
      }
      try {
        setStats(await api.listeningStats());
      } catch {
        setStats(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    }
  };

  const loadUsers = () => {
    if (user?.is_admin) {
      void api.listUsers().then(setUsers).catch(() => setUsers([]));
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.is_admin]);

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
        <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</div>
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

      {user?.is_admin && (
        <Card>
          <h2 className="mb-1 text-sm font-semibold text-ink">Users</h2>
          <p className="mb-3 text-xs text-muted">Manage accounts that can log in to this server.</p>
          <div className="mb-3 space-y-2">
            {users.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border-subtle px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate text-ink">{u.username}</span>
                  {u.is_admin && (
                    <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                      Admin
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-ghost !py-1 !text-xs"
                  disabled={u.id === user.id}
                  onClick={() =>
                    void api
                      .deleteUser(u.id)
                      .then(() => {
                        flash(`Deleted ${u.username}`);
                        loadUsers();
                      })
                      .catch((err) =>
                        setError(err instanceof Error ? err.message : "Delete failed"),
                      )
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className="input"
              placeholder="Username"
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
            />
            <input
              className="input"
              placeholder="Password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={newIsAdmin}
              onChange={(e) => setNewIsAdmin(e.target.checked)}
            />
            Admin?
          </label>
          <button
            type="button"
            className="btn btn-primary mt-3"
            onClick={() => {
              if (!newUsername.trim() || !newPassword) return;
              void api
                .createUser({ username: newUsername.trim(), password: newPassword, is_admin: newIsAdmin })
                .then(() => {
                  flash(`Created ${newUsername.trim()}`);
                  setNewUsername("");
                  setNewPassword("");
                  setNewIsAdmin(false);
                  loadUsers();
                })
                .catch((err) =>
                  setError(err instanceof Error ? err.message : "Create failed"),
                );
            }}
          >
            Add user
          </button>
        </Card>
      )}

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
        <label className="mt-4 block text-xs text-muted">
          Stream quality (client)
          <select
            className="input mt-1"
            value={streamQuality}
            onChange={(e) => {
              const q = e.target.value as StreamQuality;
              setStreamQuality(q);
              setStreamQualityState(q);
              flash(`Stream quality: ${q === "original" ? "Original" : `${q} kbps`}`);
            }}
          >
            <option value="original">Original (lossless / native)</option>
            <option value="320">320 kbps MP3</option>
            <option value="256">256 kbps MP3</option>
            <option value="192">192 kbps MP3</option>
            <option value="128">128 kbps MP3</option>
          </select>
        </label>
        <p className="mt-1 text-[11px] text-muted">
          Lower bitrates need ffmpeg and re-encode on the fly (no seeking). Useful on mobile data.
        </p>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-ink">Scrobbling</h2>
        <p className="mb-3 text-xs text-muted">
          Submit listens to Last.fm / ListenBrainz after 50% or 4 minutes of playback.
        </p>
        <label className="mb-3 flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={lfmEnabled}
            onChange={(e) => setLfmEnabled(e.target.checked)}
          />
          Last.fm
        </label>
        <div className="mb-3 grid gap-2 sm:grid-cols-2">
          <input
            className="input"
            placeholder="API key"
            value={lfmKey}
            onChange={(e) => setLfmKey(e.target.value)}
          />
          <input
            className="input"
            placeholder="API secret"
            type="password"
            value={lfmSecret}
            onChange={(e) => setLfmSecret(e.target.value)}
          />
          <input
            className="input sm:col-span-2"
            placeholder="Session key (or link below)"
            value={lfmSession}
            onChange={(e) => setLfmSession(e.target.value)}
          />
          <input
            className="input"
            placeholder="Last.fm username"
            value={lfmUser}
            onChange={(e) => setLfmUser(e.target.value)}
          />
          <input
            className="input"
            placeholder="Last.fm password"
            type="password"
            value={lfmPass}
            onChange={(e) => setLfmPass(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn btn-secondary mb-4"
          onClick={() =>
            void api
              .lastfmAuth({
                username: lfmUser,
                password: lfmPass,
                api_key: lfmKey,
                api_secret: lfmSecret,
              })
              .then((r) => {
                setLfmSession(r.session_key);
                setLfmEnabled(true);
                flash("Last.fm linked");
                return load();
              })
              .catch((err) => setError(err instanceof Error ? err.message : "Last.fm auth failed"))
          }
        >
          Link Last.fm account
        </button>
        <label className="mb-2 flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={lbEnabled}
            onChange={(e) => setLbEnabled(e.target.checked)}
          />
          ListenBrainz
        </label>
        <input
          className="input mb-3"
          placeholder="ListenBrainz user token"
          type="password"
          value={lbToken}
          onChange={(e) => setLbToken(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            void api
              .saveSettings({
                scrobble: {
                  lastfm_enabled: lfmEnabled,
                  lastfm_api_key: lfmKey,
                  lastfm_api_secret: lfmSecret,
                  lastfm_session_key: lfmSession,
                  listenbrainz_enabled: lbEnabled,
                  listenbrainz_token: lbToken,
                },
              })
              .then((s) => {
                setSettings(s);
                flash("Scrobble settings saved");
              })
              .catch((err) => setError(err instanceof Error ? err.message : "Save failed"))
          }
        >
          Save scrobble settings
        </button>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-ink">Discord webhook</h2>
        <p className="mb-3 text-xs text-muted">
          Post now-playing embeds when a listen is scrobbled (50% / 4 min).
        </p>
        <label className="mb-2 flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={discordEnabled}
            onChange={(e) => setDiscordEnabled(e.target.checked)}
          />
          Enable Discord notifications
        </label>
        <input
          className="input mb-2"
          placeholder="https://discord.com/api/webhooks/…"
          value={discordUrl}
          onChange={(e) => setDiscordUrl(e.target.value)}
        />
        <input
          className="input mb-3"
          placeholder="Message content"
          value={discordContent}
          onChange={(e) => setDiscordContent(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            void api
              .saveSettings({
                discord: {
                  enabled: discordEnabled,
                  webhook_url: discordUrl,
                  content: discordContent,
                },
              })
              .then((s) => {
                setSettings(s);
                flash("Discord settings saved");
              })
              .catch((err) => setError(err instanceof Error ? err.message : "Save failed"))
          }
        >
          Save Discord settings
        </button>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-ink">AcoustID</h2>
        <p className="mb-3 text-xs text-muted">
          Acoustic fingerprinting for untagged tracks (needs{" "}
          <code className="text-ink">fpcalc</code> / chromaprint). Suggestions only — files are never
          rewritten.
        </p>
        <input
          className="input mb-3"
          placeholder="AcoustID API key"
          type="password"
          value={acoustidKey}
          onChange={(e) => setAcoustidKey(e.target.value)}
        />
        <button
          type="button"
          className="btn btn-primary"
          onClick={() =>
            void api
              .saveSettings({ acoustid: { api_key: acoustidKey } })
              .then((s) => {
                setSettings(s);
                flash("AcoustID key saved");
              })
              .catch((err) => setError(err instanceof Error ? err.message : "Save failed"))
          }
        >
          Save AcoustID key
        </button>
      </Card>

      <Card>
        <h2 className="mb-1 text-sm font-semibold text-ink">Audio Equalizer & Crossfade</h2>
        <p className="mb-3 text-xs text-muted">
          Fine-tune frequency curves using Web Audio DSP and set track crossfade durations.
        </p>
        <label className="mb-3 flex items-center gap-2 text-xs text-muted">
          <input
            type="checkbox"
            checked={gaplessOn}
            onChange={(e) => {
              setGaplessOn(e.target.checked);
              setGapless(e.target.checked);
              flash(e.target.checked ? "Gapless on" : "Gapless off");
            }}
          />
          Gapless / pre-buffer next track
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted">
            EQ Preset
            <select
              className="input mt-1"
              value={eqPreset}
              onChange={(e) => {
                const p = e.target.value as EqPreset;
                setEqPresetState(p);
                setEqPreset(p);
                flash(`EQ Preset set to ${p}`);
              }}
            >
              <option value="flat">Flat</option>
              <option value="bass_boost">Bass Boost</option>
              <option value="treble_boost">Treble Boost</option>
              <option value="vocal">Vocal</option>
              <option value="rock">Rock</option>
              <option value="pop">Pop</option>
            </select>
          </label>
          <label className="text-xs text-muted">
            Crossfade (0–15 sec)
            <input
              type="number"
              min={0}
              max={15}
              className="input mt-1 text-xs"
              value={crossfadeSec}
              onChange={(e) => {
                const sec = Number(e.target.value);
                setCrossfadeSec(sec);
                setCrossfade(sec);
              }}
            />
          </label>
        </div>
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
        {stats && (
          <div className="mt-3 rounded-lg bg-panel-2 p-3 text-xs text-muted">
            <div>
              Library: {stats.total_tracks} tracks ·{" "}
              {Math.round(stats.total_duration_seconds / 3600)}h
            </div>
            {stats.top_artists[0] && (
              <div className="mt-1">
                Top artist: {stats.top_artists[0].artist} ({stats.top_artists[0].count})
              </div>
            )}
            {stats.top_genres[0] && (
              <div className="mt-1">
                Top genre: {stats.top_genres[0].genre} ({stats.top_genres[0].count})
              </div>
            )}
          </div>
        )}

        {detail && (
          <div className="mt-3 rounded-lg bg-panel-2 p-3 text-xs">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  detail.ai.reachable ? "bg-emerald-400" : "bg-danger"
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
