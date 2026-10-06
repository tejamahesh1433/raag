import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { IconPlaylist, IconSpark } from "../components/icons";
import { Card, PageHeader } from "../components/ui";
import type { Playlist, Rule, RuleTree } from "../types";

const RULE_FIELDS = ["genre", "artist", "album", "title", "year", "play_count"];
const RULE_OPS = ["contains", "eq", "neq", "gt", "lt"];

export function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [smartOpen, setSmartOpen] = useState(false);
  const [smartName, setSmartName] = useState("");
  const [ruleField, setRuleField] = useState("genre");
  const [ruleOp, setRuleOp] = useState("contains");
  const [ruleValue, setRuleValue] = useState("");
  const [error, setError] = useState("");

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
    if (!smartName.trim() || !ruleValue.trim()) return;
    const rules: RuleTree = {
      match: "all",
      rules: [{ field: ruleField, op: ruleOp, value: ruleValue } as Rule],
    };
    setError("");
    try {
      await api.createPlaylist({
        name: smartName.trim(),
        kind: "smart",
        rules,
      });
      setSmartName("");
      setRuleValue("");
      setSmartOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    }
  };

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
          <Card className="space-y-2 !p-4">
          <form onSubmit={createSmart} className="space-y-2">
            <input
              className="input"
              placeholder="Smart playlist name…"
              value={smartName}
              onChange={(e) => setSmartName(e.target.value)}
            />
            <div className="flex flex-wrap gap-2">
              <select
                className="input !w-auto"
                value={ruleField}
                onChange={(e) => setRuleField(e.target.value)}
              >
                {RULE_FIELDS.map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
              <select
                className="input !w-auto"
                value={ruleOp}
                onChange={(e) => setRuleOp(e.target.value)}
              >
                {RULE_OPS.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
              <input
                className="input min-w-32 flex-1"
                placeholder="Value…"
                value={ruleValue}
                onChange={(e) => setRuleValue(e.target.value)}
              />
              <button className="btn btn-primary shrink-0">Create smart</button>
            </div>
            <div className="text-xs text-muted">
              Example: genre <em>contains</em> rock — rules re-evaluate on every open.
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
