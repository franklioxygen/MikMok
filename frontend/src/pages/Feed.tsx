import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, PointerEvent, VideoHTMLAttributes, WheelEvent } from "react";

import { apiBaseUrl, apiRequest } from "../api/client";
import { useUiStore } from "../store/uiStore";

type FeedVideo = {
  durationSeconds: number | null;
  folderName: string;
  height: number | null;
  id: string;
  mimeType: string;
  playbackStatus: string;
  sourceName: string;
  sourceSize: number;
  streamUrl: string;
  thumbnailSmUrl: string | null;
  title: string;
  updatedAt: number;
  width: number | null;
};

type FeedVideoDetails = {
  audioCodec: string | null;
  durationSeconds: number | null;
  fps: number | null;
  folderName: string;
  folderPath: string;
  height: number | null;
  id: string;
  lastPlayedAt: number | null;
  mimeType: string;
  playCount: number;
  playbackStatus: string;
  resumePositionSeconds: number;
  sourceName: string;
  sourceSize: number;
  streamUrl: string;
  thumbnailSmUrl: string | null;
  thumbnailUrl: string | null;
  title: string;
  updatedAt: number;
  videoCodec: string | null;
  width: number | null;
};

type PlaybackSnapshot = {
  id: string;
  lastPlayedAt: number | null;
  playCount: number;
  resumePositionSeconds: number;
};

type WakeLockSentinelLike = {
  released?: boolean;
  release: () => Promise<void>;
};

type FeedSnackbarState = {
  id: number;
  message: string;
};

type FeedScrubState = {
  deltaSeconds: number;
  positionSeconds: number;
};

const accentClasses = ["ember", "shore", "canopy"] as const;
const favoriteVideoIdsStorageKey = "mikmok.favorite-video-ids";
const lastActiveVideoIdStorageKey = "mikmok.last-active-video-id";
const playbackRateOptions = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;
const playbackRateStorageKey = "mikmok.playback-rate";
const stageTransitionDurationMs = 220;

type StageDirection = "next" | "prev" | "snap" | null;
type StageRole = "prev" | "current" | "next";
type GestureAxis = "horizontal" | "undecided" | "vertical";

function formatDuration(durationSeconds: number | null | undefined): string | null {
  if (!durationSeconds || durationSeconds <= 0) {
    return null;
  }

  const roundedSeconds = Math.round(durationSeconds);
  const minutes = Math.floor(roundedSeconds / 60);
  const seconds = roundedSeconds % 60;

  return minutes > 0 ? `${minutes}:${seconds.toString().padStart(2, "0")}` : `${seconds}s`;
}

