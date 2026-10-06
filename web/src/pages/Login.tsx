import { useState } from "react";
import { BrandLogo, APP_NAME } from "../components/Brand";
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
        className="relative z-10 w-full max-w-md rounded-3xl border border-border bg-panel/90 p-8 shadow-2xl backdrop-blur-xl"
      >
        <div className="mb-8">
          <div className="mb-4 flex items-center gap-3">
            <BrandLogo size={44} />
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-bright">
              {mustSetup ? "First run" : "Sign in"}
            </span>
          </div>
          <h1 className="font-display text-4xl leading-none text-ink">{APP_NAME}</h1>
          <p className="mt-3 text-sm text-muted">
            {mustSetup
              ? "Create the owner account for this library."
              : "Sign in to open your library."}
          </p>
        </div>

        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
          Username
        </label>
        <input
          className="input mb-4"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          autoComplete="username"
          required
        />
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-wider text-muted">
          Password
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
          <div className="mb-4 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-accent-bright">
            {error}
          </div>
        )}

        <button className="btn btn-primary w-full py-3" disabled={busy}>
          {busy ? "Connecting…" : mustSetup ? "Create account" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
