import { createReadStream } from "node:fs";

import { mountedFolderService } from "./mountedFolders.js";
import { videoIndexService, type IndexedVideo } from "./videoIndex.js";

type LibraryVideo = IndexedVideo;

type LibraryFolder = {
  autoScan: boolean;
  id: string;
  isActive: boolean;
  isSystem: boolean;
  lastScannedAt: number | null;
  maxDepth: number | null;
  mountPath: string;
  name: string;
  scanIntervalMinutes: number | null;
  scanStatus: string;
  updatedAt: number;
  videoCount: number;
};

class MediaLibraryService {
  async listVideos(): Promise<LibraryVideo[]> {
    await mountedFolderService.ensureSeededFromAllowedRoots();
    return videoIndexService.listActiveVideos();
  }

  async listFolders(): Promise<LibraryFolder[]> {
    const folders = await mountedFolderService.listFolders();
    const videoCounts = videoIndexService.getVideoCountByFolderIds(folders.map((folder) => folder.id));

    return folders
      .map((folder) => ({
        id: folder.id,
        name: folder.name,
        mountPath: folder.mountPath,
        isActive: folder.isActive,
        isSystem: mountedFolderService.isProtectedFolderId(folder.id),
        autoScan: folder.autoScan,
        scanIntervalMinutes: folder.scanIntervalMinutes,
        maxDepth: folder.maxDepth,
        scanStatus: folder.scanStatus,
        lastScannedAt: folder.lastScannedAt,
        updatedAt: folder.updatedAt,
        videoCount: videoCounts.get(folder.id) ?? 0
      }))
      .sort(
        (left, right) =>
          Number(right.isActive) - Number(left.isActive) ||
          right.videoCount - left.videoCount ||
          left.name.localeCompare(right.name)
      );
  }

  async findVideoById(videoId: string): Promise<LibraryVideo | null> {
    await mountedFolderService.ensureSeededFromAllowedRoots();
    return videoIndexService.findActiveVideoById(videoId);
  }

  async findFolderById(folderId: string): Promise<LibraryFolder | null> {
    const folder = await mountedFolderService.findFolderById(folderId);

    if (!folder) {
      return null;
    }

    return {
      id: folder.id,
      name: folder.name,
      mountPath: folder.mountPath,
      isActive: folder.isActive,
      isSystem: mountedFolderService.isProtectedFolderId(folder.id),
      autoScan: folder.autoScan,
      scanIntervalMinutes: folder.scanIntervalMinutes,
      maxDepth: folder.maxDepth,
      scanStatus: folder.scanStatus,
      lastScannedAt: folder.lastScannedAt,
      updatedAt: folder.updatedAt,
      videoCount: videoIndexService.getVideoCountByFolderId(folder.id)
    };
  }

  async listVideosByFolderId(folderId: string): Promise<LibraryVideo[]> {
    await mountedFolderService.ensureSeededFromAllowedRoots();
    return videoIndexService.listVideosByFolderId(folderId);
  }

  createVideoStream(sourcePath: string, start?: number, end?: number) {
    return createReadStream(sourcePath, {
      start,
      end
    });
  }
}

export const mediaLibraryService = new MediaLibraryService();

export type { LibraryFolder, LibraryVideo };
