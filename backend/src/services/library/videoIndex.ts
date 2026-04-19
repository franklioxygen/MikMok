import { createHash } from "node:crypto";

import { db } from "../../db/index.js";
import type { PlaybackStatus } from "../media/playbackPolicy.js";
import type { ScannedVideo } from "./scanner.js";

type PersistedVideoInput = ScannedVideo & {
  audioCodec: string | null;
  container: string | null;
  durationSeconds: number | null;
  fps: number | null;
  height: number | null;
  playbackPath: string | null;
  playbackStatus: string;
  thumbnailPath: string | null;
  thumbnailSmPath: string | null;
  videoCodec: string | null;
  width: number | null;
};

type IndexedVideoRow = {
  audio_codec: string | null;
  container: string | null;
  duration_seconds: number | null;
  extension: string;
  fps: number | null;
  folder_id: string;
  folder_name: string;
  folder_path: string;
  height: number | null;
  id: string;
  mime_type: string;
  playback_path: string | null;
  playback_status: string | null;
  source_mtime_ms: number;
  source_name: string;
  source_path: string;
  source_size: number;
  thumbnail_path: string | null;
  thumbnail_sm_path: string | null;
  title: string;
  video_codec: string | null;
  width: number | null;
};

type IndexedVideo = {
  audioCodec: string | null;
  container: string | null;
  durationSeconds: number | null;
  extension: string;
  fps: number | null;
  folderId: string;
  folderName: string;
  folderPath: string;
  height: number | null;
  id: string;
  mimeType: string;
  playbackPath: string | null;
  playbackStatus: string;
  sourceMtimeMs: number;
  sourceName: string;
  sourcePath: string;
  sourceSize: number;
  thumbnailPath: string | null;
  thumbnailSmPath: string | null;
  title: string;
  videoCodec: string | null;
  width: number | null;
};

type FolderVideoCountRow = {
  folder_id: string;
  video_count: number;
};

type VideoIdRow = {
  id: string;
};

type UpdatePlaybackArtifactsInput = {
  playbackPath: string | null;
  playbackStatus: PlaybackStatus;
};

function normalizeIndexedVideo(row: IndexedVideoRow): IndexedVideo {
  return {
    id: row.id,
    title: row.title,
    sourceName: row.source_name,
    sourcePath: row.source_path,
    sourceSize: row.source_size,
    sourceMtimeMs: row.source_mtime_ms,
    folderId: row.folder_id,
    folderName: row.folder_name,
    folderPath: row.folder_path,
    container: row.container,
    extension: row.extension,
    mimeType: row.mime_type,
    videoCodec: row.video_codec,
    audioCodec: row.audio_codec,
    durationSeconds: row.duration_seconds,
    width: row.width,
    height: row.height,
    fps: row.fps,
    thumbnailPath: row.thumbnail_path,
    thumbnailSmPath: row.thumbnail_sm_path,
    playbackPath: row.playback_path,
    playbackStatus: row.playback_status ?? "direct"
  };
}

function buildVideoId(sourcePath: string): string {
  return createHash("sha1").update(sourcePath).digest("hex");
}

class VideoIndexService {
  private readonly baseSelect = `
    SELECT
      videos.id,
      videos.title,
      videos.source_name,
      videos.source_path,
      videos.source_size,
      videos.source_mtime_ms,
      videos.mime_type,
      videos.extension,
      videos.container,
      videos.video_codec,
      videos.audio_codec,
      videos.duration_seconds,
      videos.width,
      videos.height,
      videos.fps,
      videos.thumbnail_path,
      videos.thumbnail_sm_path,
      videos.playback_path,
      videos.playback_status,
      mounted_folders.id AS folder_id,
      mounted_folders.name AS folder_name,
      mounted_folders.mount_path AS folder_path
    FROM videos
    INNER JOIN mounted_folders ON mounted_folders.id = videos.folder_id
  `;

