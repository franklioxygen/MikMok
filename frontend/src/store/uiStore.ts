import { create } from "zustand";

import { apiRequest } from "../api/client";

export type PlaybackCompletionMode = "next" | "repeat" | "stop";

export type CachedFeedVideo = {
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

type UserPreferences = {
  favoriteVideoIds: string[];
  lastActiveVideoId: string | null;
  playbackCompletionMode: PlaybackCompletionMode;
  playbackRate: number;
  soundOnOpen: boolean;
};

type UserPreferencesPatch = Partial<UserPreferences>;

const favoriteVideoIdsStorageKey = "mikmok.favorite-video-ids";
const lastActiveVideoIdStorageKey = "mikmok.last-active-video-id";
const playbackCompletionModeStorageKey = "mikmok.playback-completion-mode";
const playbackRateStorageKey = "mikmok.playback-rate";
const soundOnOpenStorageKey = "mikmok.sound-on-open";

const defaultPreferences: UserPreferences = {
  favoriteVideoIds: [],
  lastActiveVideoId: null,
  playbackCompletionMode: "repeat",
  playbackRate: 1,
  soundOnOpen: false
};

type UiState = {
  activeFeedIndex: number;
  favoriteIds: string[];
  feedSnapshot: CachedFeedVideo[];
  feedControlsVisible: boolean;
  hydratePreferences: () => Promise<void>;
  isMuted: boolean;
  lastActiveVideoId: string | null;
  playbackCompletionMode: PlaybackCompletionMode;
  playbackRate: number;
  preferencesLoaded: boolean;
  resumePositionByVideoId: Record<string, number>;
  setActiveFeedIndex: (index: number) => void;
  setFeedControlsVisible: (visible: boolean) => void;
  setFeedSnapshot: (videos: CachedFeedVideo[]) => void;
  setLastActiveVideoId: (videoId: string | null) => void;
  setMuted: (muted: boolean) => void;
  setPlaybackCompletionMode: (mode: PlaybackCompletionMode) => void;
  setPlaybackRate: (playbackRate: number) => void;
  setResumePositionForVideo: (videoId: string, positionSeconds: number) => void;
  setSoundOnOpen: (enabled: boolean) => void;
  soundOnOpen: boolean;
  toggleFavoriteId: (videoId: string) => void;
  toggleMute: () => void;
};

function readLegacyBoolean(key: string, fallbackValue: boolean): boolean {
  if (typeof window === "undefined") {
    return fallbackValue;
  }

  const storedValue = window.localStorage.getItem(key);

  if (storedValue === null) {
    return fallbackValue;
  }

  return storedValue === "true";
}

function readLegacyPlaybackCompletionMode(): PlaybackCompletionMode {
  if (typeof window === "undefined") {
    return defaultPreferences.playbackCompletionMode;
  }

  const storedValue = window.localStorage.getItem(playbackCompletionModeStorageKey);

  if (storedValue === "stop" || storedValue === "next" || storedValue === "repeat") {
    return storedValue;
  }

  return defaultPreferences.playbackCompletionMode;
}

function readLegacyNumber(key: string, fallbackValue: number): number {
  if (typeof window === "undefined") {
    return fallbackValue;
  }

  const storedValue = window.localStorage.getItem(key);

  if (storedValue === null) {
    return fallbackValue;
  }

  const parsedValue = Number.parseFloat(storedValue);
  return Number.isFinite(parsedValue) ? parsedValue : fallbackValue;
}

function readLegacyStringArray(key: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  const storedValue = window.localStorage.getItem(key);

  if (!storedValue) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(storedValue) as unknown;
    return Array.isArray(parsedValue) ? parsedValue.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function readLegacyNullableString(key: string): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storedValue = window.localStorage.getItem(key);
  return storedValue && storedValue.length > 0 ? storedValue : null;
}

function readLegacyPreferences(): { hasLegacyValues: boolean; preferences: UserPreferences } {
  const favoriteVideoIds = readLegacyStringArray(favoriteVideoIdsStorageKey);
  const lastActiveVideoId = readLegacyNullableString(lastActiveVideoIdStorageKey);
  const playbackCompletionMode = readLegacyPlaybackCompletionMode();
  const playbackRate = readLegacyNumber(playbackRateStorageKey, defaultPreferences.playbackRate);
  const soundOnOpen = readLegacyBoolean(soundOnOpenStorageKey, defaultPreferences.soundOnOpen);

  return {
    hasLegacyValues:
      favoriteVideoIds.length > 0 ||
      lastActiveVideoId !== null ||
      playbackCompletionMode !== defaultPreferences.playbackCompletionMode ||
      playbackRate !== defaultPreferences.playbackRate ||
      soundOnOpen !== defaultPreferences.soundOnOpen,
    preferences: {
      favoriteVideoIds,
      lastActiveVideoId,
      playbackCompletionMode,
      playbackRate,
      soundOnOpen
    }
  };
}

function clearLegacyPreferences(): void {
  if (typeof window === "undefined") {
    return;
  }

  for (const key of [
    favoriteVideoIdsStorageKey,
    lastActiveVideoIdStorageKey,
    playbackCompletionModeStorageKey,
    playbackRateStorageKey,
    soundOnOpenStorageKey
  ]) {
    window.localStorage.removeItem(key);
  }
}

async function patchRemotePreferences(patch: UserPreferencesPatch): Promise<UserPreferences> {
  return apiRequest<UserPreferences>("/preferences", {
    method: "PATCH",
    body: JSON.stringify(patch)
  });
}

function applyPreferencesToState(preferences: UserPreferences) {
  return {
    favoriteIds: preferences.favoriteVideoIds,
    isMuted: !preferences.soundOnOpen,
    lastActiveVideoId: preferences.lastActiveVideoId,
    playbackCompletionMode: preferences.playbackCompletionMode,
    playbackRate: preferences.playbackRate,
    soundOnOpen: preferences.soundOnOpen
  };
}

export const useUiStore = create<UiState>((set, get) => ({
  activeFeedIndex: 0,
  favoriteIds: defaultPreferences.favoriteVideoIds,
  feedSnapshot: [],
  feedControlsVisible: true,
  hydratePreferences: async () => {
    if (get().preferencesLoaded) {
      return;
    }

    const legacy = readLegacyPreferences();

    try {
      let preferences = await apiRequest<UserPreferences>("/preferences");

      if (legacy.hasLegacyValues) {
        const shouldMigrate =
          preferences.favoriteVideoIds.length === 0 &&
          preferences.lastActiveVideoId === null &&
          preferences.playbackCompletionMode === defaultPreferences.playbackCompletionMode &&
          preferences.playbackRate === defaultPreferences.playbackRate &&
          preferences.soundOnOpen === defaultPreferences.soundOnOpen;

        if (shouldMigrate) {
          preferences = await patchRemotePreferences(legacy.preferences);
        }

        clearLegacyPreferences();
      }

      set({
        ...applyPreferencesToState(preferences),
        preferencesLoaded: true
      });
      return;
    } catch {
      set({
        ...applyPreferencesToState(legacy.preferences),
        preferencesLoaded: true
      });
    }
  },
  isMuted: !defaultPreferences.soundOnOpen,
  lastActiveVideoId: defaultPreferences.lastActiveVideoId,
  playbackCompletionMode: defaultPreferences.playbackCompletionMode,
  playbackRate: defaultPreferences.playbackRate,
  preferencesLoaded: false,
  resumePositionByVideoId: {},
  setActiveFeedIndex: (index) => {
    set((state) => (state.activeFeedIndex === index ? state : { activeFeedIndex: index }));
  },
  setFeedControlsVisible: (visible) => {
    set((state) => (state.feedControlsVisible === visible ? state : { feedControlsVisible: visible }));
  },
  setFeedSnapshot: (videos) => {
    set((state) => {
      if (
        state.feedSnapshot.length === videos.length &&
        state.feedSnapshot.every(
          (currentVideo, index) =>
            currentVideo.id === videos[index]?.id &&
            currentVideo.updatedAt === videos[index]?.updatedAt &&
            currentVideo.streamUrl === videos[index]?.streamUrl
        )
      ) {
        return state;
      }

      return { feedSnapshot: videos };
    });
  },
  setLastActiveVideoId: (videoId) => {
    if (get().lastActiveVideoId === videoId) {
      return;
    }

    set({ lastActiveVideoId: videoId });
    void patchRemotePreferences({ lastActiveVideoId: videoId });
  },
  setMuted: (muted) => {
    set((state) => (state.isMuted === muted ? state : { isMuted: muted }));
  },
  setPlaybackCompletionMode: (mode) => {
    if (get().playbackCompletionMode === mode) {
      return;
    }

    set({ playbackCompletionMode: mode });
    void patchRemotePreferences({ playbackCompletionMode: mode });
  },
  setPlaybackRate: (playbackRate) => {
    if (get().playbackRate === playbackRate) {
      return;
    }

    set({ playbackRate });
    void patchRemotePreferences({ playbackRate });
  },
  setResumePositionForVideo: (videoId, positionSeconds) => {
    const normalizedPositionSeconds = Math.max(positionSeconds, 0);

    set((state) =>
      state.resumePositionByVideoId[videoId] === normalizedPositionSeconds
        ? state
        : {
            resumePositionByVideoId: {
              ...state.resumePositionByVideoId,
              [videoId]: normalizedPositionSeconds
            }
          }
    );
  },
  setSoundOnOpen: (enabled) => {
    if (get().soundOnOpen === enabled) {
      return;
    }

    set({
      soundOnOpen: enabled,
      isMuted: !enabled
    });
    void patchRemotePreferences({ soundOnOpen: enabled });
  },
  soundOnOpen: defaultPreferences.soundOnOpen,
  toggleFavoriteId: (videoId) => {
    const nextFavoriteIds = get().favoriteIds.includes(videoId)
      ? get().favoriteIds.filter((currentId) => currentId !== videoId)
      : [...get().favoriteIds, videoId];

    set({ favoriteIds: nextFavoriteIds });
    void patchRemotePreferences({ favoriteVideoIds: nextFavoriteIds });
  },
  toggleMute: () => {
    set((state) => ({ isMuted: !state.isMuted }));
  }
}));
