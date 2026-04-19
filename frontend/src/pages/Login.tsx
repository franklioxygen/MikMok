import { useEffect, useState } from "react";
import type { FormEvent } from "react";

import { useAuth, useLoginRedirect } from "../hooks/useAuth";

export function LoginPage() {
  const { authenticated, login } = useAuth();
  const redirectToFeed = useLoginRedirect();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authenticated) {
      redirectToFeed();
    }
  }, [authenticated, redirectToFeed]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await login(password);
      redirectToFeed();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="screen-center">
      <section className="glass-panel">
        <p className="eyebrow">Local-first playback</p>
        <h1>MikMok</h1>
        <p className="hero__blurb">
          Private short-video hosting for home servers, with a vertical feed and an intentionally small operating
          surface.
        </p>
        <form className="form-stack" onSubmit={handleSubmit}>
          <label className="field">
            <span>Password</span>
            <input
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter deployment password"
              type="password"
              value={password}
            />
          </label>
          {error ? <p className="error-text">{error}</p> : null}
          <button className="button" disabled={submitting} type="submit">
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </section>
    </div>
  );
}
