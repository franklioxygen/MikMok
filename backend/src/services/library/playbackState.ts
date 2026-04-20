import { db } from "../../db/index.js";
import { coerceVideoIdToCanonical, getLegacyLocalVideoId } from "../integrations/videoIds.js";

type PlaybackState = {
  lastPlayedAt: number | null;
  playCount: number;
  resumePositionSeconds: number;
};

type ProgressUpdate = {
  completed?: boolean;
  positionSeconds: number;
};

class PlaybackStateService {
  private readonly selectStatement = db.prepare<[string], {
    last_played_at: number | null;
    play_count: number;
    resume_position_seconds: number;
  }>(`
    SELECT
      play_count,
      resume_position_seconds,
      last_played_at
    FROM playback_state
    WHERE video_id = ?
  `);

  private readonly upsertStatement = db.prepare(`
    INSERT INTO playback_state (
      video_id,
      play_count,
      resume_position_seconds,
      last_played_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(video_id) DO UPDATE SET
      play_count = excluded.play_count,
      resume_position_seconds = excluded.resume_position_seconds,
      last_played_at = excluded.last_played_at,
      updated_at = excluded.updated_at
  `);

  getState(videoId: string): PlaybackState {
    const normalizedVideoId = coerceVideoIdToCanonical(videoId);
    const row = this.selectStatement.get(normalizedVideoId);

    if (!row) {
      const legacyLocalVideoId = getLegacyLocalVideoId(normalizedVideoId);

      if (legacyLocalVideoId) {
        const legacyRow = this.selectStatement.get(legacyLocalVideoId);

        if (legacyRow) {
          const legacyState = {
            playCount: legacyRow.play_count,
            resumePositionSeconds: legacyRow.resume_position_seconds,
            lastPlayedAt: legacyRow.last_played_at
          };

          this.saveState(normalizedVideoId, legacyState);
          return legacyState;
        }
      }
    }

    if (!row) {
      return {
        playCount: 0,
        resumePositionSeconds: 0,
        lastPlayedAt: null
      };
    }

    return {
      playCount: row.play_count,
      resumePositionSeconds: row.resume_position_seconds,
      lastPlayedAt: row.last_played_at
    };
  }

  markPlay(videoId: string, positionSeconds: number): PlaybackState {
    const normalizedVideoId = coerceVideoIdToCanonical(videoId);
    const currentState = this.getState(normalizedVideoId);
    const normalizedPositionSeconds = positionSeconds > 0.5 ? positionSeconds : currentState.resumePositionSeconds;
    const nextState: PlaybackState = {
      playCount: currentState.playCount + 1,
      resumePositionSeconds: normalizedPositionSeconds,
      lastPlayedAt: Math.floor(Date.now() / 1000)
    };

    this.saveState(normalizedVideoId, nextState);
    return nextState;
  }

  reportProgress(videoId: string, update: ProgressUpdate): PlaybackState {
    const normalizedVideoId = coerceVideoIdToCanonical(videoId);
    const currentState = this.getState(normalizedVideoId);
    const nextState: PlaybackState = {
      playCount: currentState.playCount,
      lastPlayedAt: currentState.lastPlayedAt,
      resumePositionSeconds: update.completed ? 0 : update.positionSeconds
    };

    this.saveState(normalizedVideoId, nextState);
    return nextState;
  }

  private saveState(videoId: string, state: PlaybackState): void {
    this.upsertStatement.run(
      videoId,
      state.playCount,
      state.resumePositionSeconds,
      state.lastPlayedAt,
      Math.floor(Date.now() / 1000)
    );
  }
}

export const playbackStateService = new PlaybackStateService();

export type { PlaybackState };
