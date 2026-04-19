import { Router } from "express";
import { z } from "zod";

import { mediaLibraryService } from "../services/library/mediaLibrary.js";
import { mountedFolderService } from "../services/library/mountedFolders.js";
import { playbackStateService } from "../services/library/playbackState.js";
import { AppError, sendSuccess } from "../utils/http.js";

export const foldersRouter = Router();

const optionalNameSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().trim().min(1).max(120).optional()
);

const createFolderSchema = z.object({
  autoScan: z.boolean().optional().default(false),
  maxDepth: z.number().int().min(0).nullable().optional().default(null),
  mountPath: z.string().trim().min(1),
  name: optionalNameSchema,
  scanIntervalMinutes: z.number().int().positive().nullable().optional().default(null)
});

foldersRouter.get("/", async (_request, response) => {
  const folders = await mediaLibraryService.listFolders();

  sendSuccess(
    response,
    folders.map((folder) => ({
      id: folder.id,
      name: folder.name,
      mountPath: folder.mountPath,
      isActive: folder.isActive,
      isSystem: folder.isSystem,
      autoScan: folder.autoScan,
      scanIntervalMinutes: folder.scanIntervalMinutes,
      maxDepth: folder.maxDepth,
      scanStatus: folder.scanStatus,
      lastScannedAt: folder.lastScannedAt,
      videoCount: folder.videoCount
    }))
  );
});

foldersRouter.post("/", async (request, response) => {
  const folder = await mountedFolderService.createFolder(createFolderSchema.parse(request.body));

  sendSuccess(
    response,
    {
      id: folder.folder.id,
      name: folder.folder.name,
      mountPath: folder.folder.mountPath,
      isActive: folder.folder.isActive,
      isSystem: mountedFolderService.isProtectedFolderId(folder.folder.id),
      autoScan: folder.folder.autoScan,
      scanIntervalMinutes: folder.folder.scanIntervalMinutes,
      maxDepth: folder.folder.maxDepth,
      scanStatus: folder.folder.scanStatus,
      lastScannedAt: folder.folder.lastScannedAt,
      videoCount: folder.videoCount
    },
    undefined,
    201
  );
});

foldersRouter.post("/:id/scan", async (request, response) => {
  const folder = await mountedFolderService.scanFolder(request.params.id);

  if (!folder) {
    throw new AppError(404, "FOLDER_NOT_FOUND", "Folder not found.");
  }

  sendSuccess(response, {
    id: folder.folder.id,
    name: folder.folder.name,
    mountPath: folder.folder.mountPath,
    scanStatus: folder.folder.scanStatus,
    lastScannedAt: folder.folder.lastScannedAt,
    videoCount: folder.videoCount
  }, undefined, 202);
});

foldersRouter.delete("/:id", async (request, response) => {
  const folder = await mountedFolderService.deleteFolder(request.params.id);

  if (!folder) {
    throw new AppError(404, "FOLDER_NOT_FOUND", "Folder not found.");
  }

  sendSuccess(response, {
    id: folder.id,
    removed: true
  });
});

foldersRouter.get("/:id/videos", async (request, response) => {
  const folder = await mediaLibraryService.findFolderById(request.params.id);

  if (!folder) {
    throw new AppError(404, "FOLDER_NOT_FOUND", "Folder not found.");
  }

  const videos = await mediaLibraryService.listVideosByFolderId(folder.id);

  sendSuccess(
    response,
    videos.map((video) => {
      const playbackState = playbackStateService.getState(video.id);

      return {
        id: video.id,
        folderId: video.folderId,
        folderName: video.folderName,
        title: video.title,
        sourceName: video.sourceName,
        streamUrl: `/stream/${video.id}`,
        mimeType: video.mimeType,
        sourceSize: video.sourceSize,
        playbackStatus: video.playbackStatus,
        durationSeconds: video.durationSeconds,
        width: video.width,
        height: video.height,
        thumbnailSmUrl: video.thumbnailSmPath ? `/api/videos/${video.id}/thumbnail-sm` : null,
        updatedAt: Math.floor(video.sourceMtimeMs / 1000),
        playCount: playbackState.playCount,
        resumePositionSeconds: playbackState.resumePositionSeconds
      };
    }),
    {
      folderName: folder.name,
      total: videos.length
    }
  );
});
