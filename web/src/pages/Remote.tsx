import { useEffect, useState } from "react";
import { Card, PageHeader } from "../components/ui";
import {
  createParty,
  getPartyMeta,
  joinParty,
  leaveParty,
  onPartyMessage,
  sendCommand,
  type PartyMember,
} from "../lib/party";

export function RemotePage() {
  const [name, setName] = useState(() => localStorage.getItem("raag-party-name") || "Me");
  const [joinCode, setJoinCode] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [role, setRole] = useState<"host" | "listener" | null>(null);
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [nowPlaying, setNowPlaying] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    return onPartyMessage((msg) => {
      if (msg.type === "member" || msg.type === "joined" || msg.type === "created") {
        const list = (msg.members as PartyMember[]) || [];
        if (list.length) setMembers(list);
        const meta = getPartyMeta();
        setRole(meta.role);
        setCode(meta.code);
      }
      if (msg.type === "state") {
        const st = msg.state as { title?: string; artist?: string; playing?: boolean };
        if (st.title) {
          setNowPlaying(`${st.playing === false ? "⏸ " : "▶ "}${st.title} — ${st.artist || ""}`);
        }
      }
      if (msg.type === "closed") {
        setRole(null);
        setCode(null);
        setMembers([]);
      }
    });
  }, []);

  const persistName = (n: string) => {
    setName(n);
    localStorage.setItem("raag-party-name", n);
  };

  const host = async () => {
    setBusy(true);
    setError("");
    try {
      const c = await createParty(name);
      setCode(c);
      setRole("host");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create party");
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    setBusy(true);
    setError("");
    try {
      await joinParty(joinCode.trim().toUpperCase(), name);
      setCode(joinCode.trim().toUpperCase());
      setRole("listener");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to join");
    } finally {
      setBusy(false);
    }
  };

  const leave = () => {
    leaveParty();
    setCode(null);
    setRole(null);
    setMembers([]);
    setNowPlaying("");
  };

  return (
    <div className="mx-auto max-w-lg space-y-5 px-5 pb-10 sm:px-8">
      <PageHeader
        title="Remote"
        subtitle="Control playback from another phone, or listen together"
        eyebrow="Party"
      />

      <Card>
        <label className="mb-1 block text-xs text-muted">Display name</label>
        <input className="input mb-4" value={name} onChange={(e) => persistName(e.target.value)} />

        {!code ? (
          <div className="space-y-3">
            <button type="button" className="btn btn-primary w-full" disabled={busy} onClick={() => void host()}>
              Start party (host)
            </button>
            <div className="flex gap-2">
              <input
                className="input flex-1 uppercase tracking-widest"
                placeholder="Join code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                maxLength={8}
              />
              <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void join()}>
                Join
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-ink">
              Code <span className="font-mono text-lg tracking-[0.2em] text-accent-bright">{code}</span>
              <span className="ml-2 text-xs text-muted">({role})</span>
            </p>
            {nowPlaying && <p className="text-sm text-muted">{nowPlaying}</p>}
            {members.length > 0 && (
              <ul className="text-xs text-muted">
                {members.map((m) => (
                  <li key={m.id}>
                    {m.name}
                    {m.host ? " · host" : ""}
                  </li>
                ))}
              </ul>
            )}
            {role === "listener" && (
              <div className="flex flex-wrap gap-2 pt-2">
                <button type="button" className="btn btn-secondary" onClick={() => sendCommand("prev")}>
                  Prev
                </button>
                <button type="button" className="btn btn-primary" onClick={() => sendCommand("toggle")}>
                  Play / Pause
                </button>
                <button type="button" className="btn btn-secondary" onClick={() => sendCommand("next")}>
                  Next
                </button>
              </div>
            )}
            {role === "host" && (
              <p className="text-xs text-muted">
                Keep this tab open while others join with the code. Playback stays on the host.
              </p>
            )}
            <button type="button" className="btn btn-ghost" onClick={leave}>
              Leave party
            </button>
          </div>
        )}
        {error && <p className="mt-3 text-sm text-accent-bright">{error}</p>}
      </Card>
    </div>
  );
}
