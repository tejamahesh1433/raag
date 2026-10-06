import { useState } from "react";
import { useAuth } from "../store/auth";

export function LoginPage({ mustSetup }: { mustSetup: boolean }) {
  const { login, setup } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mustSetup) await setup(username, password);
      else await login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-shell">
      <form
        onSubmit={submit}
        className="relative z-10 w-full max-w-md border-2 border-ink bg-panel p-8 shadow-[8px_8px_0_0_var(--color-ink)]"
      >
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="brand-mark">LM</span>
            <span className="on-air">
              <span className="on-air-dot" />
              Studio
            </span>
          </div>
          <h1 className="font-display text-4xl leading-none text-ink">Local Music</h1>
          <p className="mt-3 font-mono text-xs uppercase tracking-wider text-muted">
            {mustSetup
              ? "First transmission — create the owner account"
              : "Sign in to open the booth"}
          </p>
        </div>

        <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-muted">
          Callsign
        </label>
        <input
          className="input mb-4"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          autoComplete="username"
          required
        />
        <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-muted">
          Passkey
        </label>
        <input
          className="input mb-5"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete={mustSetup ? "new-password" : "current-password"}
          required
          minLength={mustSetup ? 6 : 1}
        />

        {error && (
          <div className="mb-4 border-2 border-signal bg-signal/10 px-3 py-2 font-mono text-sm text-signal">
            {error}
          </div>
        )}

        <button className="btn btn-primary w-full py-3" disabled={busy}>
          {busy ? "Connecting…" : mustSetup ? "Go on air" : "Enter booth"}
        </button>
      </form>
    </div>
  );
}
