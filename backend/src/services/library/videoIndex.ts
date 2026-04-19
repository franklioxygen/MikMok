import { createHash } from "node:crypto";

import { db } from "../../db/index.js";
import type { ScannedVideo } from "./scanner.js";

type IndexedVideoRow = {
  extension: string;
  folder_id: string;
  folder_name: string;
  folder_path: string;
  id: string;
  mime_type: string;
  source_mtime_ms: number;
  source_name: string;
  source_path: string;
  source_size: number;
  title: string;
};

type IndexedVideo = {
  extension: string;
  folderId: string;
  folderName: string;
  folderPath: string;
  id: string;
  mimeType: string;
  sourceMtimeMs: number;
  sourceName: string;
  sourcePath: string;
  sourceSize: number;
  title: string;
};

type FolderVideoCountRow = {
  folder_id: string;
  video_count: number;
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
    extension: row.extension,
    mimeType: row.mime_type
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
      source_size,
      source_mtime_ms,
      indexed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  private readonly deleteByFolderStatement = db.prepare("DELETE FROM videos WHERE folder_id = ?");

  private readonly replaceFolderVideosTransaction = db.transaction(
    (folderId: string, scannedVideos: ScannedVideo[], indexedAt: number) => {
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
          video.sourceSize,
          video.sourceMtimeMs,
          indexedAt
        );
      }
    }
  );

  listActiveVideos(): IndexedVideo[] {
    const rows = db
      .prepare(`${this.baseSelect} WHERE mounted_folders.is_active = 1 ORDER BY videos.source_mtime_ms DESC, videos.title ASC`)
      .all() as IndexedVideoRow[];

    return rows.map((row) => normalizeIndexedVideo(row));
  }

  findActiveVideoById(videoId: string): IndexedVideo | null {
    const row = db
      .prepare(`${this.baseSelect} WHERE videos.id = ? AND mounted_folders.is_active = 1 LIMIT 1`)
      .get(videoId) as IndexedVideoRow | undefined;

    return row ? normalizeIndexedVideo(row) : null;
  }

  listVideosByFolderId(folderId: string): IndexedVideo[] {
    const rows = db
      .prepare(`${this.baseSelect} WHERE videos.folder_id = ? ORDER BY videos.source_mtime_ms DESC, videos.title ASC`)
      .all(folderId) as IndexedVideoRow[];

    return rows.map((row) => normalizeIndexedVideo(row));
  }

  replaceFolderVideos(folderId: string, scannedVideos: ScannedVideo[]): number {
    this.replaceFolderVideosTransaction(folderId, scannedVideos, Math.floor(Date.now() / 1000));
    return scannedVideos.length;
  }

  clearFolderVideos(folderId: string): void {
    this.deleteByFolderStatement.run(folderId);
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

export type { IndexedVideo };
