import { db } from "../../db/index.js";

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
    const row = this.selectStatement.get(videoId);

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
    const currentState = this.getState(videoId);
    const nextState: PlaybackState = {
      playCount: currentState.playCount + 1,
      resumePositionSeconds: positionSeconds,
      lastPlayedAt: Math.floor(Date.now() / 1000)
    };

    this.saveState(videoId, nextState);
    return nextState;
  }

  reportProgress(videoId: string, update: ProgressUpdate): PlaybackState {
    const currentState = this.getState(videoId);
    const nextState: PlaybackState = {
      playCount: currentState.playCount,
      lastPlayedAt: currentState.lastPlayedAt,
      resumePositionSeconds: update.completed ? 0 : update.positionSeconds
    };

    this.saveState(videoId, nextState);
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
