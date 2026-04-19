import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type ProbeStream = {
  avg_frame_rate?: string;
  codec_name?: string;
  codec_type?: string;
  duration?: string;
  height?: number;
  r_frame_rate?: string;
  width?: number;
};

type ProbeFormat = {
  duration?: string;
};

type ProbePayload = {
  format?: ProbeFormat;
  streams?: ProbeStream[];
};

type ExtractedVideoMetadata = {
  audioCodec: string | null;
  durationSeconds: number | null;
  fps: number | null;
  videoCodec: string | null;
  width: number | null;
  height: number | null;
};

function parseOptionalNumber(value: number | string | undefined): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFrameRate(frameRate: string | undefined): number | null {
  if (!frameRate || frameRate === "0/0") {
    return null;
  }

  const [numeratorRaw, denominatorRaw] = frameRate.split("/", 2);
  const numerator = Number.parseFloat(numeratorRaw ?? "");
  const denominator = Number.parseFloat(denominatorRaw ?? "");

  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator === 0) {
    return null;
  }

  return numerator / denominator;
}

class MetadataExtractor {
  private availabilityPromise: Promise<boolean> | null = null;

  async extract(sourcePath: string): Promise<ExtractedVideoMetadata | null> {
    try {
      const { stdout } = await execFileAsync(
        "ffprobe",
        ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", sourcePath],
        { maxBuffer: 8 * 1024 * 1024 }
      );
      const payload = JSON.parse(stdout) as ProbePayload;
      const streams = payload.streams ?? [];
      const videoStream = streams.find((stream) => stream.codec_type === "video");
      const audioStream = streams.find((stream) => stream.codec_type === "audio");
      const durationSeconds =
        parseOptionalNumber(videoStream?.duration) ??
        parseOptionalNumber(payload.format?.duration) ??
        null;

      return {
        audioCodec: audioStream?.codec_name?.trim().toLowerCase() ?? null,
        durationSeconds,
        fps: parseFrameRate(videoStream?.avg_frame_rate) ?? parseFrameRate(videoStream?.r_frame_rate),
        videoCodec: videoStream?.codec_name?.trim().toLowerCase() ?? null,
        width: videoStream?.width ?? null,
        height: videoStream?.height ?? null
      };
    } catch {
      return null;
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.availabilityPromise) {
      this.availabilityPromise = execFileAsync("ffprobe", ["-version"])
        .then(() => true)
        .catch(() => false);
    }

    return this.availabilityPromise;
  }
}

export const metadataExtractor = new MetadataExtractor();

export type { ExtractedVideoMetadata };
