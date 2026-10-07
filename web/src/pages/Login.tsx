import { useState } from "react";
import { BrandLogo, BrandWordmark, APP_NAME } from "../components/Brand";
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
      <div className="relative z-10 hidden w-[46%] flex-col justify-end p-10 lg:flex xl:p-14">
        <BrandLogo size={56} className="mb-8" />
        <BrandWordmark size="lg" />
        <p className="mt-5 max-w-sm text-base leading-relaxed text-muted">
          A private listening room for the music already on your machines.
        </p>
      </div>

      <form
        onSubmit={submit}
        className="relative z-10 m-auto w-full max-w-md border border-border bg-panel px-7 py-9 sm:px-9"
      >
        <div className="mb-8 lg:hidden">
          <div className="mb-4 flex items-center gap-3">
            <BrandLogo size={44} />
          </div>
          <BrandWordmark />
        </div>

        <p className="eyebrow">{mustSetup ? "First run" : "Sign in"}</p>
        <h1 className="font-display text-3xl leading-none text-ink lg:text-4xl">
          {mustSetup ? `Welcome to ${APP_NAME}` : "Open your library"}
        </h1>
        <p className="mt-3 text-sm text-muted">
          {mustSetup
            ? "Create the owner account for this library."
            : "Continue where you left off."}
        </p>

        <label className="mb-1.5 mt-8 block text-xs font-medium uppercase tracking-wider text-muted">
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
          <div className="mb-4 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
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
