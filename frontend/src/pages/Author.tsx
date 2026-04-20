import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { apiRequest } from "../api/client";

type AuthorSummary = {
  avatarUrl: string | null;
  id: string;
  name: string;
  sourceId: string;
  sourceName: string;
  videoCount: number;
};

type AuthorVideo = {
  author: {
    avatarUrl: string | null;
    id: string;
    name: string;
  } | null;
  collections: Array<{
    id: string;
    name: string;
  }>;
  durationSeconds: number | null;
  folderName: string;
  height: number | null;
  id: string;
  mimeType: string;
  playbackStatus: string;
  sourceName: string;
  sourceSize: number;
  thumbnailSmUrl: string | null;
  title: string;
  updatedAt: number;
  width: number | null;
};

function formatFileSize(sourceSize: number): string {
  if (sourceSize >= 1024 * 1024 * 1024) {
    return `${(sourceSize / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  return `${Math.max(sourceSize / 1024 / 1024, 0.1).toFixed(1)} MB`;
}

export function AuthorPage() {
  const { authorKey } = useParams();
  const navigate = useNavigate();
  const [author, setAuthor] = useState<AuthorSummary | null>(null);
  const [videos, setVideos] = useState<AuthorVideo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const currentAuthorKey = authorKey;

    if (!currentAuthorKey) {
      setError("Missing author id.");
      setIsLoading(false);
      return;
    }

    const resolvedAuthorKey = currentAuthorKey;

    let cancelled = false;

    async function loadAuthorPage() {
      setIsLoading(true);

      try {
        const [nextAuthor, nextVideos] = await Promise.all([
          apiRequest<AuthorSummary>(`/integrations/mytube/authors/${encodeURIComponent(resolvedAuthorKey)}`),
          apiRequest<AuthorVideo[]>(`/integrations/mytube/authors/${encodeURIComponent(resolvedAuthorKey)}/videos`)
        ]);

        if (!cancelled) {
          setAuthor(nextAuthor);
          setVideos(nextVideos);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load author page.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadAuthorPage();

    return () => {
      cancelled = true;
    };
  }, [authorKey]);

  return (
    <section className="panel-page author-page">
      <div className="section-header">
        <div>
          <p className="eyebrow">Author</p>
          <h2>{author?.name ?? "Loading author..."}</h2>
          <p className="sheet-copy">
            {author ? `${author.sourceName} · ${author.videoCount} videos` : "Loading videos from the remote source."}
          </p>
        </div>
        <Link className="action-chip" to="/feed">
          Back to feed
        </Link>
      </div>

      {author ? (
        <article className="list-card author-page__hero">
          <div className="author-page__hero-copy">
            <div className="author-page__hero-avatar" aria-hidden="true">
              {author.avatarUrl ? <img alt={author.name} src={author.avatarUrl} /> : <span>{author.name.slice(0, 1).toUpperCase()}</span>}
            </div>
            <div>
              <h3>{author.name}</h3>
              <p className="list-card__path">
                {author.sourceName} · {author.videoCount} videos
              </p>
            </div>
          </div>
          <span className="pill pill--solid">MyTube</span>
        </article>
      ) : null}

      <div className="stack-list">
        {error ? (
          <article className="list-card">
            <p>{error}</p>
          </article>
        ) : null}

        {isLoading ? (
          <article className="list-card">
            <p>Loading author videos...</p>
          </article>
        ) : null}

        {!isLoading && !error && videos.length === 0 ? (
          <article className="list-card">
            <p>No videos match this author in the current remote-source scope.</p>
          </article>
        ) : null}

        {videos.map((video) => (
          <article key={video.id} className="list-card folder-video-card">
            {video.thumbnailSmUrl ? (
              <img alt={video.title} className="folder-video-page__thumb" loading="lazy" src={video.thumbnailSmUrl} />
            ) : null}
            <div className="folder-video-card__body">
              <h3>{video.title}</h3>
              <p className="list-card__path">{video.sourceName}</p>
              <p className="list-card__path">
                {video.folderName} · {video.mimeType} · {formatFileSize(video.sourceSize)}
              </p>
              <p className="list-card__path">
                {video.durationSeconds ? `${Math.round(video.durationSeconds)}s` : "duration unknown"}
                {video.width && video.height ? ` · ${video.width}×${video.height}` : ""}
              </p>
              {video.collections.length > 0 ? (
                <div className="tag-row">
                  {video.collections.map((collection) => (
                    <span key={collection.id} className="pill">
                      {collection.name}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
            <div className="folder-video-page__meta">
              <span className="pill">{video.playbackStatus}</span>
              <button
                className="action-chip action-chip--primary"
                onClick={() => {
                  navigate(`/feed?video=${encodeURIComponent(video.id)}`);
                }}
                type="button"
              >
                Play
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