  private readonly insertStatement = db.prepare(`
    INSERT INTO videos (
      id,
      folder_id,
      title,
      source_name,
      source_path,
      mime_type,
      extension,
      container,
      video_codec,
      audio_codec,
      duration_seconds,
      width,
      height,
      fps,
      thumbnail_path,
      thumbnail_sm_path,
      playback_path,
      playback_status,
      source_size,
      source_mtime_ms,
      indexed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  private readonly deleteByFolderStatement = db.prepare("DELETE FROM videos WHERE folder_id = ?");

  private readonly replaceFolderVideosTransaction = db.transaction(
    (folderId: string, scannedVideos: PersistedVideoInput[], indexedAt: number) => {
      this.deleteByFolderStatement.run(folderId);

      for (const video of scannedVideos) {
        this.insertStatement.run(
          buildVideoId(video.sourcePath),
          folderId,
          video.title,
          video.sourceName,
          video.sourcePath,
          video.mimeType,
          video.extension,
          video.container,
          video.videoCodec,
          video.audioCodec,
          video.durationSeconds,
          video.width,
          video.height,
          video.fps,
          video.thumbnailPath,
          video.thumbnailSmPath,
          video.playbackPath,
          video.playbackStatus,
          video.sourceSize,
          video.sourceMtimeMs,
          indexedAt
        );
      }
    }
  );

  listFeedVideos(): IndexedVideo[] {
    const rows = db
      .prepare(
        `${this.baseSelect} WHERE mounted_folders.is_active = 1 AND COALESCE(videos.playback_status, 'direct') IN ('direct', 'ready') ORDER BY videos.source_mtime_ms DESC, videos.title ASC`
      )
      .all() as IndexedVideoRow[];

    return rows.map((row) => normalizeIndexedVideo(row));
  }

  findActiveVideoById(videoId: string): IndexedVideo | null {
    const row = db
      .prepare(`${this.baseSelect} WHERE videos.id = ? AND mounted_folders.is_active = 1 LIMIT 1`)
      .get(videoId) as IndexedVideoRow | undefined;

    return row ? normalizeIndexedVideo(row) : null;
  }

  findVideoById(videoId: string): IndexedVideo | null {
    const row = db.prepare(`${this.baseSelect} WHERE videos.id = ? LIMIT 1`).get(videoId) as IndexedVideoRow | undefined;

    return row ? normalizeIndexedVideo(row) : null;
  }

  findVideoBySourcePath(sourcePath: string): IndexedVideo | null {
    const row = db.prepare(`${this.baseSelect} WHERE videos.source_path = ? LIMIT 1`).get(sourcePath) as
      | IndexedVideoRow
      | undefined;

    return row ? normalizeIndexedVideo(row) : null;
  }

  listVideosByFolderId(folderId: string): IndexedVideo[] {
    const rows = db
      .prepare(`${this.baseSelect} WHERE videos.folder_id = ? ORDER BY videos.source_mtime_ms DESC, videos.title ASC`)
      .all(folderId) as IndexedVideoRow[];

    return rows.map((row) => normalizeIndexedVideo(row));
  }

  listPendingTranscodeVideoIds(): string[] {
    const rows = db
      .prepare(
        `
          SELECT id
          FROM videos
          WHERE COALESCE(playback_status, 'direct') = 'needs_transcode'
        `
      )
      .all() as VideoIdRow[];

    return rows.map((row) => row.id);
  }

  replaceFolderVideos(folderId: string, scannedVideos: PersistedVideoInput[]): number {
    this.replaceFolderVideosTransaction(folderId, scannedVideos, Math.floor(Date.now() / 1000));
    return scannedVideos.length;
  }

  repairLegacyDirectPlaybackCandidates(): string[] {
    const rows = db
      .prepare(
        `
          SELECT id
          FROM videos
          WHERE COALESCE(playback_status, 'direct') = 'direct'
            AND (mime_type = 'video/mp4' OR extension IN ('.mp4', '.m4v'))
            AND (
              TRIM(COALESCE(video_codec, '')) = ''
              OR LOWER(TRIM(video_codec)) <> 'h264'
              OR (
                TRIM(COALESCE(audio_codec, '')) <> ''
                AND LOWER(TRIM(audio_codec)) <> 'aac'
              )
            )
        `
      )
      .all() as VideoIdRow[];

    if (rows.length === 0) {
      return [];
    }

    const updateTransaction = db.transaction((videoIds: string[]) => {
      const statement = db.prepare("UPDATE videos SET playback_path = NULL, playback_status = 'needs_transcode' WHERE id = ?");

      for (const videoId of videoIds) {
        statement.run(videoId);
      }
    });

    const videoIds = rows.map((row) => row.id);
    updateTransaction(videoIds);
    return videoIds;
  }

  clearFolderVideos(folderId: string): void {
    this.deleteByFolderStatement.run(folderId);
  }

  updatePlaybackArtifacts(videoId: string, input: UpdatePlaybackArtifactsInput): void {
    db.prepare("UPDATE videos SET playback_path = ?, playback_status = ? WHERE id = ?")
      .run(input.playbackPath, input.playbackStatus, videoId);
  }

  updatePlaybackStatus(videoId: string, playbackStatus: PlaybackStatus): void {
    db.prepare("UPDATE videos SET playback_status = ? WHERE id = ?").run(playbackStatus, videoId);
  }

  getVideoCountByFolderIds(folderIds: string[]): Map<string, number> {
    if (folderIds.length === 0) {
      return new Map();
    }

    const placeholders = folderIds.map(() => "?").join(", ");
    const rows = db
      .prepare(`
        SELECT
          folder_id,
          COUNT(*) AS video_count
        FROM videos
        WHERE folder_id IN (${placeholders})
        GROUP BY folder_id
      `)
      .all(...folderIds) as FolderVideoCountRow[];

    return new Map(rows.map((row) => [row.folder_id, row.video_count]));
  }

  getVideoCountByFolderId(folderId: string): number {
    const counts = this.getVideoCountByFolderIds([folderId]);
    return counts.get(folderId) ?? 0;
  }
}

export const videoIndexService = new VideoIndexService();

export { buildVideoId };
export type { IndexedVideo };