function formatPlaybackTime(durationSeconds: number | null | undefined): string {
  if (!durationSeconds || durationSeconds <= 0) {
    return "0:00";
  }

  const roundedSeconds = Math.max(Math.round(durationSeconds), 0);
  const hours = Math.floor(roundedSeconds / 3600);
  const minutes = Math.floor((roundedSeconds % 3600) / 60);
  const seconds = roundedSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function formatFileSize(sourceSize: number): string {
  if (sourceSize >= 1024 * 1024 * 1024) {
    return `${(sourceSize / 1024 / 1024 / 1024).toFixed(1)} GB`;
  }

  return `${Math.max(sourceSize / 1024 / 1024, 0.1).toFixed(1)} MB`;
}

function formatPlaybackRate(playbackRate: number): string {
  return `${Number.isInteger(playbackRate) ? playbackRate.toFixed(0) : playbackRate}x`;
}

function ActionIcon({ name }: { name: "favorite" | "favoriteFilled" | "info" | "mute" | "sound" | "speed" }) {
  switch (name) {
    case "favorite":
      return (
        <svg aria-hidden="true" className="feed-side-action__icon" viewBox="0 0 24 24">
          <path
            d="M12 20.35 4.98 13.6A4.75 4.75 0 0 1 11.7 6.9L12 7.2l.3-.3A4.75 4.75 0 1 1 19.02 13.6L12 20.35Z"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
      );
    case "favoriteFilled":
      return (
        <svg aria-hidden="true" className="feed-side-action__icon" viewBox="0 0 24 24">
          <path
            d="M12 20.7 4.93 13.9a4.93 4.93 0 0 1 6.97-6.97L12 7.03l.1-.1a4.93 4.93 0 1 1 6.97 6.97L12 20.7Z"
            fill="currentColor"
          />
        </svg>
      );
    case "info":
      return (
        <svg aria-hidden="true" className="feed-side-action__icon" viewBox="0 0 24 24">
          <path
            d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Zm0 4a1.15 1.15 0 1 1 0 2.3 1.15 1.15 0 0 1 0-2.3Zm1.25 9h-2.5v-1.5h.5v-3h-.5v-1.5h2V15h.5v1.5Z"
            fill="currentColor"
          />
        </svg>
      );
    case "mute":
      return (
        <svg aria-hidden="true" className="feed-side-action__icon" viewBox="0 0 24 24">
          <path
            d="M10.7 6.2 7.62 9.5H4.5v5h3.12l3.08 3.3c.63.67 1.8.23 1.8-.7V6.9c0-.93-1.17-1.37-1.8-.7ZM15.64 9.78l1.58 1.57 1.56-1.57 1.06 1.06-1.56 1.56 1.56 1.58-1.06 1.06-1.56-1.58-1.58 1.58-1.06-1.06 1.58-1.58-1.58-1.56 1.06-1.06Z"
            fill="currentColor"
          />
        </svg>
      );
    case "sound":
      return (
        <svg aria-hidden="true" className="feed-side-action__icon" viewBox="0 0 24 24">
          <path
            d="M10.7 6.2 7.62 9.5H4.5v5h3.12l3.08 3.3c.63.67 1.8.23 1.8-.7V6.9c0-.93-1.17-1.37-1.8-.7Zm5.54 1.95a1 1 0 0 1 1.41 0 6 6 0 0 1 0 8.48 1 1 0 0 1-1.41-1.42 4 4 0 0 0 0-5.64 1 1 0 0 1 0-1.42Zm-2.12 2.12a1 1 0 0 1 1.42 0 3 3 0 0 1 0 4.24 1 1 0 1 1-1.42-1.42 1 1 0 0 0 0-1.4 1 1 0 0 1 0-1.42Z"
            fill="currentColor"
          />
        </svg>
      );
    case "speed":
      return (
        <svg aria-hidden="true" className="feed-side-action__icon" viewBox="0 0 24 24">
          <path
            d="M12 5.25a8 8 0 1 0 8 8c0-.66-.08 1.62-.24 2.25H17.7a5.9 5.9 0 1 1-1.82-6.38l-1.56 1.56a3.75 3.75 0 1 0 1.06 1.06l4.1-4.1V10h1.5V5.25H16.2v1.5h2.32l-3.47 3.47A5.93 5.93 0 0 0 12 9a4.25 4.25 0 1 0 4.24 4.5H14.7A2.75 2.75 0 1 1 12 10.5c.59 0 1.14.18 1.6.49l-2.13 2.13 1.06 1.06 3.32-3.32A5.9 5.9 0 0 1 17.25 13c0 .17-.01.33-.03.5h2.27c.01-.17.01-.33.01-.5a8 8 0 0 0-8-8Z"
            fill="currentColor"
          />
        </svg>
      );
  }
}

function PauseIcon() {
  return (
    <svg aria-hidden="true" className="feed-screen__pause-icon" viewBox="0 0 24 24">
      <path d="M8.25 6.5h2.9v11h-2.9zm4.6 0h2.9v11h-2.9z" fill="currentColor" />
    </svg>
  );
}

function FeedStageCard({
  accent,
  clip,
  isActive,
  isMuted,
  playbackRate,
  preloadMode,
  videoProps,
  videoRef
}: {
  accent: (typeof accentClasses)[number];
  clip: FeedVideo;
  isActive: boolean;
  isMuted: boolean;
  playbackRate: number;
  preloadMode: "auto" | "metadata" | "none";
  videoProps?: VideoHTMLAttributes<HTMLVideoElement>;
  videoRef?: (node: HTMLVideoElement | null) => void;
}) {
  const videoElementRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const videoElement = videoElementRef.current;

    if (!videoElement) {
      return;
    }

    if (!isActive) {
      if (!videoElement.paused) {
        videoElement.pause();
      }

      return;
    }

    if (videoElement.paused) {
      void videoElement.play().catch(() => undefined);
    }
  }, [clip.id, isActive]);

  useEffect(() => {
    const videoElement = videoElementRef.current;

    if (!videoElement) {
      return;
    }

    videoElement.defaultPlaybackRate = playbackRate;
    videoElement.playbackRate = playbackRate;
  }, [playbackRate]);

  return (
    <article aria-hidden={!isActive} className={`feed-stage-card feed-stage-card--${accent}`}>
      <video
        autoPlay={isActive}
        className="feed-stage-card__video"
        data-clip-id={clip.id}
        loop={isActive}
        muted={isActive ? isMuted : true}
        playsInline
        poster={clip.thumbnailSmUrl ?? undefined}
        preload={preloadMode}
        ref={(node) => {
          videoElementRef.current = node;
          videoRef?.(node);
        }}
        src={clip.streamUrl}
        {...videoProps}
      />
      <div className="feed-stage-card__veil" />
    </article>
  );
}

