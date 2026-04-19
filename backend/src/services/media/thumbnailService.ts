import { execFile } from "node:child_process";
import { unlink } from "node:fs/promises";
import { promisify } from "node:util";

import { uploadStoreService } from "../storage/uploadStore.js";

const execFileAsync = promisify(execFile);

type ThumbnailArtifacts = {
  thumbnailPath: string | null;
  thumbnailSmPath: string | null;
};

function getCaptureTime(durationSeconds: number | null): string {
  if (!durationSeconds || durationSeconds <= 0) {
    return "1.000";
  }

  const captureTime = durationSeconds < 2 ? Math.max(durationSeconds / 2, 0.05) : 1;
  return captureTime.toFixed(3);
}

class ThumbnailService {
  private availabilityPromise: Promise<boolean> | null = null;

  async generateThumbnails(videoId: string, sourcePath: string, durationSeconds: number | null): Promise<ThumbnailArtifacts> {
    const thumbnailPath = uploadStoreService.getThumbnailPath(videoId);
    const thumbnailSmPath = uploadStoreService.getSmallThumbnailPath(videoId);

    await unlink(thumbnailPath).catch(() => undefined);
    await unlink(thumbnailSmPath).catch(() => undefined);

    try {
      const captureTime = getCaptureTime(durationSeconds);

      await execFileAsync(
        "ffmpeg",
        ["-v", "error", "-y", "-ss", captureTime, "-i", sourcePath, "-frames:v", "1", "-q:v", "2", thumbnailPath],
        { maxBuffer: 4 * 1024 * 1024 }
      );

      await execFileAsync(
        "ffmpeg",
        [
          "-v",
          "error",
          "-y",
          "-ss",
          captureTime,
          "-i",
          sourcePath,
          "-frames:v",
          "1",
          "-vf",
          "scale=min(360\\,iw):-2:force_original_aspect_ratio=decrease",
          "-q:v",
          "3",
          thumbnailSmPath
        ],
        { maxBuffer: 4 * 1024 * 1024 }
      );

      return {
        thumbnailPath,
        thumbnailSmPath
      };
    } catch {
      await unlink(thumbnailPath).catch(() => undefined);
      await unlink(thumbnailSmPath).catch(() => undefined);

      return {
        thumbnailPath: null,
        thumbnailSmPath: null
      };
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.availabilityPromise) {
      this.availabilityPromise = execFileAsync("ffmpeg", ["-version"])
        .then(() => true)
        .catch(() => false);
    }

    return this.availabilityPromise;
  }
}

export const thumbnailService = new ThumbnailService();
