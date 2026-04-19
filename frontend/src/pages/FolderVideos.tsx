import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

type FolderVideo = {
  durationSeconds: number | null;
  folderId: string;
  folderName: string;
  height: number | null;
  id: string;
  mimeType: string;
  playCount: number;
  playbackStatus: string;
  resumePositionSeconds: number;
  sourceName: string;
  sourceSize: number;
  streamUrl: string;
  thumbnailSmUrl: string | null;
  title: string;
  updatedAt: number;
  width: number | null;
};

type FolderVideosResponseMeta = {
  folderName: string;
  total: number;
};

export function FolderVideosPage() {
  const { id } = useParams();
  const [videos, setVideos] = useState<FolderVideo[]>([]);
  const [meta, setMeta] = useState<FolderVideosResponseMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("Missing folder id.");
      return;
    }

    let cancelled = false;

    async function loadFolderVideos() {
      try {
        const response = await fetch(`/api/folders/${id}/videos`, {
          credentials: "include"
        });
        const payload = (await response.json()) as {
          data: FolderVideo[];
          meta?: FolderVideosResponseMeta;
          success: boolean;
        };

        if (!response.ok || !payload.success) {
          throw new Error("Failed to load folder videos.");
        }

        if (!cancelled) {
          setVideos(payload.data);
          setMeta(payload.meta ?? null);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load folder videos.");
        }
      }
    }

    void loadFolderVideos();

    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <section className="sheet-page">
      <div className="section-header">
        <div>
          <p className="eyebrow">Folder Videos</p>
          <h2>{meta?.folderName ?? "Loading folder..."}</h2>
          <p className="sheet-copy">This view uses the same mounted files as the main feed, but groups them by source folder.</p>
        </div>
        <Link className="action-chip" to="/folders">
          Back to folders
        </Link>
      </div>

      <div className="stack-list">
        {error ? <article className="list-card"><p>{error}</p></article> : null}
        {videos.map((video) => (
          <article key={video.id} className="list-card folder-video-card">
            {video.thumbnailSmUrl ? (
              <img alt={video.title} className="folder-video-page__thumb" loading="lazy" src={video.thumbnailSmUrl} />
            ) : null}
            <div className="folder-video-card__body">
              <h3>{video.title}</h3>
              <p className="list-card__path">{video.sourceName}</p>
              <p className="list-card__path">
                {video.mimeType} · {video.playbackStatus} · {Math.round(video.sourceSize / 1024 / 1024)} MB · updated{" "}
                {new Date(video.updatedAt * 1000).toLocaleString()}
              </p>
              <p className="list-card__path">
                {video.durationSeconds ? `${Math.round(video.durationSeconds)}s` : "duration unknown"}
                {video.width && video.height ? ` · ${video.width}×${video.height}` : ""}
              </p>
            </div>
            <div className="folder-video-page__meta">
              <span className="pill">{video.playCount} plays</span>
              <span className="pill">resume {Math.round(video.resumePositionSeconds)}s</span>
              <a
                aria-disabled={video.playbackStatus !== "direct" && video.playbackStatus !== "ready"}
                className="action-chip action-chip--primary"
                href={video.playbackStatus === "direct" || video.playbackStatus === "ready" ? video.streamUrl : undefined}
              >
                Open stream
              </a>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
