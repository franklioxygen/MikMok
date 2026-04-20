import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { apiRequest } from "../api/client";
import { useAuth } from "../hooks/useAuth";
import { type PlaybackCompletionMode, useUiStore } from "../store/uiStore";

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

type RemoteSourceAuthMode = "integration_api_key" | "none" | "session_cookie";
type RemoteSourceScopeMode = "all" | "authors" | "collections" | "mixed";

type RemoteSource = {
  authMode: RemoteSourceAuthMode;
  authorKeys: string[];
  baseUrl: string;
  collectionIds: string[];
  enabled: boolean;
  hasCredential: boolean;
  id: string;
  lastValidatedAt: number | null;
  name: string;
  scopeMode: RemoteSourceScopeMode;
};

type RemoteSourceDiscovery = {
  authors: Array<{
    avatarUrl: string | null;
    key: string;
    name: string;
    videoCount: number;
  }>;
  collections: Array<{
    id: string;
    name: string;
    videoCount: number;
  }>;
  videoCount: number;
};

type RemoteSourceForm = {
  authMode: RemoteSourceAuthMode;
  authorKeys: string[];
  baseUrl: string;
  collectionIds: string[];
  credential: string;
  enabled: boolean;
  name: string;
  scopeMode: RemoteSourceScopeMode;
};

const playbackCompletionOptions: Array<{ label: string; value: PlaybackCompletionMode }> = [
  { label: "Stop", value: "stop" },
  { label: "Play next", value: "next" },
  { label: "Repeat current", value: "repeat" }
];

const authModeOptions: Array<{ label: string; value: RemoteSourceAuthMode }> = [
  { label: "None", value: "none" },
  { label: "Session Cookie", value: "session_cookie" },
  { label: "Integration API Key", value: "integration_api_key" }
];

const scopeModeOptions: Array<{ label: string; value: RemoteSourceScopeMode }> = [
  { label: "All content", value: "all" },
  { label: "Selected collections", value: "collections" },
  { label: "Selected authors", value: "authors" },
  { label: "Collections + authors", value: "mixed" }
];

const emptyRemoteSourceForm: RemoteSourceForm = {
  enabled: true,
  name: "",
  baseUrl: "",
  authMode: "none",
  credential: "",
  scopeMode: "all",
  collectionIds: [],
  authorKeys: []
};

const newRemoteSourceSelectionId = "__new__";

function createRemoteSourceForm(source?: RemoteSource | null): RemoteSourceForm {
  if (!source) {
    return emptyRemoteSourceForm;
  }

  return {
    enabled: source.enabled,
    name: source.name,
    baseUrl: source.baseUrl,
    authMode: source.authMode,
    credential: "",
    scopeMode: source.scopeMode,
    collectionIds: source.collectionIds,
    authorKeys: source.authorKeys
  };
}