export function FeedPage() {
  const activeFeedIndex = useUiStore((state) => state.activeFeedIndex);
  const feedControlsVisible = useUiStore((state) => state.feedControlsVisible);
  const isMuted = useUiStore((state) => state.isMuted);
  const setFeedControlsVisible = useUiStore((state) => state.setFeedControlsVisible);
  const setActiveFeedIndex = useUiStore((state) => state.setActiveFeedIndex);
  const toggleMute = useUiStore((state) => state.toggleMute);
  const [clips, setClips] = useState<FeedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeClipDetails, setActiveClipDetails] = useState<FeedVideoDetails | null>(null);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [favoritesReady, setFavoritesReady] = useState(false);
  const [isActiveVideoPaused, setIsActiveVideoPaused] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [snackbar, setSnackbar] = useState<FeedSnackbarState | null>(null);
  const [scrubState, setScrubState] = useState<FeedScrubState | null>(null);
  const [dragOffsetY, setDragOffsetY] = useState(0);
  const [showPlaybackRateMenu, setShowPlaybackRateMenu] = useState(false);
  const [showInfoCard, setShowInfoCard] = useState(false);
  const [stageTransition, setStageTransition] = useState<StageDirection>(null);
  const pointerStartXRef = useRef<number | null>(null);
  const pointerStartYRef = useRef<number | null>(null);
  const activePointerIdRef = useRef<number | null>(null);
  const gestureAxisRef = useRef<GestureAxis>("undecided");
  const lastGestureAtRef = useRef(0);
  const transitionTimerRef = useRef<number | null>(null);
  const controlsHideTimerRef = useRef<number | null>(null);
  const nextClipWarmTimerRef = useRef<number | null>(null);
  const snackbarTimerRef = useRef<number | null>(null);
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);
  const stageVideoRefs = useRef<Record<StageRole, HTMLVideoElement | null>>({
    prev: null,
    current: null,
    next: null
  });
  const playStartedForVideoIdRef = useRef<string | null>(null);
  const progressReportedAtSecondRef = useRef<number>(0);
  const resumeAppliedForVideoIdRef = useRef<string | null>(null);
  const scrubStartTimeRef = useRef(0);
  const scrubWasPlayingRef = useRef(false);
  const suppressViewportClickRef = useRef(false);
  const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);
  const warmedClipIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      const storedFavoriteIds = window.localStorage.getItem(favoriteVideoIdsStorageKey);

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
      window.localStorage.setItem(favoriteVideoIdsStorageKey, JSON.stringify(favoriteIds));
    } catch {
      // Ignore local storage write failures and keep in-memory favorites.
    }
  }, [favoriteIds, favoritesReady]);

  useEffect(() => {
    try {
      const storedPlaybackRate = window.localStorage.getItem(playbackRateStorageKey);

      if (!storedPlaybackRate) {
        return;
      }

      const parsedPlaybackRate = Number.parseFloat(storedPlaybackRate);

      if (playbackRateOptions.includes(parsedPlaybackRate as (typeof playbackRateOptions)[number])) {
        setPlaybackRate(parsedPlaybackRate);
      }
    } catch {
      // Ignore local storage read failures and keep default playback rate.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(playbackRateStorageKey, String(playbackRate));
    } catch {
      // Ignore local storage write failures and keep in-memory playback rate.
    }
  }, [playbackRate]);

  useEffect(() => {
    let cancelled = false;

    async function loadFeed() {
      try {
        const videos = await apiRequest<FeedVideo[]>("/videos/feed");

        if (cancelled) {
          return;
        }

        try {
          const storedActiveVideoId = window.localStorage.getItem(lastActiveVideoIdStorageKey);

          if (storedActiveVideoId) {
            const storedVideoIndex = videos.findIndex((video) => video.id === storedActiveVideoId);

            if (storedVideoIndex >= 0) {
              setActiveFeedIndex(storedVideoIndex);
            }
          }
        } catch {
          // Ignore local storage read failures and fall back to the default feed index.
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
  const activeDurationSeconds =
    (activeVideoRef.current && Number.isFinite(activeVideoRef.current.duration) ? activeVideoRef.current.duration : null) ??
    activeClipDetails?.durationSeconds ??
    activeClip?.durationSeconds ??
    null;
  const previousClip = clips.length > 1 ? clips[(normalizedFeedIndex - 1 + clips.length) % clips.length] ?? null : activeClip;
  const nextClip = clips.length > 1 ? clips[(normalizedFeedIndex + 1) % clips.length] ?? null : activeClip;

  useEffect(() => {
    if (!activeClip) {
      return;
    }

    try {
      window.localStorage.setItem(lastActiveVideoIdStorageKey, activeClip.id);
    } catch {
      // Ignore local storage write failures and keep in-memory active clip.
    }
  }, [activeClip?.id]);

  const stageCards = activeClip
    ? [
        {
          accent: accentClasses[(normalizedFeedIndex - 1 + accentClasses.length) % accentClasses.length]!,
          clip: previousClip ?? activeClip,
          isActive: false,
          key: clips.length >= 3 ? (previousClip ?? activeClip).id : `prev-${previousClip?.id ?? activeClip.id}`,
          preloadMode: "metadata" as const,
          role: "prev" as const
        },
        {
          accent: activeAccent,
          clip: activeClip,
          isActive: true,
          key: clips.length >= 3 ? activeClip.id : `current-${activeClip.id}`,
          preloadMode: "auto" as const,
          role: "current" as const
        },
        {
          accent: accentClasses[(normalizedFeedIndex + 1) % accentClasses.length]!,
          clip: nextClip ?? activeClip,
          isActive: false,
          key: clips.length >= 3 ? (nextClip ?? activeClip).id : `next-${nextClip?.id ?? activeClip.id}`,
          preloadMode: "metadata" as const,
          role: "next" as const
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
    clearNextClipWarmTimer();
    setShowPlaybackRateMenu(false);
    setIsActiveVideoPaused(false);
    setFeedControlsVisible(true);

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

  function clearControlsHideTimer() {
    if (controlsHideTimerRef.current !== null) {
      window.clearTimeout(controlsHideTimerRef.current);
      controlsHideTimerRef.current = null;
    }
  }

  function clearNextClipWarmTimer() {
    if (nextClipWarmTimerRef.current !== null) {
      window.clearTimeout(nextClipWarmTimerRef.current);
      nextClipWarmTimerRef.current = null;
    }
  }

  function clearSnackbarTimer() {
    if (snackbarTimerRef.current !== null) {
      window.clearTimeout(snackbarTimerRef.current);
      snackbarTimerRef.current = null;
    }
  }

  function scheduleControlsHide() {
    clearControlsHideTimer();

    if (showInfoCard || showPlaybackRateMenu || !activeVideoRef.current || activeVideoRef.current.paused) {
      return;
    }

    controlsHideTimerRef.current = window.setTimeout(() => {
      setFeedControlsVisible(false);
      controlsHideTimerRef.current = null;
    }, 5000);
  }

  function showControlsTemporarily() {
    setFeedControlsVisible(true);
    scheduleControlsHide();
  }

  useEffect(() => {
    if (showInfoCard || showPlaybackRateMenu) {
      clearControlsHideTimer();
      setFeedControlsVisible(true);
      return;
    }

    if (activeVideoRef.current && !activeVideoRef.current.paused) {
      scheduleControlsHide();
    }
  }, [showInfoCard, showPlaybackRateMenu]);

  function showSnackbar(message: string) {
    clearSnackbarTimer();
    setSnackbar({
      id: Date.now(),
      message
    });

    snackbarTimerRef.current = window.setTimeout(() => {
      setSnackbar(null);
      snackbarTimerRef.current = null;
    }, 1800);
  }

  function persistProgressForVideo(videoId: string, positionSeconds: number) {
    return apiRequest<PlaybackSnapshot>(`/videos/${videoId}/progress`, {
      method: "POST",
      body: JSON.stringify({
        completed: false,
        positionSeconds
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

  function persistProgressDuringPageHide(videoId: string, positionSeconds: number) {
    try {
      const payload = JSON.stringify({
        completed: false,
        positionSeconds
      });

      const blob = new Blob([payload], { type: "application/json" });

      if (navigator.sendBeacon?.(`${apiBaseUrl}/videos/${videoId}/progress`, blob)) {
        return;
      }

      void fetch(`${apiBaseUrl}/videos/${videoId}/progress`, {
        method: "POST",
        body: payload,
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        keepalive: true
      }).catch(() => undefined);
    } catch {
      // Ignore unload persistence failures.
    }
  }

  function warmNextClip(upcomingClipId: string) {
    const nextVideoElement = stageVideoRefs.current.next;

    if (!nextVideoElement || nextVideoElement.dataset.clipId !== upcomingClipId) {
      return;
    }

    if (
      warmedClipIdsRef.current.has(upcomingClipId) &&
      nextVideoElement.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA
    ) {
      return;
    }

    warmedClipIdsRef.current.add(upcomingClipId);
    nextVideoElement.preload = "auto";

    if (nextVideoElement.networkState === HTMLMediaElement.NETWORK_EMPTY) {
      nextVideoElement.load();
    }

    if (nextVideoElement.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
      return;
    }

    void nextVideoElement.play().then(
      () => {
        window.setTimeout(() => {
          if (stageVideoRefs.current.next !== nextVideoElement || nextVideoElement.dataset.clipId !== upcomingClipId) {
            return;
          }

          if (!nextVideoElement.paused) {
            nextVideoElement.pause();
          }

          if (Number.isFinite(nextVideoElement.duration) && nextVideoElement.currentTime > 0) {
            nextVideoElement.currentTime = 0;
          }
        }, 160);
      },
      () => undefined
    );
  }

  function scheduleNextClipWarm() {
    clearNextClipWarmTimer();

    if (!nextClip || nextClip.id === activeClip?.id) {
      return;
    }

    nextClipWarmTimerRef.current = window.setTimeout(() => {
      warmNextClip(nextClip.id);
      nextClipWarmTimerRef.current = null;
    }, 700);
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
    if (clips.length < 2 || !canAdvanceGesture()) {
      return;
    }

    finishStageTransition("next");
  }

  function goToPreviousClip() {
    if (clips.length < 2 || !canAdvanceGesture()) {
      return;
    }

    finishStageTransition("prev");
  }

  function handlePointerDown(event: PointerEvent<HTMLElement>) {
    const target = event.target;

    if (stageTransition) {
      return;
    }

    if (target instanceof HTMLElement && target.closest("button, a, input, textarea, select, label, .feed-panel, .feed-side-action__sheet")) {
      return;
    }

    suppressViewportClickRef.current = false;
    activePointerIdRef.current = event.pointerId;
    pointerStartXRef.current = event.clientX;
    pointerStartYRef.current = event.clientY;
    gestureAxisRef.current = "undecided";
    setDragOffsetY(0);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLElement>) {
    if (
      activePointerIdRef.current !== event.pointerId ||
      pointerStartYRef.current === null ||
      pointerStartXRef.current === null
    ) {
      return;
    }

    const deltaX = event.clientX - pointerStartXRef.current;
    const deltaY = event.clientY - pointerStartYRef.current;
    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    if (gestureAxisRef.current === "undecided") {
      if (Math.max(absDeltaX, absDeltaY) < 12) {
        return;
      }

      const canScrub =
        !!activeVideoRef.current &&
        Number.isFinite(activeVideoRef.current.duration) &&
        activeVideoRef.current.duration > 0 &&
        absDeltaX > absDeltaY * 1.08;

      gestureAxisRef.current = canScrub ? "horizontal" : "vertical";
      suppressViewportClickRef.current = true;

      if (gestureAxisRef.current === "horizontal" && activeVideoRef.current) {
        scrubStartTimeRef.current = activeVideoRef.current.currentTime;
        scrubWasPlayingRef.current = !activeVideoRef.current.paused;

        if (scrubWasPlayingRef.current) {
          activeVideoRef.current.pause();
        }

        clearControlsHideTimer();
        clearNextClipWarmTimer();
        setFeedControlsVisible(true);
      }
    }

    if (gestureAxisRef.current === "horizontal") {
      if (!activeVideoRef.current || !Number.isFinite(activeVideoRef.current.duration) || activeVideoRef.current.duration <= 0) {
        return;
      }

      const viewportWidth = Math.max(event.currentTarget.clientWidth, 1);
      const duration = activeVideoRef.current.duration;
      const nextPositionSeconds = Math.max(
        0,
        Math.min(duration, scrubStartTimeRef.current + (deltaX / viewportWidth) * duration)
      );

      activeVideoRef.current.currentTime = nextPositionSeconds;
      progressReportedAtSecondRef.current = Math.floor(nextPositionSeconds);
      setScrubState({
        deltaSeconds: nextPositionSeconds - scrubStartTimeRef.current,
        positionSeconds: nextPositionSeconds
      });
      return;
    }

    const maxOffset = Math.min(window.innerHeight * 0.32, 220);
    const clampedOffset = Math.max(Math.min(deltaY, maxOffset), -maxOffset);

    if (Math.abs(clampedOffset) > 12) {
      suppressViewportClickRef.current = true;
    }

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
    pointerStartXRef.current = null;
    pointerStartYRef.current = null;

    if (gestureAxisRef.current === "horizontal") {
      const finalPositionSeconds = activeVideoRef.current?.currentTime ?? scrubState?.positionSeconds ?? scrubStartTimeRef.current;

      if (activeClip) {
        void apiRequest<PlaybackSnapshot>(`/videos/${activeClip.id}/progress`, {
          method: "POST",
          body: JSON.stringify({
            completed: false,
            positionSeconds: finalPositionSeconds
          })
        }).catch(() => undefined);
      }

      if (scrubWasPlayingRef.current && activeVideoRef.current) {
        void activeVideoRef.current.play().catch(() => undefined);
      }

      setScrubState(null);
      scrubWasPlayingRef.current = false;
      gestureAxisRef.current = "undecided";
      return;
    }

    gestureAxisRef.current = "undecided";

    if (Math.abs(dragOffsetY) < 72) {
      if (dragOffsetY !== 0) {
        suppressViewportClickRef.current = true;
        finishStageTransition("snap");
      }

      return;
    }

    if (clips.length < 2) {
      finishStageTransition("snap");
      return;
    }

    if (dragOffsetY < 0) {
      suppressViewportClickRef.current = true;
      goToNextClip();
      return;
    }

    suppressViewportClickRef.current = true;
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
      if (showInfoCard && event.key === "Escape") {
        event.preventDefault();
        setShowInfoCard(false);
      }

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
  }, [normalizedFeedIndex, clips.length, showInfoCard, stageTransition]);

  useEffect(() => {
    return () => {
      clearPendingTransition();
      clearControlsHideTimer();
      clearNextClipWarmTimer();
      clearSnackbarTimer();
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

      void persistProgressForVideo(currentClipId, currentTime);
    };
  }, [activeClip?.id]);

  useEffect(() => {
    function handlePageHide() {
      const currentClipId = activeClip?.id;
      const currentTime = activeVideoRef.current?.currentTime ?? Number.NaN;

      if (!currentClipId || !Number.isFinite(currentTime) || currentTime <= 0) {
        return;
      }

      try {
        window.localStorage.setItem(lastActiveVideoIdStorageKey, currentClipId);
      } catch {
        // Ignore local storage write failures and keep in-memory active clip.
      }

      persistProgressDuringPageHide(currentClipId, currentTime);
    }

    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [activeClip?.id]);

  async function requestWakeLock() {
    const wakeLockNavigator = navigator as Navigator & {
      wakeLock?: {
        request: (type: "screen") => Promise<WakeLockSentinelLike>;
      };
    };

    if (!wakeLockNavigator.wakeLock || document.visibilityState !== "visible") {
      return;
    }

    if (wakeLockRef.current && !wakeLockRef.current.released) {
      return;
    }

    try {
      wakeLockRef.current = await wakeLockNavigator.wakeLock.request("screen");
    } catch {
      wakeLockRef.current = null;
    }
  }

  async function releaseWakeLock() {
    if (!wakeLockRef.current) {
      return;
    }

    const currentWakeLock = wakeLockRef.current;
    wakeLockRef.current = null;
    await currentWakeLock.release().catch(() => undefined);
  }

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") {
        void releaseWakeLock();
        return;
      }

      if (activeVideoRef.current && !activeVideoRef.current.paused) {
        void requestWakeLock();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void releaseWakeLock();
    };
  }, []);

  function handleActiveVideoPlay() {
    setIsActiveVideoPaused(false);
    void requestWakeLock();
    scheduleControlsHide();
    scheduleNextClipWarm();

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

  function handleActiveVideoPause() {
    setIsActiveVideoPaused(true);
    const currentClipId = activeClip?.id;
    const currentTime = activeVideoRef.current?.currentTime ?? Number.NaN;

    if (currentClipId && Number.isFinite(currentTime) && currentTime > 0) {
      void persistProgressForVideo(currentClipId, currentTime);
    }

    clearControlsHideTimer();
    clearNextClipWarmTimer();
    setScrubState(null);
    setFeedControlsVisible(true);
    void releaseWakeLock();
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

    showControlsTemporarily();
    const willFavorite = !favoriteIds.includes(activeClip.id);

    setFavoriteIds((current) =>
      current.includes(activeClip.id) ? current.filter((videoId) => videoId !== activeClip.id) : [...current, activeClip.id]
    );
    showSnackbar(willFavorite ? "Added to favorites" : "Removed from favorites");
  }

  function handlePlaybackRateChange(nextPlaybackRate: number) {
    showControlsTemporarily();
    setPlaybackRate(nextPlaybackRate);
    setShowPlaybackRateMenu(false);
  }

  function handleViewportClick(event: MouseEvent<HTMLElement>) {
    const target = event.target;

    if (!(target instanceof HTMLElement)) {
      return;
    }

    if (target.closest("button, a, input, textarea, select, label, .feed-panel, .feed-side-action__sheet")) {
      return;
    }

    if (suppressViewportClickRef.current) {
      suppressViewportClickRef.current = false;
      return;
    }

    if (!activeVideoRef.current) {
      return;
    }

    if (showPlaybackRateMenu) {
      setShowPlaybackRateMenu(false);
      return;
    }

    if (!feedControlsVisible) {
      showControlsTemporarily();
      return;
    }

    if (activeVideoRef.current.paused) {
      void activeVideoRef.current.play().catch(() => undefined);
      return;
    }

    activeVideoRef.current.pause();
  }

  const activeVideoProps: VideoHTMLAttributes<HTMLVideoElement> | undefined = activeClip
    ? {
        onLoadedMetadata: handleLoadedMetadata,
        onPause: handleActiveVideoPause,
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
        onClick={handleViewportClick}
        onPointerCancel={releasePointer}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={releasePointer}
        onWheel={handleWheel}
      >
        {snackbar ? (
          <div key={snackbar.id} className="feed-screen__snackbar" role="status" aria-live="polite">
            {snackbar.message}
          </div>
        ) : null}
        {scrubState ? (
          <div className="feed-screen__scrub-hud" role="status" aria-live="off">
            <p className="feed-screen__scrub-time">
              {formatPlaybackTime(scrubState.positionSeconds)}
              {activeDurationSeconds ? ` / ${formatPlaybackTime(activeDurationSeconds)}` : ""}
            </p>
            <p className="feed-screen__scrub-delta">
              {scrubState.deltaSeconds >= 0 ? "+" : ""}
              {Math.round(scrubState.deltaSeconds)}s
            </p>
            <div className="feed-screen__scrub-track" aria-hidden="true">
              <span
                className="feed-screen__scrub-track-fill"
                style={{
                  width: activeDurationSeconds
                    ? `${Math.min(Math.max((scrubState.positionSeconds / activeDurationSeconds) * 100, 0), 100)}%`
                    : "0%"
                }}
              />
            </div>
          </div>
        ) : null}
        {isActiveVideoPaused && !scrubState ? (
          <div className="feed-screen__pause-indicator" aria-hidden="true">
            <span className="feed-screen__pause-indicator-badge">
              <PauseIcon />
            </span>
          </div>
        ) : null}
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
                      : activePointerIdRef.current !== null && gestureAxisRef.current === "vertical"
                        ? `translateY(calc(-100% + ${dragOffsetY}px))`
                        : "translateY(-100%)"
            }}
          >
            {stageCards.map((card) => (
              <FeedStageCard
                accent={card.accent}
                clip={card.clip}
                isActive={card.isActive}
                isMuted={isMuted}
                key={card.key}
                playbackRate={playbackRate}
                preloadMode={card.preloadMode}
                videoProps={card.isActive ? activeVideoProps : undefined}
                videoRef={(node) => {
                  stageVideoRefs.current[card.role] = node;

                  if (card.role === "current") {
                    activeVideoRef.current = node;
                  }
                }}
              />
            ))}
          </div>
        </div>
        <div
          className={feedControlsVisible ? "feed-screen__side-actions" : "feed-screen__side-actions feed-screen__side-actions--hidden"}
          aria-label="Video actions"
        >
          <button
            aria-label={activeClipIsFavorite ? "Remove from favorites" : "Add to favorites"}
            aria-pressed={activeClipIsFavorite}
            className={activeClipIsFavorite ? "feed-side-action feed-side-action--active" : "feed-side-action"}
            onClick={handleFavoriteToggle}
            type="button"
          >
            <span className="feed-side-action__badge">
              <ActionIcon name={activeClipIsFavorite ? "favoriteFilled" : "favorite"} />
            </span>
          </button>
          <button
            aria-label={showInfoCard ? "Hide clip details" : "Show clip details"}
            aria-pressed={showInfoCard}
            className={showInfoCard ? "feed-side-action feed-side-action--active" : "feed-side-action"}
            onClick={() => {
              showControlsTemporarily();
              setShowInfoCard((current) => !current);
            }}
            type="button"
          >
            <span className="feed-side-action__badge">
              <ActionIcon name="info" />
            </span>
          </button>
          <button
            aria-label={isMuted ? "Turn sound on" : "Mute sound"}
            aria-pressed={!isMuted}
            className={!isMuted ? "feed-side-action feed-side-action--active" : "feed-side-action"}
            onClick={() => {
              showControlsTemporarily();
              toggleMute();
            }}
            type="button"
          >
            <span className="feed-side-action__badge">
              <ActionIcon name={isMuted ? "mute" : "sound"} />
            </span>
          </button>
          <div className="feed-side-action-group">
            {showPlaybackRateMenu ? (
              <div className="feed-side-action__sheet" role="menu" aria-label="Playback speed">
                {playbackRateOptions.map((rateOption) => (
                  <button
                    aria-pressed={playbackRate === rateOption}
                    className={
                      playbackRate === rateOption
                        ? "feed-side-action__sheet-item feed-side-action__sheet-item--active"
                        : "feed-side-action__sheet-item"
                    }
                    key={rateOption}
                    onClick={() => {
                      handlePlaybackRateChange(rateOption);
                    }}
                    type="button"
                  >
                    {formatPlaybackRate(rateOption)}
                  </button>
                ))}
              </div>
            ) : null}
            <button
              aria-expanded={showPlaybackRateMenu}
              aria-haspopup="menu"
              aria-label={`Playback speed ${formatPlaybackRate(playbackRate)}`}
              className={
                showPlaybackRateMenu || playbackRate !== 1 ? "feed-side-action feed-side-action--active" : "feed-side-action"
              }
              onClick={() => {
                showControlsTemporarily();
                setShowPlaybackRateMenu((current) => !current);
              }}
              type="button"
            >
              <span className="feed-side-action__badge">
                <ActionIcon name="speed" />
              </span>
            </button>
          </div>
        </div>
        <div className="feed-screen__bottom">
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
                  <span className="pill">{formatFileSize(activeClip.sourceSize)}</span>
                  {activeClip.durationSeconds ? <span className="pill">{formatDuration(activeClip.durationSeconds)}</span> : null}
                  {activeClip.width && activeClip.height ? <span className="pill">{activeClip.width}×{activeClip.height}</span> : null}
                  <span className="pill">{activeClip.playbackStatus}</span>
                  <span className="pill">{formatPlaybackRate(playbackRate)}</span>
                  {activeClipIsFavorite ? <span className="pill pill--solid">favorited</span> : null}
                </div>
                <p className="feed-panel__subline">
                  {activeClip.sourceName} · updated {new Date(activeClip.updatedAt * 1000).toLocaleString()}
                </p>
                <p className="feed-panel__subline">
                  {activeClipDetails
                    ? `${activeClipDetails.playCount} plays · resume ${Math.round(activeClipDetails.resumePositionSeconds)}s${
                        activeClipDetails.videoCodec ? ` · ${activeClipDetails.videoCodec}` : ""
                      }${activeClipDetails.audioCodec ? ` / ${activeClipDetails.audioCodec}` : ""}`
                    : "Loading playback state..."}
                </p>
                {activeClipDetails?.folderPath ? (
                  <p className="feed-panel__subline">
                    {activeClipDetails.folderPath}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
