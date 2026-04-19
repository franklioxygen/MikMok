import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent, VideoHTMLAttributes, WheelEvent } from "react";

import { apiRequest } from "../api/client";
import { useUiStore } from "../store/uiStore";

type FeedVideo = {
  folderName: string;
  id: string;
  mimeType: string;
  sourceName: string;
  sourceSize: number;
  streamUrl: string;
  title: string;
  updatedAt: number;
};

type FeedVideoDetails = {
  folderName: string;
  folderPath: string;
  id: string;
  lastPlayedAt: number | null;
  mimeType: string;
  playCount: number;
  playbackStatus: string;
  resumePositionSeconds: number;
  sourceName: string;
  sourceSize: number;
  streamUrl: string;
  title: string;
  updatedAt: number;
};

type PlaybackSnapshot = {
  id: string;
  lastPlayedAt: number | null;
  playCount: number;
  resumePositionSeconds: number;
};

const accentClasses = ["ember", "shore", "canopy"] as const;
const stageTransitionDurationMs = 220;

type StageDirection = "next" | "prev" | "snap" | null;

function FeedStageCard({
  accent,
  clip,
  isActive,
  isMuted,
  videoProps,
  videoRef
}: {
  accent: (typeof accentClasses)[number];
  clip: FeedVideo;
  isActive: boolean;
  isMuted: boolean;
  videoProps?: VideoHTMLAttributes<HTMLVideoElement>;
  videoRef?: (node: HTMLVideoElement | null) => void;
}) {
  return (
    <article aria-hidden={!isActive} className={`feed-stage-card feed-stage-card--${accent}`}>
      <video
        autoPlay={isActive}
        className="feed-stage-card__video"
        loop={isActive}
        muted={isActive ? isMuted : true}
        playsInline
        preload={isActive ? "auto" : "metadata"}
        ref={videoRef}
        src={clip.streamUrl}
        {...videoProps}
      />
      <div className="feed-stage-card__veil" />
    </article>
  );
}