export function SettingsPage() {
  const { authEnabled, authenticated, logout, sessionExpiresAt } = useAuth();
  const playbackCompletionMode = useUiStore((state) => state.playbackCompletionMode);
  const setPlaybackCompletionMode = useUiStore((state) => state.setPlaybackCompletionMode);
  const setSoundOnOpen = useUiStore((state) => state.setSoundOnOpen);
  const soundOnOpen = useUiStore((state) => state.soundOnOpen);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [jobs, setJobs] = useState<JobSnapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [jobsError, setJobsError] = useState<string | null>(null);
  const [remoteSources, setRemoteSources] = useState<RemoteSource[]>([]);
  const [selectedRemoteSourceId, setSelectedRemoteSourceId] = useState<string | null>(null);
  const [remoteSourceForm, setRemoteSourceForm] = useState<RemoteSourceForm>(emptyRemoteSourceForm);
  const [remoteSourceError, setRemoteSourceError] = useState<string | null>(null);
  const [remoteSourceFeedback, setRemoteSourceFeedback] = useState<string | null>(null);
  const [remoteDiscovery, setRemoteDiscovery] = useState<RemoteSourceDiscovery | null>(null);
  const [isLoadingRemoteSources, setIsLoadingRemoteSources] = useState(false);
  const [isSavingRemoteSource, setIsSavingRemoteSource] = useState(false);
  const [isTestingRemoteSource, setIsTestingRemoteSource] = useState(false);
  const [isDiscoveringRemoteSource, setIsDiscoveringRemoteSource] = useState(false);

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

  useEffect(() => {
    if (!authenticated) {
      setRemoteSources([]);
      setSelectedRemoteSourceId(null);
      setRemoteSourceForm(emptyRemoteSourceForm);
      setRemoteDiscovery(null);
      return;
    }

    let cancelled = false;

    async function loadRemoteSources() {
      setIsLoadingRemoteSources(true);

      try {
        const result = await apiRequest<RemoteSource[]>("/remote-sources");

        if (!cancelled) {
          setRemoteSources(result);
          setRemoteSourceError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setRemoteSourceError(loadError instanceof Error ? loadError.message : "Failed to load remote sources.");
        }
      } finally {
        if (!cancelled) {
          setIsLoadingRemoteSources(false);
        }
      }
    }

    void loadRemoteSources();

    return () => {
      cancelled = true;
    };
  }, [authenticated]);

  const selectedRemoteSource = useMemo(
    () =>
      selectedRemoteSourceId === newRemoteSourceSelectionId
        ? null
        : remoteSources.find((source) => source.id === selectedRemoteSourceId) ?? null,
    [remoteSources, selectedRemoteSourceId]
  );

  useEffect(() => {
    if (selectedRemoteSourceId === newRemoteSourceSelectionId) {
      setRemoteSourceForm(emptyRemoteSourceForm);
      return;
    }

    if (!selectedRemoteSourceId) {
      if (remoteSources.length > 0) {
        setSelectedRemoteSourceId(remoteSources[0]?.id ?? null);
      }

      return;
    }

    if (!selectedRemoteSource) {
      setSelectedRemoteSourceId(remoteSources[0]?.id ?? null);
      return;
    }

    setRemoteSourceForm(createRemoteSourceForm(selectedRemoteSource));
  }, [remoteSources, selectedRemoteSource, selectedRemoteSourceId]);

  async function reloadRemoteSources(nextSelectedSourceId?: string | null) {
    if (!authenticated) {
      return;
    }

    const result = await apiRequest<RemoteSource[]>("/remote-sources");
    setRemoteSources(result);

    if (nextSelectedSourceId !== undefined) {
      setSelectedRemoteSourceId(nextSelectedSourceId);
      return;
    }

    if (selectedRemoteSourceId && result.some((source) => source.id === selectedRemoteSourceId)) {
      setSelectedRemoteSourceId(selectedRemoteSourceId);
      return;
    }

    setSelectedRemoteSourceId(result[0]?.id ?? null);
  }

  async function handleSaveRemoteSource() {
    setIsSavingRemoteSource(true);
    setRemoteSourceError(null);

    try {
      const payload = {
        enabled: remoteSourceForm.enabled,
        name: remoteSourceForm.name,
        baseUrl: remoteSourceForm.baseUrl,
        authMode: remoteSourceForm.authMode,
        scopeMode: remoteSourceForm.scopeMode,
        collectionIds: remoteSourceForm.collectionIds,
        authorKeys: remoteSourceForm.authorKeys,
        ...(remoteSourceForm.credential.trim().length > 0 ? { credential: remoteSourceForm.credential.trim() } : {})
      };

      const savedSource = selectedRemoteSource
        ? await apiRequest<RemoteSource>(`/remote-sources/${selectedRemoteSource.id}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
          })
        : await apiRequest<RemoteSource>("/remote-sources", {
            method: "POST",
            body: JSON.stringify({
              ...payload,
              type: "mytube"
            })
          });

      setRemoteSourceFeedback(selectedRemoteSource ? `Updated ${savedSource.name}.` : `Created ${savedSource.name}.`);
      await reloadRemoteSources(savedSource.id);
      setRemoteSourceForm(createRemoteSourceForm(savedSource));
    } catch (saveError) {
      setRemoteSourceError(saveError instanceof Error ? saveError.message : "Failed to save remote source.");
    } finally {
      setIsSavingRemoteSource(false);
    }
  }

  async function handleDeleteRemoteSource() {
    if (!selectedRemoteSource) {
      return;
    }

    setIsSavingRemoteSource(true);
    setRemoteSourceError(null);

    try {
      await apiRequest<{ id: string; removed: boolean }>(`/remote-sources/${selectedRemoteSource.id}`, {
        method: "DELETE"
      });

      setRemoteSourceFeedback(`Removed ${selectedRemoteSource.name}.`);
      setRemoteDiscovery(null);
      setRemoteSourceForm(emptyRemoteSourceForm);
      await reloadRemoteSources(null);
    } catch (deleteError) {
      setRemoteSourceError(deleteError instanceof Error ? deleteError.message : "Failed to delete remote source.");
    } finally {
      setIsSavingRemoteSource(false);
    }
  }

  async function handleTestRemoteSource() {
    if (!selectedRemoteSource) {
      setRemoteSourceError("Save the source before testing it.");
      return;
    }

    setIsTestingRemoteSource(true);
    setRemoteSourceError(null);

    try {
      const result = await apiRequest<{ collectionCount: number; lastValidatedAt: number | null; videoCount: number }>(
        `/remote-sources/${selectedRemoteSource.id}/test`,
        {
          method: "POST"
        }
      );

      setRemoteSourceFeedback(
        `Connected to ${selectedRemoteSource.name}: ${result.videoCount} videos, ${result.collectionCount} collections.`
      );
      await reloadRemoteSources(selectedRemoteSource.id);
    } catch (testError) {
      setRemoteSourceError(testError instanceof Error ? testError.message : "Connection test failed.");
    } finally {
      setIsTestingRemoteSource(false);
    }
  }

  async function handleDiscoverRemoteSource() {
    if (!selectedRemoteSource) {
      setRemoteSourceError("Save the source before discovering collections and authors.");
      return;
    }

    setIsDiscoveringRemoteSource(true);
    setRemoteSourceError(null);

    try {
      const result = await apiRequest<RemoteSourceDiscovery>(`/remote-sources/${selectedRemoteSource.id}/discover`, {
        method: "POST"
      });

      setRemoteDiscovery(result);
      setRemoteSourceFeedback(`Discovered ${result.videoCount} videos from ${selectedRemoteSource.name}.`);
    } catch (discoverError) {
      setRemoteSourceError(discoverError instanceof Error ? discoverError.message : "Discovery failed.");
    } finally {
      setIsDiscoveringRemoteSource(false);
    }
  }

  function toggleCollection(collectionId: string) {
    setRemoteSourceForm((current) => ({
      ...current,
      collectionIds: current.collectionIds.includes(collectionId)
        ? current.collectionIds.filter((value) => value !== collectionId)
        : [...current.collectionIds, collectionId]
    }));
  }

  function toggleAuthor(authorKey: string) {
    setRemoteSourceForm((current) => ({
      ...current,
      authorKeys: current.authorKeys.includes(authorKey)
        ? current.authorKeys.filter((value) => value !== authorKey)
        : [...current.authorKeys, authorKey]
    }));
  }

  return (
    <section className="panel-page settings-page">
      <div className="section-header">
        <div>
          <p className="eyebrow">Settings</p>
          <h2>Settings</h2>
          <p className="sheet-copy">Playback and background jobs.</p>
        </div>
      </div>

      <article className="list-card settings-card">
        <div>
          <p className="eyebrow">Playback</p>
          <h3>Default playback behavior</h3>
          <p className="list-card__path">Control how the feed opens and what happens when a clip reaches the end.</p>
        </div>
        <div className="settings-controls">
          <div className="settings-control">
            <div className="settings-control__copy">
              <p className="settings-control__label">Sound on open</p>
              <p className="settings-control__help">
                {soundOnOpen ? "New feed sessions start with audio enabled." : "New feed sessions start muted."}
              </p>
            </div>
            <button
              aria-checked={soundOnOpen}
              className={soundOnOpen ? "settings-switch settings-switch--active" : "settings-switch"}
              onClick={() => setSoundOnOpen(!soundOnOpen)}
              role="switch"
              type="button"
            >
              <span className="settings-switch__thumb" />
            </button>
          </div>

          <label className="settings-control settings-control--stacked">
            <div className="settings-control__copy">
              <p className="settings-control__label">When playback finishes</p>
              <p className="settings-control__help">Choose whether the player stops, advances, or loops the current clip.</p>
            </div>
            <span className="settings-select-wrap">
              <select
                className="settings-select"
                onChange={(event) => setPlaybackCompletionMode(event.target.value as PlaybackCompletionMode)}
                value={playbackCompletionMode}
              >
                {playbackCompletionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="settings-select__icon" aria-hidden="true">
                <svg viewBox="0 0 20 20">
                  <path
                    d="M5.25 7.75 10 12.5l4.75-4.75"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.8"
                  />
                </svg>
              </span>
            </span>
          </label>
        </div>
      </article>

      <div className="stack-list">
        <article className="list-card">
          <div>
            <p className="eyebrow">Access</p>
            <h3>{authEnabled ? (authenticated ? "Session login enabled" : "Login required for remote sources") : "Auth disabled"}</h3>
            <p className="list-card__path">
              {authEnabled
                ? authenticated && sessionExpiresAt
                  ? `Expires at ${new Date(sessionExpiresAt * 1000).toLocaleString()}`
                  : "Remote source credentials are only exposed after a local admin login."
                : "Prototype mode bypasses login so the homepage can open directly into playback."}
            </p>
          </div>
          {authEnabled ? (
            authenticated ? (
              <button className="action-chip" onClick={() => void logout()} type="button">
                Sign out
              </button>
            ) : (
              <Link className="action-chip action-chip--primary" to="/login">
                Sign in
              </Link>
            )
          ) : (
            <span className="pill pill--solid">Auth off</span>
          )}
        </article>

        <article className="list-card settings-card">
          <div>
            <p className="eyebrow">MyTube Source</p>
            <h3>Remote read-only integration</h3>
            <p className="list-card__path">
              Configure a backend-managed MyTube source. Credentials stay on the server and are only used through
              MikMok proxies.
            </p>
          </div>
          {!authenticated ? (
            <div className="stack-list">
              <p className="plain-note">Sign in before creating, testing, or discovering remote sources.</p>
              <Link className="button" to="/login">
                Sign in to configure
              </Link>
            </div>
          ) : (
            <div className="settings-remote-source">
              <div className="settings-remote-source__toolbar">
                <div className="tag-row">
                  {remoteSources.map((source) => (
                    <button
                      className={
                        selectedRemoteSourceId === source.id
                          ? "action-chip action-chip--primary"
                          : "action-chip"
                      }
                      key={source.id}
                      onClick={() => {
                        setSelectedRemoteSourceId(source.id);
                        setRemoteDiscovery(null);
                        setRemoteSourceFeedback(null);
                        setRemoteSourceError(null);
                      }}
                      type="button"
                    >
                      {source.name}
                    </button>
                  ))}
                  <button
                    className={selectedRemoteSourceId === newRemoteSourceSelectionId ? "action-chip action-chip--primary" : "action-chip"}
                    onClick={() => {
                      setSelectedRemoteSourceId(newRemoteSourceSelectionId);
                      setRemoteSourceForm(emptyRemoteSourceForm);
                      setRemoteDiscovery(null);
                      setRemoteSourceFeedback(null);
                      setRemoteSourceError(null);
                    }}
                    type="button"
                  >
                    New source
                  </button>
                </div>
                {selectedRemoteSource ? (
                  <p className="plain-note">
                    {selectedRemoteSource.hasCredential ? "Credential saved" : "No credential saved"}
                    {selectedRemoteSource.lastValidatedAt
                      ? ` · validated ${new Date(selectedRemoteSource.lastValidatedAt * 1000).toLocaleString()}`
                      : ""}
                  </p>
                ) : (
                  <p className="plain-note">Create a source, then run test and discovery.</p>
                )}
              </div>

              <div className="form-stack">
                <label className="field">
                  Source name
                  <input
                    onChange={(event) => setRemoteSourceForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Studio MyTube"
                    value={remoteSourceForm.name}
                  />
                </label>

                <label className="field">
                  Base URL
                  <input
                    onChange={(event) => setRemoteSourceForm((current) => ({ ...current, baseUrl: event.target.value }))}
                    placeholder="https://mytube.example.com"
                    value={remoteSourceForm.baseUrl}
                  />
                </label>

                <label className="field">
                  Auth mode
                  <select
                    onChange={(event) =>
                      setRemoteSourceForm((current) => ({
                        ...current,
                        authMode: event.target.value as RemoteSourceAuthMode
                      }))
                    }
                    value={remoteSourceForm.authMode}
                  >
                    {authModeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                {remoteSourceForm.authMode !== "none" ? (
                  <label className="field">
                    Credential
                    <textarea
                      onChange={(event) =>
                        setRemoteSourceForm((current) => ({
                          ...current,
                          credential: event.target.value
                        }))
                      }
                      placeholder={
                        selectedRemoteSource?.hasCredential
                          ? "Leave blank to keep the saved credential"
                          : remoteSourceForm.authMode === "session_cookie"
                            ? "Paste the MyTube session cookie"
                            : "Paste the MyTube integration API key"
                      }
                      rows={3}
                      value={remoteSourceForm.credential}
                    />
                  </label>
                ) : null}

                <label className="field">
                  Scope mode
                  <select
                    onChange={(event) =>
                      setRemoteSourceForm((current) => ({
                        ...current,
                        scopeMode: event.target.value as RemoteSourceScopeMode
                      }))
                    }
                    value={remoteSourceForm.scopeMode}
                  >
                    {scopeModeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="settings-control">
                  <div className="settings-control__copy">
                    <p className="settings-control__label">Enabled</p>
                    <p className="settings-control__help">Disabled sources stay configured but do not contribute feed items.</p>
                  </div>
                  <button
                    aria-checked={remoteSourceForm.enabled}
                    className={remoteSourceForm.enabled ? "settings-switch settings-switch--active" : "settings-switch"}
                    onClick={() =>
                      setRemoteSourceForm((current) => ({
                        ...current,
                        enabled: !current.enabled
                      }))
                    }
                    role="switch"
                    type="button"
                  >
                    <span className="settings-switch__thumb" />
                  </button>
                </div>

                {remoteDiscovery && (remoteSourceForm.scopeMode === "collections" || remoteSourceForm.scopeMode === "mixed") ? (
                  <div className="settings-remote-source__picker">
                    <p className="settings-control__label">Collections</p>
                    <div className="settings-remote-source__options">
                      {remoteDiscovery.collections.map((collection) => (
                        <button
                          className={
                            remoteSourceForm.collectionIds.includes(collection.id)
                              ? "action-chip action-chip--primary"
                              : "action-chip"
                          }
                          key={collection.id}
                          onClick={() => toggleCollection(collection.id)}
                          type="button"
                        >
                          {collection.name} · {collection.videoCount}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {remoteDiscovery && (remoteSourceForm.scopeMode === "authors" || remoteSourceForm.scopeMode === "mixed") ? (
                  <div className="settings-remote-source__picker">
                    <p className="settings-control__label">Authors</p>
                    <div className="settings-remote-source__options settings-remote-source__options--authors">
                      {remoteDiscovery.authors.map((author) => (
                        <button
                          className={
                            remoteSourceForm.authorKeys.includes(author.key)
                              ? "settings-remote-source__author settings-remote-source__author--active"
                              : "settings-remote-source__author"
                          }
                          key={author.key}
                          onClick={() => toggleAuthor(author.key)}
                          type="button"
                        >
                          <span className="settings-remote-source__author-avatar" aria-hidden="true">
                            {author.avatarUrl ? <img alt={author.name} src={author.avatarUrl} /> : <span>{author.name.slice(0, 1).toUpperCase()}</span>}
                          </span>
                          <span>
                            {author.name} · {author.videoCount}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="settings-remote-source__actions">
                <button className="button" disabled={isSavingRemoteSource} onClick={() => void handleSaveRemoteSource()} type="button">
                  {isSavingRemoteSource ? "Saving..." : selectedRemoteSource ? "Save changes" : "Create source"}
                </button>
                <button
                  className="button--ghost"
                  disabled={isTestingRemoteSource || !selectedRemoteSource}
                  onClick={() => void handleTestRemoteSource()}
                  type="button"
                >
                  {isTestingRemoteSource ? "Testing..." : "Test connection"}
                </button>
                <button
                  className="button--ghost"
                  disabled={isDiscoveringRemoteSource || !selectedRemoteSource}
                  onClick={() => void handleDiscoverRemoteSource()}
                  type="button"
                >
                  {isDiscoveringRemoteSource ? "Discovering..." : "Discover authors & collections"}
                </button>
                {selectedRemoteSource ? (
                  <button className="button--ghost" disabled={isSavingRemoteSource} onClick={() => void handleDeleteRemoteSource()} type="button">
                    Remove source
                  </button>
                ) : null}
              </div>

              {isLoadingRemoteSources ? <p className="plain-note">Loading remote sources...</p> : null}
              {remoteSourceError ? <p className="error-text">{remoteSourceError}</p> : null}
              {remoteSourceFeedback ? <p className="plain-note">{remoteSourceFeedback}</p> : null}
            </div>
          )}
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
