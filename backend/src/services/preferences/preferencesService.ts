import { db } from "../../db/index.js";
import { coerceVideoIdToCanonical } from "../integrations/videoIds.js";

type PlaybackCompletionMode = "next" | "repeat" | "stop";

type UserPreferences = {
  favoriteVideoIds: string[];
  lastActiveVideoId: string | null;
  playbackCompletionMode: PlaybackCompletionMode;
  playbackRate: number;
  soundOnOpen: boolean;
};

type UserPreferencesPatch = Partial<UserPreferences>;

const preferenceKeys = {
  favoriteVideoIds: "preferences.favorite_video_ids",
  lastActiveVideoId: "preferences.last_active_video_id",
  playbackCompletionMode: "preferences.playback_completion_mode",
  playbackRate: "preferences.playback_rate",
  soundOnOpen: "preferences.sound_on_open"
} as const;

const defaultPreferences: UserPreferences = {
  favoriteVideoIds: [],
  lastActiveVideoId: null,
  playbackCompletionMode: "repeat",
  playbackRate: 1,
  soundOnOpen: false
};

class PreferencesService {
  getPreferences(): UserPreferences {
    const favoriteVideoIds = Array.from(
      new Set(
        this.readStringArray(preferenceKeys.favoriteVideoIds, defaultPreferences.favoriteVideoIds).map((videoId) =>
          coerceVideoIdToCanonical(videoId)
        )
      )
    );
    const lastActiveVideoId = this.readNullableString(preferenceKeys.lastActiveVideoId);

    return {
      favoriteVideoIds,
      lastActiveVideoId: lastActiveVideoId ? coerceVideoIdToCanonical(lastActiveVideoId) : null,
      playbackCompletionMode: this.readPlaybackCompletionMode(
        preferenceKeys.playbackCompletionMode,
        defaultPreferences.playbackCompletionMode
      ),
      playbackRate: this.readNumber(preferenceKeys.playbackRate, defaultPreferences.playbackRate),
      soundOnOpen: this.readBoolean(preferenceKeys.soundOnOpen, defaultPreferences.soundOnOpen)
    };
  }

  updatePreferences(patch: UserPreferencesPatch): UserPreferences {
    if (patch.favoriteVideoIds) {
      this.writeValue(
        preferenceKeys.favoriteVideoIds,
        JSON.stringify(Array.from(new Set(patch.favoriteVideoIds.map((videoId) => coerceVideoIdToCanonical(videoId)))))
      );
    }

    if (patch.lastActiveVideoId !== undefined) {
      if (patch.lastActiveVideoId === null) {
        this.deleteValue(preferenceKeys.lastActiveVideoId);
      } else {
        this.writeValue(preferenceKeys.lastActiveVideoId, coerceVideoIdToCanonical(patch.lastActiveVideoId));
      }
    }

    if (patch.playbackCompletionMode) {
      this.writeValue(preferenceKeys.playbackCompletionMode, patch.playbackCompletionMode);
    }

    if (patch.playbackRate !== undefined) {
      this.writeValue(preferenceKeys.playbackRate, String(patch.playbackRate));
    }

    if (patch.soundOnOpen !== undefined) {
      this.writeValue(preferenceKeys.soundOnOpen, patch.soundOnOpen ? "1" : "0");
    }

    return this.getPreferences();
  }

  private readValue(key: string): string | null {
    const row = db.prepare("SELECT value FROM app_state WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  private writeValue(key: string, value: string): void {
    db.prepare("INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, value);
  }

  private deleteValue(key: string): void {
    db.prepare("DELETE FROM app_state WHERE key = ?").run(key);
  }

  private readBoolean(key: string, fallbackValue: boolean): boolean {
    const value = this.readValue(key);

    if (value === null) {
      return fallbackValue;
    }

    return value === "1" || value === "true";
  }

  private readNullableString(key: string): string | null {
    const value = this.readValue(key);
    return value && value.length > 0 ? value : null;
  }

  private readNumber(key: string, fallbackValue: number): number {
    const value = this.readValue(key);

    if (value === null) {
      return fallbackValue;
    }

    const parsedValue = Number.parseFloat(value);
    return Number.isFinite(parsedValue) ? parsedValue : fallbackValue;
  }

  private readPlaybackCompletionMode(key: string, fallbackValue: PlaybackCompletionMode): PlaybackCompletionMode {
    const value = this.readValue(key);

    if (value === "stop" || value === "next" || value === "repeat") {
      return value;
    }

    return fallbackValue;
  }

  private readStringArray(key: string, fallbackValue: string[]): string[] {
    const value = this.readValue(key);

    if (!value) {
      return fallbackValue;
    }

    try {
      const parsedValue = JSON.parse(value) as unknown;
      return Array.isArray(parsedValue) ? parsedValue.filter((entry): entry is string => typeof entry === "string") : fallbackValue;
    } catch {
      return fallbackValue;
    }
  }
}

export const preferencesService = new PreferencesService();

export type { PlaybackCompletionMode, UserPreferences, UserPreferencesPatch };
