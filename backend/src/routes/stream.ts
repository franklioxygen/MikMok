import { stat } from "node:fs/promises";

import { Router } from "express";

import { myTubeAdapterService } from "../services/integrations/mytubeAdapter.js";
import { parseCanonicalVideoId } from "../services/integrations/videoIds.js";
import { mediaLibraryService } from "../services/library/mediaLibrary.js";
import { isPlayablePlaybackStatus } from "../services/media/playbackPolicy.js";
import { pipeUpstreamResponse } from "../utils/proxy.js";
import { AppError } from "../utils/http.js";

function parseRangeHeader(rangeHeader: string, fileSize: number): { end: number; start: number } | null {
  const matched = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader);

  if (!matched) {
    return null;
  }

  const [, startRaw, endRaw] = matched;
  const parsedStart = startRaw ? Number.parseInt(startRaw, 10) : Number.NaN;
  const parsedEnd = endRaw ? Number.parseInt(endRaw, 10) : Number.NaN;

  let start = Number.isNaN(parsedStart) ? 0 : parsedStart;
  let end = Number.isNaN(parsedEnd) ? fileSize - 1 : parsedEnd;

  if (!Number.isNaN(parsedStart) && Number.isNaN(parsedEnd)) {
    end = fileSize - 1;
  }

  if (Number.isNaN(parsedStart) && !Number.isNaN(parsedEnd)) {
    start = Math.max(fileSize - parsedEnd, 0);
    end = fileSize - 1;
  }

  if (start < 0 || end < start || start >= fileSize) {
    return null;
  }

  return {
    start,
    end: Math.min(end, fileSize - 1)
  };
}

export const streamRouter = Router();

streamRouter.get("/:id", async (request, response) => {
  const parsedVideoId = parseCanonicalVideoId(request.params.id);

  if (parsedVideoId?.kind === "mytube") {
    const upstreamResponse = await myTubeAdapterService.fetchVideoStream(
      parsedVideoId.remoteSourceId,
      parsedVideoId.remoteVideoId,
      request
    );

    await pipeUpstreamResponse(upstreamResponse, response);
    return;
  }

  const localVideoId = parsedVideoId?.kind === "local" ? parsedVideoId.localVideoId : request.params.id;
  const video = await mediaLibraryService.findVideoById(localVideoId);

  if (!video) {
    throw new AppError(404, "VIDEO_NOT_FOUND", "Video not found.");
  }

  if (!isPlayablePlaybackStatus(video.playbackStatus)) {
    throw new AppError(409, "VIDEO_NOT_PLAYABLE", "Video is not ready for direct playback.");
  }

  const playbackSourcePath = video.playbackPath ?? video.sourcePath;
  const playbackFileStat = await stat(playbackSourcePath).catch(() => null);

  if (!playbackFileStat?.isFile()) {
    throw new AppError(404, "FILE_MISSING", "Video file is missing.");
  }

  const playbackFileSize = playbackFileStat.size;
  const playbackFileMtimeMs = Math.floor(playbackFileStat.mtimeMs);
  const streamEtag = `W/"${playbackFileSize.toString(16)}-${playbackFileMtimeMs.toString(16)}"`;

  const rangeHeader = request.headers.range;
  const playbackMimeType = video.playbackStatus === "ready" && video.playbackPath ? "video/mp4" : video.mimeType;

  response.setHeader("Accept-Ranges", "bytes");
  response.setHeader("Cache-Control", "private, max-age=120");
  response.setHeader("Content-Type", playbackMimeType);
  response.setHeader("ETag", streamEtag);
  response.setHeader("Last-Modified", playbackFileStat.mtime.toUTCString());

  if (!rangeHeader) {
    if (request.headers["if-none-match"] === streamEtag) {
      response.status(304).end();
      return;
    }

    response.setHeader("Content-Length", playbackFileSize);
    mediaLibraryService.createVideoStream(playbackSourcePath).pipe(response);
    return;
  }

  const parsedRange = parseRangeHeader(rangeHeader, playbackFileSize);

  if (!parsedRange) {
    response.setHeader("Content-Range", `bytes */${playbackFileSize}`);
    throw new AppError(416, "RANGE_NOT_SATISFIABLE", "Requested range is invalid.");
  }

  const { start, end } = parsedRange;
  response.status(206);
  response.setHeader("Content-Length", end - start + 1);
  response.setHeader("Content-Range", `bytes ${start}-${end}/${playbackFileSize}`);
  mediaLibraryService.createVideoStream(playbackSourcePath, start, end).pipe(response);
});
