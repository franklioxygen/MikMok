import { constants } from "node:fs";
import { access } from "node:fs/promises";

import { Router } from "express";
import { z } from "zod";

import { myTubeAdapterService } from "../services/integrations/mytubeAdapter.js";
import { createLocalCanonicalVideoId, parseCanonicalVideoId } from "../services/integrations/videoIds.js";
import { mediaLibraryService } from "../services/library/mediaLibrary.js";
import { playbackStateService } from "../services/library/playbackState.js";
import { pipeUpstreamResponse } from "../utils/proxy.js";
import { AppError, sendSuccess } from "../utils/http.js";

export const videosRouter = Router();

const playSchema = z.object({
  positionSeconds: z.number().min(0).default(0)
});

const progressSchema = z.object({
  completed: z.boolean().optional().default(false),
  positionSeconds: z.number().min(0)
});

function buildLocalFeedVideo(video: Awaited<ReturnType<typeof mediaLibraryService.listVideos>>[number]) {
  const canonicalVideoId = createLocalCanonicalVideoId(video.id);

  return {
    id: canonicalVideoId,
    title: video.title,
    folderId: video.folderId,
    sourceName: video.sourceName,
    folderName: video.folderName,
    streamUrl: `/stream/${encodeURIComponent(canonicalVideoId)}`,
    mimeType: video.mimeType,
    sourceSize: video.sourceSize,
    playbackStatus: video.playbackStatus,
    durationSeconds: video.durationSeconds,
    width: video.width,
    height: video.height,
    thumbnailSmUrl: video.thumbnailSmPath ? `/api/videos/${encodeURIComponent(canonicalVideoId)}/thumbnail-sm` : null,
    updatedAt: Math.floor(video.sourceMtimeMs / 1000),
    author: null,
    collections: [],
    remoteSourceId: null,
    remoteVideoId: null
  };
}

videosRouter.get("/feed", async (_request, response) => {
  const localVideos = await mediaLibraryService.listVideos();
  const remoteVideos = await myTubeAdapterService.listFeedVideos().catch((error) => {
    console.error("Failed to load MyTube feed videos.", error);
    return [];
  });
  const videos = [...localVideos.map((video) => buildLocalFeedVideo(video)), ...remoteVideos].sort(
    (left, right) => right.updatedAt - left.updatedAt || left.title.localeCompare(right.title)
  );

  sendSuccess(response, videos, {
    hasMore: false,
    total: videos.length
  });
});

videosRouter.get("/:id", async (request, response) => {
  const parsedVideoId = parseCanonicalVideoId(request.params.id);

  if (parsedVideoId?.kind === "mytube") {
    const remoteVideo = await myTubeAdapterService.findVideoDetailsByCanonicalId(parsedVideoId.canonicalId);

    if (!remoteVideo) {
      throw new AppError(404, "VIDEO_NOT_FOUND", "Video not found.");
    }

    const playbackState = playbackStateService.getState(remoteVideo.id);

    sendSuccess(response, {
      ...remoteVideo,
      playCount: playbackState.playCount,
      resumePositionSeconds: playbackState.resumePositionSeconds,
      lastPlayedAt: playbackState.lastPlayedAt
    });
    return;
  }

  const localVideoId = parsedVideoId?.kind === "local" ? parsedVideoId.localVideoId : request.params.id;
  const video = await mediaLibraryService.findVideoById(localVideoId);

  if (!video) {
    throw new AppError(404, "VIDEO_NOT_FOUND", "Video not found.");
  }

  const canonicalVideoId = createLocalCanonicalVideoId(video.id);
  const playbackState = playbackStateService.getState(canonicalVideoId);

  sendSuccess(response, {
    id: canonicalVideoId,
    title: video.title,
    sourceName: video.sourceName,
    folderId: video.folderId,
    folderName: video.folderName,
    folderPath: video.folderPath,
    streamUrl: `/stream/${encodeURIComponent(canonicalVideoId)}`,
    mimeType: video.mimeType,
    sourceSize: video.sourceSize,
    playbackStatus: video.playbackStatus,
    durationSeconds: video.durationSeconds,
    width: video.width,
    height: video.height,
    fps: video.fps,
    videoCodec: video.videoCodec,
    audioCodec: video.audioCodec,
    thumbnailUrl: video.thumbnailPath ? `/api/videos/${encodeURIComponent(canonicalVideoId)}/thumbnail` : null,
    thumbnailSmUrl: video.thumbnailSmPath ? `/api/videos/${encodeURIComponent(canonicalVideoId)}/thumbnail-sm` : null,
    author: null,
    collections: [],
    remoteSourceId: null,
    remoteVideoId: null,
    playCount: playbackState.playCount,
    resumePositionSeconds: playbackState.resumePositionSeconds,
    lastPlayedAt: playbackState.lastPlayedAt,
    updatedAt: Math.floor(video.sourceMtimeMs / 1000)
  });
});

