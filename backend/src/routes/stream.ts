import { Router } from "express";

import { mediaLibraryService } from "../services/library/mediaLibrary.js";
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
  const video = await mediaLibraryService.findVideoById(request.params.id);

  if (!video) {
    throw new AppError(404, "VIDEO_NOT_FOUND", "Video not found.");
  }

  const rangeHeader = request.headers.range;

  response.setHeader("Accept-Ranges", "bytes");
  response.setHeader("Content-Type", video.mimeType);

  if (!rangeHeader) {
    response.setHeader("Content-Length", video.sourceSize);
    mediaLibraryService.createVideoStream(video.sourcePath).pipe(response);
    return;
  }

  const parsedRange = parseRangeHeader(rangeHeader, video.sourceSize);

  if (!parsedRange) {
    response.setHeader("Content-Range", `bytes */${video.sourceSize}`);
    throw new AppError(416, "RANGE_NOT_SATISFIABLE", "Requested range is invalid.");
  }

  const { start, end } = parsedRange;
  response.status(206);
  response.setHeader("Content-Length", end - start + 1);
  response.setHeader("Content-Range", `bytes ${start}-${end}/${video.sourceSize}`);
  mediaLibraryService.createVideoStream(video.sourcePath, start, end).pipe(response);
});
