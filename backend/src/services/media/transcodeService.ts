import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { unlink, rename } from "node:fs/promises";
import { promisify } from "node:util";

import { uploadStoreService } from "../storage/uploadStore.js";

const execFileAsync = promisify(execFile);

class TranscodeError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean
  ) {
    super(message);
    this.name = "TranscodeError";
  }
}

function normalizeError(error: unknown): TranscodeError {
  if (error instanceof TranscodeError) {
    return error;
  }

  const errorCode =
    typeof error === "object" && error !== null && "code" in error && typeof error.code === "string" ? error.code : null;
  const stderr =
    typeof error === "object" && error !== null && "stderr" in error && typeof error.stderr === "string"
      ? error.stderr.trim()
      : "";
  const message = stderr || (error instanceof Error ? error.message : "ffmpeg transcode failed.");

  if (errorCode === "ENOENT" || /No such file or directory/i.test(message)) {
    return new TranscodeError(message, false);
  }

  return new TranscodeError(message, true);
}

class TranscodeService {
  getPlaybackPath(videoId: string): string {
    return `${uploadStoreService.getTranscodesDirectory()}/${videoId}.mp4`;
  }

  async transcodeVideo(videoId: string, sourcePath: string): Promise<string> {
    const finalPlaybackPath = this.getPlaybackPath(videoId);
    const tempPlaybackPath = `${finalPlaybackPath}.${randomUUID()}.tmp.mp4`;

    await unlink(tempPlaybackPath).catch(() => undefined);

    try {
      await execFileAsync(
        "ffmpeg",
        [
          "-v",
          "error",
          "-y",
          "-i",
          sourcePath,
          "-map",
          "0:v:0",
          "-map",
          "0:a:0?",
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "23",
          "-pix_fmt",
          "yuv420p",
          "-c:a",
          "aac",
          "-f",
          "mp4",
          "-movflags",
          "+faststart",
          tempPlaybackPath
        ],
        { maxBuffer: 8 * 1024 * 1024 }
      );

      await rename(tempPlaybackPath, finalPlaybackPath);

      return finalPlaybackPath;
    } catch (error) {
      await unlink(tempPlaybackPath).catch(() => undefined);
      throw normalizeError(error);
    }
  }
}

export const transcodeService = new TranscodeService();

export { TranscodeError };