videosRouter.get("/:id/thumbnail", async (request, response) => {
  const parsedVideoId = parseCanonicalVideoId(request.params.id);

  if (parsedVideoId?.kind === "mytube") {
    const upstreamResponse = await myTubeAdapterService.fetchThumbnail(
      parsedVideoId.remoteSourceId,
      parsedVideoId.remoteVideoId,
      request,
      "full"
    );

    await pipeUpstreamResponse(upstreamResponse, response);
    return;
  }

  const localVideoId = parsedVideoId?.kind === "local" ? parsedVideoId.localVideoId : request.params.id;
  const video = await mediaLibraryService.findVideoById(localVideoId);

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
  const parsedVideoId = parseCanonicalVideoId(request.params.id);

  if (parsedVideoId?.kind === "mytube") {
    const upstreamResponse = await myTubeAdapterService.fetchThumbnail(
      parsedVideoId.remoteSourceId,
      parsedVideoId.remoteVideoId,
      request,
      "sm"
    );

    await pipeUpstreamResponse(upstreamResponse, response);
    return;
  }

  const localVideoId = parsedVideoId?.kind === "local" ? parsedVideoId.localVideoId : request.params.id;
  const video = await mediaLibraryService.findVideoById(localVideoId);

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
  const parsedVideoId = parseCanonicalVideoId(request.params.id);
  const canonicalVideoId =
    parsedVideoId?.kind === "mytube"
      ? parsedVideoId.canonicalId
      : createLocalCanonicalVideoId(parsedVideoId?.kind === "local" ? parsedVideoId.localVideoId : request.params.id);

  if (parsedVideoId?.kind === "mytube") {
    const remoteVideo = await myTubeAdapterService.findVideoDetailsByCanonicalId(parsedVideoId.canonicalId);

    if (!remoteVideo) {
      throw new AppError(404, "VIDEO_NOT_FOUND", "Video not found.");
    }
  } else {
    const localVideoId = parsedVideoId?.kind === "local" ? parsedVideoId.localVideoId : request.params.id;
    const video = await mediaLibraryService.findVideoById(localVideoId);

    if (!video) {
      throw new AppError(404, "VIDEO_NOT_FOUND", "Video not found.");
    }
  }

  const { positionSeconds } = playSchema.parse(request.body);
  const playbackState = playbackStateService.markPlay(canonicalVideoId, positionSeconds);

  sendSuccess(response, {
    id: canonicalVideoId,
    lastPlayedAt: playbackState.lastPlayedAt,
    playCount: playbackState.playCount,
    resumePositionSeconds: playbackState.resumePositionSeconds
  });
});

videosRouter.post("/:id/progress", async (request, response) => {
  const parsedVideoId = parseCanonicalVideoId(request.params.id);
  const canonicalVideoId =
    parsedVideoId?.kind === "mytube"
      ? parsedVideoId.canonicalId
      : createLocalCanonicalVideoId(parsedVideoId?.kind === "local" ? parsedVideoId.localVideoId : request.params.id);

  if (parsedVideoId?.kind === "mytube") {
    const remoteVideo = await myTubeAdapterService.findVideoDetailsByCanonicalId(parsedVideoId.canonicalId);

    if (!remoteVideo) {
      throw new AppError(404, "VIDEO_NOT_FOUND", "Video not found.");
    }
  } else {
    const localVideoId = parsedVideoId?.kind === "local" ? parsedVideoId.localVideoId : request.params.id;
    const video = await mediaLibraryService.findVideoById(localVideoId);

    if (!video) {
      throw new AppError(404, "VIDEO_NOT_FOUND", "Video not found.");
    }
  }

  const { completed, positionSeconds } = progressSchema.parse(request.body);
  const playbackState = playbackStateService.reportProgress(canonicalVideoId, {
    completed,
    positionSeconds
  });

  sendSuccess(response, {
    id: canonicalVideoId,
    lastPlayedAt: playbackState.lastPlayedAt,
    playCount: playbackState.playCount,
    resumePositionSeconds: playbackState.resumePositionSeconds
  });
});