export function FeedPage() {
  const activeFeedIndex = useUiStore((state) => state.activeFeedIndex);
  const isMuted = useUiStore((state) => state.isMuted);
  const setActiveFeedIndex = useUiStore((state) => state.setActiveFeedIndex);
  const toggleMute = useUiStore((state) => state.toggleMute);
  const [clips, setClips] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeClipDetails, setActiveClipDetails] = useState<FeedVideoDetails | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favoritesReady, setFavoritesReady] = useState(false);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [showInfoCard, setShowInfoCard] = useState(false);
  const [stageTransition, setStageTransition] = useState<StageDirection>(null);
  const pointerStartYRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const lastGestureAtRef = useRef(0);
  const transitionTimerRef = useRef<number | null>(null);
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);
  const playStartedForVideoIdRef = useRef<string | null>(null);
  const progressReportedAtSecondRef = useRef<number>(0);
  const resumeAppliedForVideoIdRef = useRef<string | null>(null);

  useEffect(() => {
    try {
      const storedFavoriteIds = window.localStorage.getItem("mikmok.favorite-video-ids");

      if (storedFavoriteIds) {
        const parsedIds = JSON.parse(storedFavoriteIds) as unknown;

        if (Array.isArray(parsedIds)) {
          setFavoriteIds(parsedIds.filter((value): value is string => typeof value === "string"));
        }
      }
    } catch {
      // Ignore local storage read failures and keep ephemeral favorites.
    } finally {
      setFavoritesReady(true);
    }
  }, []);

  useEffect(() => {
    if (!favoritesReady) {
      return;
    }

    try {
      window.localStorage.setItem("mikmok.favorite-video-ids", JSON.stringify(favoriteIds));
    } catch {
      // Ignore local storage write failures and keep in-memory favorites.
    }
  }, [favoriteIds, favoritesReady]);

  useEffect(() => {
    let cancelled = false;

    async function loadFeed() {
      try {
        const videos = await apiRequest<FeedVideo[]>("/videos/feed");

        if (cancelled) {
          return;
        }

        setClips(videos);
        setError(null);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load videos.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadFeed();

    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedFeedIndex = useMemo(() => {
    if (clips.length === 0) {
      return 0;
    }

    return ((activeFeedIndex % clips.length) + clips.length) % clips.length;
  }, [activeFeedIndex, clips.length]);

  const activeClip = clips[normalizedFeedIndex] ?? null;
  const activeClipIsFavorite = activeClip ? favoriteIds.includes(activeClip.id) : false;
  const activeAccent = accentClasses[normalizedFeedIndex % accentClasses.length]!;
  const previousClip = clips.length > 1 ? clips[(normalizedFeedIndex - 1 + clips.length) % clips.length] ?? null : activeClip;
  const nextClip = clips.length > 1 ? clips[(normalizedFeedIndex + 1) % clips.length] ?? null : activeClip;

  const stageCards = activeClip
    ? [
        {
          accent: accentClasses[(normalizedFeedIndex - 1 + accentClasses.length) % accentClasses.length]!,
          clip: previousClip ?? activeClip,
          isActive: false,
          key: `prev-${previousClip?.id ?? activeClip.id}-${normalizedFeedIndex}`
        },
        {
          accent: activeAccent,
          clip: activeClip,
          isActive: true,
          key: `current-${activeClip.id}-${normalizedFeedIndex}`
        },
        {
          accent: accentClasses[(normalizedFeedIndex + 1) % accentClasses.length]!,
          clip: nextClip ?? activeClip,
          isActive: false,
          key: `next-${nextClip?.id ?? activeClip.id}-${normalizedFeedIndex}`
        }
      ]
    : [];

  useEffect(() => {
    if (!activeClip) {
      setActiveClipDetails(null);
      return;
    }

    const activeClipId = activeClip.id;
    let cancelled = false;

    async function loadDetails() {
      try {
        const details = await apiRequest<FeedVideoDetails>(`/videos/${activeClipId}`);

        if (!cancelled) {
          setActiveClipDetails(details);
        }
      } catch {
        if (!cancelled) {
          setActiveClipDetails(null);
        }
      }
    }

    playStartedForVideoIdRef.current = null;
    progressReportedAtSecondRef.current = 0;
    resumeAppliedForVideoIdRef.current = null;

    void loadDetails();

    return () => {
      cancelled = true;
    };
  }, [activeClip?.id]);

  function canAdvanceGesture() {
    const now = Date.now();

    if (stageTransition) {
      return false;
    }

    if (now - lastGestureAtRef.current < 360) {
      return false;
    }

    lastGestureAtRef.current = now;
    return true;
  }

  function jumpToClip(index: number) {
    if (clips.length === 0) {
      return;
    }

    const nextIndex = ((index % clips.length) + clips.length) % clips.length;

    startTransition(() => {
      setActiveFeedIndex(nextIndex);
    });
  }

  function clearPendingTransition() {
    if (transitionTimerRef.current !== null) {
      window.clearTimeout(transitionTimerRef.current);
      transitionTimerRef.current = null;
    }
  }

  function finishStageTransition(direction: Exclude<StageDirection, null>) {
    clearPendingTransition();
    setStageTransition(direction);

    transitionTimerRef.current = window.setTimeout(() => {
      if (direction === "next") {
        jumpToClip(normalizedFeedIndex + 1);
      }

      if (direction === "prev") {
        jumpToClip(normalizedFeedIndex - 1);
      }

      setDragOffsetY(0);
      setStageTransition(null);
      transitionTimerRef.current = null;
    }, stageTransitionDurationMs);
  }

  function goToNextClip() {
    if (!canAdvanceGesture()) {
      return;
    }

    finishStageTransition("next");
  }

  function goToPreviousClip() {
    if (!canAdvanceGesture()) {
      return;
    }

    finishStageTransition("prev");
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    if (clips.length < 2 || stageTransition) {
      return;
    }

    activePointerIdRef.current = event.pointerId;
    pointerStartYRef.current = event.clientY;
    setDragOffsetY(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    if (activePointerIdRef.current !== event.pointerId || pointerStartYRef.current === null) {
      return;
    }

    const deltaY = event.clientY - pointerStartYRef.current;
    const maxOffset = Math.min(window.innerHeight * 0.32, 220);
    const clampedOffset = Math.max(Math.min(deltaY, maxOffset), -maxOffset);

    setDragOffsetY(clampedOffset);
  }

  function releasePointer(event: PointerEvent<HTMLElement>) {
    if (activePointerIdRef.current !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    activePointerIdRef.current = null;
    pointerStartYRef.current = null;

    if (Math.abs(dragOffsetY) < 72) {
      if (dragOffsetY !== 0) {
        finishStageTransition("snap");
      }

      return;
    }

    if (dragOffsetY < 0) {
      goToNextClip();
      return;
    }

    goToPreviousClip();
  }

  function handleWheel(event: WheelEvent<HTMLElement>) {
    if (stageTransition || clips.length < 2) {
      return;
    }

    if (Math.abs(event.deltaY) < 18) {
      return;
    }

    event.preventDefault();

    if (event.deltaY > 0) {
      goToNextClip();
      return;
    }

    goToPreviousClip();
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        goToNextClip();
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        goToPreviousClip();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [normalizedFeedIndex, clips.length, stageTransition]);

  useEffect(() => {
    return () => {
      clearPendingTransition();
    };
  }, []);

  useEffect(() => {
    if (!activeClipDetails || !activeVideoRef.current || resumeAppliedForVideoIdRef.current === activeClipDetails.id) {
      return;
    }

    if (activeVideoRef.current.readyState >= 1) {
      handleLoadedMetadata();
    }
  }, [activeClipDetails]);

  useEffect(() => {
    const currentClipId = activeClip?.id;

    return () => {
      if (!currentClipId || !activeVideoRef.current) {
        return;
      }

      const currentTime = activeVideoRef.current.currentTime;

      if (!Number.isFinite(currentTime) || currentTime <= 0) {
        return;
      }

      void apiRequest(`/videos/${currentClipId}/progress`, {
        method: "POST",
        body: JSON.stringify({
          completed: false,
          positionSeconds: currentTime
        })
      }).catch(() => undefined);
    };
  }, [activeClip?.id]);

  function handleActiveVideoPlay() {
    if (!activeClip || playStartedForVideoIdRef.current === activeClip.id) {
      return;
    }

    playStartedForVideoIdRef.current = activeClip.id;

    void apiRequest<PlaybackSnapshot>(`/videos/${activeClip.id}/play`, {
      method: "POST",
      body: JSON.stringify({
        positionSeconds: activeVideoRef.current?.currentTime ?? 0
      })
    })
      .then((snapshot) => {
        setActiveClipDetails((current) =>
          current && current.id === snapshot.id
            ? {
                ...current,
                lastPlayedAt: snapshot.lastPlayedAt,
                playCount: snapshot.playCount,
                resumePositionSeconds: snapshot.resumePositionSeconds
              }
            : current
        );
      })
      .catch(() => undefined);
  }

  function handleLoadedMetadata() {
    if (!activeClip || !activeVideoRef.current || !activeClipDetails) {
      return;
    }

    if (resumeAppliedForVideoIdRef.current === activeClip.id) {
      return;
    }

    const resumePosition = activeClipDetails.resumePositionSeconds;
    const duration = activeVideoRef.current.duration;

    if (!Number.isFinite(duration) || resumePosition <= 0 || resumePosition >= Math.max(duration - 1, 1)) {
      resumeAppliedForVideoIdRef.current = activeClip.id;
      return;
    }

    activeVideoRef.current.currentTime = resumePosition;
    resumeAppliedForVideoIdRef.current = activeClip.id;
    progressReportedAtSecondRef.current = Math.floor(resumePosition);
  }

  function handleActiveVideoTimeUpdate() {
    if (!activeClip || !activeVideoRef.current) {
      return;
    }

    const currentSecond = Math.floor(activeVideoRef.current.currentTime);

    if (currentSecond < progressReportedAtSecondRef.current) {
      progressReportedAtSecondRef.current = currentSecond;
      return;
    }

    if (currentSecond - progressReportedAtSecondRef.current < 5) {
      return;
    }

    progressReportedAtSecondRef.current = currentSecond;

    void apiRequest<PlaybackSnapshot>(`/videos/${activeClip.id}/progress`, {
      method: "POST",
      body: JSON.stringify({
        completed: false,
        positionSeconds: currentSecond
      })
    })
      .then((snapshot) => {
        setActiveClipDetails((current) =>
          current && current.id === snapshot.id
            ? {
                ...current,
                lastPlayedAt: snapshot.lastPlayedAt,
                playCount: snapshot.playCount,
                resumePositionSeconds: snapshot.resumePositionSeconds
              }
            : current
        );
      })
      .catch(() => undefined);
  }

  function handleFavoriteToggle() {
    if (!activeClip) {
      return;
    }

    setFavoriteIds((current) =>
      current.includes(activeClip.id) ? current.filter((videoId) => videoId !== activeClip.id) : [...current, activeClip.id]
    );
  }

  const activeVideoProps: VideoHTMLAttributes<HTMLVideoElement> | undefined = activeClip
    ? {
        onLoadedMetadata: handleLoadedMetadata,
        onPlay: handleActiveVideoPlay,
        onTimeUpdate: handleActiveVideoTimeUpdate
      }
    : undefined;

  if (loading) {
    return (
      <section className="feed-screen feed-screen--ember">
        <div className="feed-screen__ambient" />
        <div className="feed-screen__viewport">
          <div className="feed-screen__empty">
            <p className="eyebrow">Loading Feed</p>
            <h1>Scanning your mounted video sources</h1>
            <p>Looking for the first playable clip in your registered folders.</p>
          </div>
        </div>
      </section>
    );
  }

  if (error || !activeClip) {
    return (
      <section className="feed-screen feed-screen--shore">
        <div className="feed-screen__ambient" />
        <div className="feed-screen__viewport">
          <div className="feed-screen__empty">
            <p className="eyebrow">No Video Ready</p>
            <h1>Homepage could not open a playable clip.</h1>
            <p>{error ?? "No supported video files were found in the mounted folders."}</p>
            <p>Open Folders and add a mount like `/mounts`, then scan it into the feed.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={`feed-screen feed-screen--${activeAccent}`}>
      <div className="feed-screen__ambient" />
      <div
        className="feed-screen__viewport"
        onPointerCancel={releasePointer}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={releasePointer}
        onWheel={handleWheel}
      >
        <div className="feed-screen__visual">
          <div
            className={stageTransition ? "feed-stage feed-stage--transitioning" : "feed-stage"}
            style={{
              transform:
                stageTransition === "next"
                  ? "translateY(-200%)"
                  : stageTransition === "prev"
                    ? "translateY(0%)"
                    : stageTransition === "snap"
                      ? "translateY(-100%)"
                      : `translateY(calc(-100% + ${dragOffsetY}px))`
            }}
          >
            {stageCards.map((card) => (
              <FeedStageCard
                accent={card.accent}
                clip={card.clip}
                isActive={card.isActive}
                isMuted={isMuted}
                key={card.key}
                videoProps={card.isActive ? activeVideoProps : undefined}
                videoRef={
                  card.isActive
                    ? (node) => {
                        activeVideoRef.current = node;
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </div>
        <div className="feed-screen__side-actions" aria-label="Video actions">
          <button
            aria-label={activeClipIsFavorite ? "Remove from favorites" : "Add to favorites"}
            aria-pressed={activeClipIsFavorite}
            className={activeClipIsFavorite ? "feed-side-action feed-side-action--active" : "feed-side-action"}
            onClick={handleFavoriteToggle}
            type="button"
          >
            <span className="feed-side-action__badge">{activeClipIsFavorite ? "Saved" : "Fav"}</span>
            <span className="feed-side-action__label">{activeClipIsFavorite ? "Favorited" : "Favorite"}</span>
          </button>
          <button
            aria-label={showInfoCard ? "Hide clip details" : "Show clip details"}
            aria-pressed={showInfoCard}
            className={showInfoCard ? "feed-side-action feed-side-action--active" : "feed-side-action"}
            onClick={() => setShowInfoCard((current) => !current)}
            type="button"
          >
            <span className="feed-side-action__badge">Info</span>
            <span className="feed-side-action__label">{showInfoCard ? "Hide card" : "Show card"}</span>
          </button>
          <button
            aria-label={isMuted ? "Turn sound on" : "Mute sound"}
            aria-pressed={!isMuted}
            className={!isMuted ? "feed-side-action feed-side-action--active" : "feed-side-action"}
            onClick={toggleMute}
            type="button"
          >
            <span className="feed-side-action__badge">{isMuted ? "Mute" : "Audio"}</span>
            <span className="feed-side-action__label">{isMuted ? "Sound off" : "Sound on"}</span>
          </button>
        </div>
        <div className="feed-screen__bottom">
          <div
            className="feed-screen__progress"
            aria-label="Recommended clips queue"
            style={{ gridTemplateColumns: `repeat(${clips.length}, minmax(0, 1fr))` }}
          >
            {clips.map((clip, index) => (
              <button
                key={clip.id}
                aria-label={`Open ${clip.title}`}
                className={index === normalizedFeedIndex ? "feed-screen__segment feed-screen__segment--active" : "feed-screen__segment"}
                onClick={() => jumpToClip(index)}
                type="button"
              />
            ))}
          </div>

          {showInfoCard ? (
            <div className="feed-panel">
              <div className="feed-panel__meta">
                <p className="eyebrow">For You</p>
                <h1>{activeClip.title}</h1>
                <p className="feed-panel__caption">
                  {activeClip.folderName} source clip ready for playback. Swipe vertically to keep browsing.
                </p>
                <div className="tag-row">
                  <span className="pill">#{activeClip.folderName}</span>
                  <span className="pill">{activeClip.mimeType}</span>
                  <span className="pill">{Math.round(activeClip.sourceSize / 1024 / 1024)} MB</span>
                  {activeClipIsFavorite ? <span className="pill pill--solid">favorited</span> : null}
                </div>
                <p className="feed-panel__subline">
                  {activeClip.sourceName} · updated {new Date(activeClip.updatedAt * 1000).toLocaleString()}
                </p>
                <p className="feed-panel__subline">
                  {activeClipDetails
                    ? `${activeClipDetails.playCount} plays · resume ${Math.round(activeClipDetails.resumePositionSeconds)}s`
                    : "Loading playback state..."}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
