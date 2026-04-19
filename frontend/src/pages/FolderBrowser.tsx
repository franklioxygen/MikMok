import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { apiRequest } from "../api/client";

type Folder = {
  autoScan: boolean;
  id: string;
  isActive: boolean;
  isSystem: boolean;
  lastScannedAt: number | null;
  maxDepth: number | null;
  mountPath: string;
  name: string;
  scanIntervalMinutes: number | null;
  scanStatus: string;
  videoCount: number;
};

type ScanResult = {
  id: string;
  lastScannedAt: number | null;
  mountPath: string;
  name: string;
  scanStatus: string;
  videoCount: number;
};

const emptyForm = {
  mountPath: "",
  name: ""
};

export function FolderBrowserPage() {
  const [folders, setFolders] = useState<Folder[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadFolders() {
      setIsLoading(true);

      try {
        const result = await apiRequest<Folder[]>("/folders");

        if (!cancelled) {
          setFolders(result);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load folders.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadFolders();

    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const mountedFolder = await apiRequest<Folder>("/folders", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          mountPath: form.mountPath
        })
      });

      setFeedback(`Mounted ${mountedFolder.name} with ${mountedFolder.videoCount} videos.`);
      setForm(emptyForm);
      setReloadKey((current) => current + 1);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to mount folder.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleScan(folderId: string) {
    setActiveFolderId(folderId);
    setError(null);

    try {
      const scanResult = await apiRequest<ScanResult>(`/folders/${folderId}/scan`, {
        method: "POST"
      });

      setFeedback(`Scanned ${scanResult.name}: ${scanResult.videoCount} videos ready.`);
      setReloadKey((current) => current + 1);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Failed to scan folder.");
    } finally {
      setActiveFolderId(null);
    }
  }

  async function handleDelete(folderId: string) {
    setActiveFolderId(folderId);
    setError(null);

    try {
      await apiRequest<{ id: string; removed: boolean }>(`/folders/${folderId}`, {
        method: "DELETE"
      });

      const folderName = folders.find((folder) => folder.id === folderId)?.name ?? "folder";
      setFeedback(`Removed ${folderName} from mounted sources.`);
      setReloadKey((current) => current + 1);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to remove folder.");
    } finally {
      setActiveFolderId(null);
    }
  }

  return (
    <section className="sheet-page">
      <div className="section-header">
        <div>
          <p className="eyebrow">Mounted Sources</p>
          <h2>Register folders, then scan them into the feed.</h2>
          <p className="sheet-copy">Feed candidates now come from persisted mounted folders, not from raw env roots alone.</p>
        </div>
        <span className="pill">Step 2</span>
      </div>

      <form className="list-card folder-browser__create" onSubmit={(event) => void handleSubmit(event)}>
        <div className="form-stack folder-browser__form">
          <label className="field">
            Optional label
            <input
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Travel Shorts"
              value={form.name}
            />
          </label>
          <label className="field">
            Mount path
            <input
              onChange={(event) => setForm((current) => ({ ...current, mountPath: event.target.value }))}
              placeholder="/mounts"
              required
              value={form.mountPath}
            />
          </label>
        </div>
        <div className="folder-browser__actions">
          <p className="sheet-copy">The path must live under an allowed mount root on the backend.</p>
          <button className="action-chip action-chip--primary" disabled={isSubmitting} type="submit">
            {isSubmitting ? "Mounting..." : "Add mount"}
          </button>
        </div>
      </form>

      <div className="stack-list">
        {error ? (
          <article className="list-card">
            <p>{error}</p>
          </article>
        ) : null}
        {feedback ? (
          <article className="list-card">
            <p>{feedback}</p>
          </article>
        ) : null}
        {isLoading ? (
          <article className="list-card">
            <p>Loading mounted folders...</p>
          </article>
        ) : null}
        {!isLoading && folders.length === 0 ? (
          <article className="list-card">
            <p>No mounted folders yet. Add one above to populate the feed.</p>
          </article>
        ) : null}
        {folders.map((folder) => (
          <article key={folder.id} className="list-card">
            <div>
              <h3>{folder.name}</h3>
              <p className="list-card__path">{folder.mountPath}</p>
              <p className="list-card__path">
                {folder.isSystem ? "system source · " : ""}
                {folder.scanStatus} · {folder.videoCount} videos
                {folder.lastScannedAt ? ` · scanned ${new Date(folder.lastScannedAt * 1000).toLocaleString()}` : ""}
              </p>
            </div>
            <div className="folder-browser__actions">
              <Link className="action-chip action-chip--primary" to={`/folders/${folder.id}`}>
                Open videos
              </Link>
              <button
                className="action-chip"
                disabled={activeFolderId === folder.id}
                onClick={() => void handleScan(folder.id)}
                type="button"
              >
                {activeFolderId === folder.id ? "Working..." : "Scan now"}
              </button>
              {!folder.isSystem ? (
                <button
                  className="action-chip"
                  disabled={activeFolderId === folder.id}
                  onClick={() => void handleDelete(folder.id)}
                  type="button"
                >
                  Remove
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
