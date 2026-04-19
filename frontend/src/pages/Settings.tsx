import { useEffect, useState } from "react";

import { apiRequest } from "../api/client";
import { useAuth } from "../hooks/useAuth";

type HealthData = {
  dbFile: string;
  environment: string;
  service: string;
  status: string;
  timestamp: number;
  transcodeEnabled: boolean;
};

export function SettingsPage() {
  const { authEnabled, sessionExpiresAt } = useAuth();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadHealth() {
      try {
        const result = await apiRequest<HealthData>("/health");

        if (!cancelled) {
          setHealth(result);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load health data.");
        }
      }
    }

    void loadHealth();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="sheet-page">
      <div className="stack-list">
        <article className="list-card">
          <div>
            <p className="eyebrow">Access</p>
            <h3>{authEnabled ? "Session login enabled" : "Login temporarily disabled"}</h3>
            <p className="list-card__path">
              {authEnabled && sessionExpiresAt
                ? `Expires at ${new Date(sessionExpiresAt * 1000).toLocaleString()}`
                : "Prototype mode bypasses login so the homepage can open directly into playback."}
            </p>
          </div>
          <span className="pill pill--solid">{authEnabled ? "Auth on" : "Auth off"}</span>
        </article>

        <article className="list-card">
          <div>
            <p className="eyebrow">Backend</p>
            <h3>{health?.service ?? "MikMok API"}</h3>
            <p className="list-card__path">
              {error
                ? error
                : health
                  ? `${health.status} in ${health.environment}, db at ${health.dbFile}`
                  : "Loading health snapshot..."}
            </p>
          </div>
          <span className="pill pill--solid">{health?.transcodeEnabled ? "Transcode on" : "Transcode off"}</span>
        </article>
      </div>
    </section>
  );
}
