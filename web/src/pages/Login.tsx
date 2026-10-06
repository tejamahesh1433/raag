import { useState } from "react";
import { IconMusic } from "../components/icons";
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
        className="relative z-10 w-full max-w-md rounded-3xl border border-border-subtle bg-panel/90 p-8 shadow-2xl backdrop-blur-xl"
      >
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-surface-2 text-accent">
            <IconMusic size={28} />
          </div>
          <h1 className="font-display text-3xl text-ink">Local Music</h1>
          <p className="mt-2 text-sm text-muted">
            {mustSetup
              ? "Create the owner account for this server"
              : "Sign in to browse and play your library"}
          </p>
        </div>

        <label className="mb-1.5 block text-xs font-medium text-muted">Username</label>
        <input
          className="input mb-4"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          autoComplete="username"
          required
        />
        <label className="mb-1.5 block text-xs font-medium text-muted">Password</label>
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
          <div className="mb-4 rounded-xl border border-rose-900/50 bg-rose-950/40 px-3 py-2 text-sm text-rose-300">
            {error}
          </div>
        )}

        <button className="btn btn-primary w-full py-3" disabled={busy}>
          {busy ? "Please wait…" : mustSetup ? "Create account" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
