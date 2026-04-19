import { buildVideoId, videoIndexService } from "../library/videoIndex.js";
import type { ScannedVideo } from "../library/scanner.js";

import { metadataExtractor } from "./metadataExtractor.js";
import { resolvePlaybackStatus, type PlaybackStatus } from "./playbackPolicy.js";
import { thumbnailService } from "./thumbnailService.js";

type ProcessedVideo = ScannedVideo & {
  audioCodec: string | null;
  container: string | null;
  durationSeconds: number | null;
  fps: number | null;
  height: number | null;
  playbackPath: string | null;
  playbackStatus: PlaybackStatus;
  thumbnailPath: string | null;
  thumbnailSmPath: string | null;
  videoCodec: string | null;
  width: number | null;
};

const scanProcessingConcurrency = 4;

function normalizePlaybackStatus(playbackStatus: string | null | undefined, fallback: PlaybackStatus): PlaybackStatus {
  return playbackStatus === "direct" ||
    playbackStatus === "needs_transcode" ||
    playbackStatus === "processing" ||
    playbackStatus === "ready" ||
    playbackStatus === "failed"
    ? playbackStatus
    : fallback;
}

function buildFallbackPlaybackStatus(scannedVideo: ScannedVideo): PlaybackStatus {
  return scannedVideo.mimeType === "video/mp4" ? "direct" : "needs_transcode";
}

class MediaProcessor {
  async processScannedVideo(scannedVideo: ScannedVideo): Promise<ProcessedVideo> {
    const existingVideo = videoIndexService.findVideoBySourcePath(scannedVideo.sourcePath);
    const isUnchangedSource =
      existingVideo?.sourceMtimeMs === scannedVideo.sourceMtimeMs && existingVideo?.sourceSize === scannedVideo.sourceSize;
    const hasReusableProcessingArtifacts = Boolean(
      existingVideo &&
        (existingVideo.videoCodec !== null ||
          existingVideo.audioCodec !== null ||
          existingVideo.durationSeconds !== null ||
          existingVideo.thumbnailPath !== null ||
          existingVideo.thumbnailSmPath !== null)
    );

    if (isUnchangedSource && hasReusableProcessingArtifacts) {
      return {
        ...scannedVideo,
        audioCodec: existingVideo.audioCodec,
        container: existingVideo.container,
        durationSeconds: existingVideo.durationSeconds,
        fps: existingVideo.fps,
        height: existingVideo.height,
        playbackPath: existingVideo.playbackPath,
        playbackStatus: normalizePlaybackStatus(existingVideo.playbackStatus, buildFallbackPlaybackStatus(scannedVideo)),
        thumbnailPath: existingVideo.thumbnailPath,
        thumbnailSmPath: existingVideo.thumbnailSmPath,
        videoCodec: existingVideo.videoCodec,
        width: existingVideo.width
      };
    }

    const metadata = await metadataExtractor.extract(scannedVideo.sourcePath);
    const videoId = buildVideoId(scannedVideo.sourcePath);
    const playbackStatus = metadata
      ? resolvePlaybackStatus({
          audioCodec: metadata.audioCodec,
          extension: scannedVideo.extension,
          mimeType: scannedVideo.mimeType,
          videoCodec: metadata.videoCodec
        })
      : buildFallbackPlaybackStatus(scannedVideo);
    const thumbnails = await thumbnailService.generateThumbnails(videoId, scannedVideo.sourcePath, metadata?.durationSeconds ?? null);

    return {
      ...scannedVideo,
      audioCodec: metadata?.audioCodec ?? existingVideo?.audioCodec ?? null,
      container: scannedVideo.extension.replace(/^\./, "") || null,
      durationSeconds: metadata?.durationSeconds ?? existingVideo?.durationSeconds ?? null,
      fps: metadata?.fps ?? existingVideo?.fps ?? null,
      height: metadata?.height ?? existingVideo?.height ?? null,
      playbackPath: playbackStatus === "ready" ? existingVideo?.playbackPath ?? null : null,
      playbackStatus,
      thumbnailPath: thumbnails.thumbnailPath,
      thumbnailSmPath: thumbnails.thumbnailSmPath,
      videoCodec: metadata?.videoCodec ?? existingVideo?.videoCodec ?? null,
      width: metadata?.width ?? existingVideo?.width ?? null
    };
  }

  async processScannedVideos(scannedVideos: ScannedVideo[]): Promise<ProcessedVideo[]> {
    const processedVideos: ProcessedVideo[] = new Array(scannedVideos.length);
    let nextIndex = 0;
    const workerCount = Math.min(scanProcessingConcurrency, Math.max(scannedVideos.length, 1));

    await Promise.all(
      Array.from({ length: workerCount }, async () => {
        while (true) {
          const currentIndex = nextIndex;
          nextIndex += 1;

          if (currentIndex >= scannedVideos.length) {
            return;
          }

          processedVideos[currentIndex] = await this.processScannedVideo(scannedVideos[currentIndex]!);
        }
      })
    );

    return processedVideos;
  }
}

export const mediaProcessor = new MediaProcessor();

export type { ProcessedVideo };
