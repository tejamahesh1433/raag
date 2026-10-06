import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { IconClose, IconPlaylist, IconPlus, IconSpark } from "../components/icons";
import { Card, PageHeader, SegmentedControl } from "../components/ui";
import type { Playlist, Rule, RuleTree } from "../types";

const RULE_FIELDS = ["genre", "artist", "album", "title", "year", "play_count"];
const RULE_OPS = ["contains", "eq", "neq", "gt", "lt"];

type RuleEntry = { field: string; op: string; value: string };
const blankRule = (): RuleEntry => ({ field: "genre", op: "contains", value: "" });

export function PlaylistsPage() {
  const navigate = useNavigate();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [smartOpen, setSmartOpen] = useState(false);
  const [smartName, setSmartName] = useState("");
  const [matchMode, setMatchMode] = useState<"all" | "any">("all");
  const [rules, setRules] = useState<RuleEntry[]>([blankRule()]);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => api.playlists().then(setPlaylists).catch(() => setPlaylists([]));
  useEffect(() => {
    void load();
  }, []);

  const createManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError("");
    try {
      await api.createPlaylist({ name: name.trim(), kind: "manual" });
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setCreating(false);
    }
  };

  const createSmart = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smartName.trim()) return;
    const filled = rules.filter((r) => r.value.trim());
    if (filled.length === 0) { setError("Add at least one rule with a value."); return; }
    const ruleTree: RuleTree = {
      match: matchMode,
      rules: filled as Rule[],
    };
    setError("");
    try {
      const pl = await api.createPlaylist({ name: smartName.trim(), kind: "smart", rules: ruleTree });
      setSmartName("");
      setRules([blankRule()]);
      setMatchMode("all");
      setSmartOpen(false);
      await load();
      navigate(`/playlists/${pl.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  };

  const importM3u = async (file: File) => {
    setError("");
    try {
      const pl = await api.importM3u(file);
      await load();
      navigate(`/playlists/${pl.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    }
  };

  const updateRule = (i: number, patch: Partial<RuleEntry>) =>
    setRules((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRule = () => setRules((rs) => [...rs, blankRule()]);
  const removeRule = (i: number) => setRules((rs) => rs.filter((_, idx) => idx !== i));

  return (
    <div>
      <PageHeader title="Playlists" subtitle="Manual and rule-based lists" />

      <div className="mx-5 space-y-3 sm:mx-8">
        <form onSubmit={createManual} className="flex gap-2">
          <input
            className="input"
            placeholder="New playlist name…"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button className="btn btn-primary shrink-0" disabled={creating}>
            Create
          </button>
          <button
            type="button"
            className="btn btn-ghost shrink-0"
            title="Import M3U file"
            onClick={() => fileRef.current?.click()}
          >
            Import M3U
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".m3u,.m3u8"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importM3u(f);
              e.target.value = "";
            }}
          />
        </form>

        <button
          type="button"
          className="btn btn-secondary w-full justify-start"
          onClick={() => setSmartOpen((v) => !v)}
        >
          <IconSpark size={16} />
          {smartOpen ? "Hide smart playlist builder" : "New smart playlist (rule-based)"}
        </button>

        {smartOpen && (
          <Card className="space-y-3 !p-4">
            <form onSubmit={createSmart} className="space-y-3">
              <input
                className="input"
                placeholder="Smart playlist name…"
                value={smartName}
                onChange={(e) => setSmartName(e.target.value)}
              />

              <div className="flex items-center gap-3">
                <span className="text-xs text-muted">Match</span>
                <SegmentedControl
                  value={matchMode}
                  onChange={setMatchMode}
                  options={[
                    { id: "all", label: "All rules" },
                    { id: "any", label: "Any rule" },
                  ]}
                />
              </div>

              <div className="space-y-2">
                {rules.map((rule, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <select
                      className="input !w-auto"
                      value={rule.field}
                      onChange={(e) => updateRule(i, { field: e.target.value })}
                    >
                      {RULE_FIELDS.map((f) => <option key={f}>{f}</option>)}
                    </select>
                    <select
                      className="input !w-auto"
                      value={rule.op}
                      onChange={(e) => updateRule(i, { op: e.target.value })}
                    >
                      {RULE_OPS.map((o) => <option key={o}>{o}</option>)}
                    </select>
                    <input
                      className="input min-w-24 flex-1"
                      placeholder="Value…"
                      value={rule.value}
                      onChange={(e) => updateRule(i, { value: e.target.value })}
                    />
                    {rules.length > 1 && (
                      <button
                        type="button"
                        className="btn-icon !h-8 !w-8 text-muted hover:text-rose-400"
                        onClick={() => removeRule(i)}
                        title="Remove rule"
                      >
                        <IconClose size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  className="btn btn-ghost text-xs"
                  onClick={addRule}
                >
                  <IconPlus size={14} />
                  Add rule
                </button>
                <button className="btn btn-primary">Create smart</button>
              </div>

              <div className="text-xs text-muted">
                Rules re-evaluate on every open · e.g. genre <em>contains</em> rock
              </div>
            </form>
          </Card>
        )}

        {error && <div className="text-sm text-rose-400">{error}</div>}
      </div>

      <div className="mt-8 divide-y divide-border-subtle px-2 sm:px-4">
        {playlists.map((pl) => (
          <Link
            key={pl.id}
            to={`/playlists/${pl.id}`}
            className="flex items-center gap-4 px-3 py-4 transition-colors hover:bg-panel/50"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border-subtle bg-panel-2 text-accent">
              {pl.kind === "smart" ? <IconSpark size={20} /> : <IconPlaylist size={20} />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{pl.name}</div>
              <div className="truncate text-xs text-muted">
                {pl.track_count} tracks
                {pl.description ? ` · ${pl.description}` : ""}
              </div>
            </div>
            <span className="text-muted">›</span>
          </Link>
        ))}
        {playlists.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted">
            No playlists yet — create one above.
          </div>
        )}
      </div>
    </div>
  );
}
