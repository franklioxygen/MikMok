import { constants } from "node:fs";
import { access } from "node:fs/promises";

import { Router } from "express";
import { z } from "zod";

import { mediaLibraryService } from "../services/library/mediaLibrary.js";
import { playbackStateService } from "../services/library/playbackState.js";
import { AppError, sendSuccess } from "../utils/http.js";

export const videosRouter = Router();

const playSchema = z.object({
  positionSeconds: z.number().min(0).default(0)
});

const progressSchema = z.object({
  completed: z.boolean().optional().default(false),
  positionSeconds: z.number().min(0)
});

videosRouter.get("/feed", async (_request, response) => {
  const videos = await mediaLibraryService.listVideos();

  sendSuccess(
    response,
    videos.map((video) => ({
      id: video.id,
      title: video.title,
      folderId: video.folderId,
      sourceName: video.sourceName,
      folderName: video.folderName,
      streamUrl: `/stream/${video.id}`,
      mimeType: video.mimeType,
      sourceSize: video.sourceSize,
      playbackStatus: video.playbackStatus,
      durationSeconds: video.durationSeconds,
      width: video.width,
      height: video.height,
      thumbnailSmUrl: video.thumbnailSmPath ? `/api/videos/${video.id}/thumbnail-sm` : null,
      updatedAt: Math.floor(video.sourceMtimeMs / 1000)
    })),
    {
      hasMore: false,
      total: videos.length
    }
  );
});

videosRouter.get("/:id", async (request, response) => {
  const video = await mediaLibraryService.findVideoById(request.params.id);

  if (!video) {
    throw new AppError(404, "VIDEO_NOT_FOUND", "Video not found.");
  }

  const playbackState = playbackStateService.getState(video.id);

  sendSuccess(response, {
    id: video.id,
    title: video.title,
    sourceName: video.sourceName,
    folderId: video.folderId,
    folderName: video.folderName,
    folderPath: video.folderPath,
    streamUrl: `/stream/${video.id}`,
    mimeType: video.mimeType,
    sourceSize: video.sourceSize,
    playbackStatus: video.playbackStatus,
    durationSeconds: video.durationSeconds,
    width: video.width,
    height: video.height,
    fps: video.fps,
    videoCodec: video.videoCodec,
    audioCodec: video.audioCodec,
    thumbnailUrl: video.thumbnailPath ? `/api/videos/${video.id}/thumbnail` : null,
    thumbnailSmUrl: video.thumbnailSmPath ? `/api/videos/${video.id}/thumbnail-sm` : null,
    playCount: playbackState.playCount,
    resumePositionSeconds: playbackState.resumePositionSeconds,
    lastPlayedAt: playbackState.lastPlayedAt,
    updatedAt: Math.floor(video.sourceMtimeMs / 1000)
  });
});

videosRouter.get("/:id/thumbnail", async (request, response) => {
  const video = await mediaLibraryService.findVideoById(request.params.id);

  if (!video) {
    throw new AppError(404, "VIDEO_NOT_FOUND", "Video not found.");
  }

  if (!video.thumbnailPath) {
    throw new AppError(404, "THUMBNAIL_NOT_FOUND", "Thumbnail not found.");
  }

  try {
    await access(video.thumbnailPath, constants.R_OK);
  } catch {
    throw new AppError(404, "THUMBNAIL_NOT_FOUND", "Thumbnail not found.");
  }

  response.type("jpg");
  response.sendFile(video.thumbnailPath);
});

videosRouter.get("/:id/thumbnail-sm", async (request, response) => {
  const video = await mediaLibraryService.findVideoById(request.params.id);

  if (!video) {
    throw new AppError(404, "VIDEO_NOT_FOUND", "Video not found.");
  }

  const thumbnailPath = video.thumbnailSmPath ?? video.thumbnailPath;

  if (!thumbnailPath) {
    throw new AppError(404, "THUMBNAIL_NOT_FOUND", "Thumbnail not found.");
  }

  try {
    await access(thumbnailPath, constants.R_OK);
  } catch {
    throw new AppError(404, "THUMBNAIL_NOT_FOUND", "Thumbnail not found.");
  }

  response.type("jpg");
  response.sendFile(thumbnailPath);
});

videosRouter.post("/:id/play", async (request, response) => {
  const video = await mediaLibraryService.findVideoById(request.params.id);

  if (!video) {
    throw new AppError(404, "VIDEO_NOT_FOUND", "Video not found.");
  }

  const { positionSeconds } = playSchema.parse(request.body);
  const playbackState = playbackStateService.markPlay(video.id, positionSeconds);

  sendSuccess(response, {
    id: video.id,
    lastPlayedAt: playbackState.lastPlayedAt,
    playCount: playbackState.playCount,
    resumePositionSeconds: playbackState.resumePositionSeconds
  });
});

videosRouter.post("/:id/progress", async (request, response) => {
  const video = await mediaLibraryService.findVideoById(request.params.id);

  if (!video) {
    throw new AppError(404, "VIDEO_NOT_FOUND", "Video not found.");
  }

  const { completed, positionSeconds } = progressSchema.parse(request.body);
  const playbackState = playbackStateService.reportProgress(video.id, {
    completed,
    positionSeconds
  });

  sendSuccess(response, {
    id: video.id,
    lastPlayedAt: playbackState.lastPlayedAt,
    playCount: playbackState.playCount,
    resumePositionSeconds: playbackState.resumePositionSeconds
  });
});
