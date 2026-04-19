import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { apiRequest } from "../api/client";
import { useUiStore } from "../store/uiStore";

type FavoriteVideo = {
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

export function FavoritesPage() {
  const navigate = useNavigate();
  const favoriteIds = useUiStore((state) => state.favoriteIds);
  const toggleFavoriteId = useUiStore((state) => state.toggleFavoriteId);
  const [videos, setVideos] = useState<FavoriteVideo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadVideos() {
      setIsLoading(true);

      try {
        const result = await apiRequest<FavoriteVideo[]>("/videos/feed");

        if (!cancelled) {
          setVideos(result);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load favorites.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadVideos();

    return () => {
      cancelled = true;
    };
  }, []);

  const favoriteVideos = useMemo(() => {
    const videoMap = new Map(videos.map((video) => [video.id, video] as const));
    return favoriteIds.map((favoriteId) => videoMap.get(favoriteId)).filter((video): video is FavoriteVideo => Boolean(video));
  }, [favoriteIds, videos]);

  return (
    <section className="panel-page">
      <div className="section-header">
        <div>
          <p className="eyebrow">Favorites</p>
          <h2>Favorites</h2>
          <p className="sheet-copy">Saved clips.</p>
        </div>
        <span className="pill">{favoriteVideos.length} saved</span>
      </div>

      <div className="stack-list">
        {error ? (
          <article className="list-card">
            <p>{error}</p>
          </article>
        ) : null}

        {isLoading ? (
          <article className="list-card">
            <p>Loading favorite videos...</p>
          </article>
        ) : null}

        {!isLoading && favoriteVideos.length === 0 ? (
          <article className="list-card">
            <div>
              <h3>No favorites yet</h3>
              <p className="list-card__path">Tap the heart button in the feed to save videos here.</p>
            </div>
          </article>
        ) : null}

        {favoriteVideos.map((video) => (
          <article key={video.id} className="list-card folder-video-card">
            {video.thumbnailSmUrl ? (
              <img alt={video.title} className="folder-video-page__thumb" loading="lazy" src={video.thumbnailSmUrl} />
            ) : null}
            <div className="folder-video-card__body">
              <h3>{video.title}</h3>
              <p className="list-card__path">{video.sourceName}</p>
              <p className="list-card__path">
                #{video.folderName} · {video.mimeType} · {Math.round(video.sourceSize / 1024 / 1024)} MB
              </p>
              <p className="list-card__path">
                {video.durationSeconds ? `${Math.round(video.durationSeconds)}s` : "duration unknown"}
                {video.width && video.height ? ` · ${video.width}×${video.height}` : ""}
              </p>
            </div>
            <div className="folder-video-page__meta">
              <span className="pill">{video.playbackStatus}</span>
              <button
                className="action-chip"
                onClick={() => {
                  toggleFavoriteId(video.id);
                }}
                type="button"
              >
                Remove
              </button>
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
