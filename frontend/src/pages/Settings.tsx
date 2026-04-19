import { useEffect, useState } from "react";

import { apiRequest } from "../api/client";
import { useAuth } from "../hooks/useAuth";

type HealthData = {
  dbFile: string;
  environment: string;
  ffmpegAvailable: boolean;
  ffprobeAvailable: boolean;
  jobs: {
    failed: number;
    queued: number;
    running: number;
    succeeded: number;
    total: number;
  };
  service: string;
  status: string;
  timestamp: number;
  transcodeEnabled: boolean;
};

type JobSnapshot = {
  attemptCount: number;
  createdAt: number;
  finishedAt: number | null;
  id: string;
  lastError: string | null;
  progressCurrent: number;
  progressMessage: string | null;
  progressTotal: number;
  relatedEntityId: string | null;
  relatedEntityType: string | null;
  startedAt: number | null;
  status: string;
  type: string;
  updatedAt: number;
};

export function SettingsPage() {
  const { authEnabled, sessionExpiresAt } = useAuth();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [jobs, setJobs] = useState<JobSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [jobsError, setJobsError] = useState<string | null>(null);

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

  useEffect(() => {
    let cancelled = false;

    async function loadJobs() {
      try {
        const result = await apiRequest<JobSnapshot[]>("/jobs?limit=8");

        if (!cancelled) {
          setJobs(result);
        }
      } catch (loadError) {
        if (!cancelled) {
          setJobsError(loadError instanceof Error ? loadError.message : "Failed to load jobs.");
        }
      }
    }

    void loadJobs();
    const intervalHandle = window.setInterval(() => {
      void loadJobs();
    }, 4000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalHandle);
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
                  ? `${health.status} in ${health.environment}, db at ${health.dbFile}, ffmpeg ${health.ffmpegAvailable ? "ready" : "missing"}, ffprobe ${health.ffprobeAvailable ? "ready" : "missing"}, jobs ${health.jobs.running} running / ${health.jobs.queued} queued / ${health.jobs.failed} failed`
                  : "Loading health snapshot..."}
            </p>
          </div>
          <span className="pill pill--solid">{health?.transcodeEnabled ? "Transcode on" : "Transcode off"}</span>
        </article>

        <article className="list-card">
          <div>
            <p className="eyebrow">Recent Jobs</p>
            <h3>{jobsError ? "Job feed unavailable" : "Background processing"}</h3>
            <p className="list-card__path">
              {jobsError
                ? jobsError
                : jobs.length > 0
                  ? "Transcode jobs are persisted in SQLite and polled by the in-process worker."
                  : "No background jobs have been recorded yet."}
            </p>
          </div>
          <div className="stack-list">
            {jobs.map((job) => (
              <article key={job.id} className="list-card">
                <div>
                  <p className="eyebrow">
                    {job.type} · {job.status}
                  </p>
                  <h3>{job.relatedEntityId ?? job.id}</h3>
                  <p className="list-card__path">
                    {job.progressMessage ?? "No progress message yet."}
                    {job.progressTotal > 0 ? ` (${job.progressCurrent}/${job.progressTotal})` : ""}
                  </p>
                  <p className="list-card__path">
                    attempt {job.attemptCount} · updated {new Date(job.updatedAt * 1000).toLocaleString()}
                  </p>
                  {job.lastError ? <p className="list-card__path">{job.lastError}</p> : null}
                </div>
                <span className="pill">{job.status}</span>
              </article>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
