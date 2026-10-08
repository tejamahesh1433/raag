import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { IconPlaylist, IconSpark } from "../components/icons";
import { SmartPlaylistBuilder, EMPTY_RULE_TREE } from "../components/SmartPlaylistBuilder";
import { Card, PageHeader, SegmentedControl } from "../components/ui";
import type { Playlist, RuleTree } from "../types";

export function PlaylistsPage() {
  const navigate = useNavigate();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [kind, setKind] = useState<"manual" | "smart" | "ai">("manual");
  const [newName, setNewName] = useState("");
  const [aiDescription, setAiDescription] = useState("");
  const [ruleTree, setRuleTree] = useState<RuleTree>(EMPTY_RULE_TREE);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => api.playlists().then(setPlaylists).catch(() => setPlaylists([]));
  useEffect(() => {
    void load();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (kind !== "ai" && !newName.trim()) return;
    setCreating(true);
    setError("");
    try {
      if (kind === "ai") {
        if (aiDescription.trim().length < 3) {
          setError("Describe the mix you want (e.g. “rainy evening jazz”).");
          return;
        }
        const pl = await api.generateAiPlaylist({
          description: aiDescription.trim(),
          name: newName.trim() || undefined,
        });
        setNewName("");
        setAiDescription("");
        setKind("manual");
        await load();
        navigate(`/playlists/${pl.id}`);
        return;
      }
      if (kind === "smart") {
        const filled = ruleTree.rules.filter((r) =>
          typeof r.value === "number" || String(r.value).trim() !== "",
        );
        if (filled.length === 0) {
          setError("Add at least one rule with a value.");
          setCreating(false);
          return;
        }
        const pl = await api.createPlaylist({
          name: newName.trim(),
          kind: "smart",
          rules: { ...ruleTree, rules: filled },
        });
        setNewName("");
        setRuleTree(EMPTY_RULE_TREE);
        setKind("manual");
        await load();
        navigate(`/playlists/${pl.id}`);
      } else {
        await api.createPlaylist({ name: newName.trim(), kind: "manual" });
        setNewName("");
        await load();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setCreating(false);
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

  return (
    <div>
      <PageHeader title="Playlists" subtitle="Manual and rule-based lists" />

      <div className="mx-5 space-y-3 sm:mx-8">
        <Card className="space-y-3 !p-4">
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl
              value={kind}
              onChange={(v) => {
                setKind(v);
                setError("");
              }}
              options={[
                { id: "manual", label: "Manual" },
                { id: "smart", label: "Smart" },
                { id: "ai", label: "AI mix" },
              ]}
            />
            <span className="text-xs text-muted">
              {kind === "smart"
                ? "Rule-based · updates automatically"
                : kind === "ai"
                  ? "Describe a mood — your local AI picks the tracks"
                  : "Hand-curated playlist"}
            </span>
          </div>

          <form onSubmit={handleCreate} className="space-y-3">
            <div className="flex gap-2">
              <input
                className="input"
                placeholder={
                  kind === "smart"
                    ? "Smart playlist name…"
                    : kind === "ai"
                      ? "Mix name (optional)…"
                      : "New playlist name…"
                }
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <button className="btn btn-primary shrink-0" disabled={creating}>
                {creating && kind === "ai"
                  ? "Thinking…"
                  : kind === "smart"
                    ? "Create smart"
                    : kind === "ai"
                      ? "✨ Generate"
                      : "Create"}
              </button>
              {kind === "manual" && (
                <button
                  type="button"
                  className="btn btn-ghost shrink-0"
                  title="Import M3U file"
                  onClick={() => fileRef.current?.click()}
                >
                  Import M3U
                </button>
              )}
            </div>

            {kind === "ai" && (
              <textarea
                className="input h-20"
                placeholder="Describe the mix… e.g. “upbeat songs for a night drive”"
                value={aiDescription}
                onChange={(e) => setAiDescription(e.target.value)}
              />
            )}

            {kind === "smart" && (
              <SmartPlaylistBuilder value={ruleTree} onChange={setRuleTree} />
            )}
          </form>

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

          {error && <div className="text-sm text-danger">{error}</div>}
        </Card>

        <div className="mt-5 divide-y divide-border-subtle">
          {playlists.map((pl) => (
            <Link
              key={pl.id}
              to={`/playlists/${pl.id}`}
              className="flex items-center gap-4 px-3 py-4 transition-colors hover:bg-panel/50"
            >
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border-subtle bg-panel-2 text-accent">
                {pl.kind !== "manual" ? <IconSpark size={20} /> : <IconPlaylist size={20} />}
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
    </div>
  );
}
