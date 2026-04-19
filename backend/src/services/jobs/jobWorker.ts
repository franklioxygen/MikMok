import { env } from "../../config/env.js";
import { thumbnailService } from "../media/thumbnailService.js";
import { TranscodeError, transcodeService } from "../media/transcodeService.js";
import type { PlaybackStatus } from "../media/playbackPolicy.js";
import { videoIndexService } from "../library/videoIndex.js";

import { jobService, type Job } from "./jobService.js";

const transcodeRetryLimit = 3;

class JobWorkerService {
  private intervalHandle: NodeJS.Timeout | null = null;
  private pumping = false;

  start(): void {
    if (this.intervalHandle) {
      return;
    }

    this.intervalHandle = setInterval(() => {
      void this.pump();
    }, 2000);

    void this.pump();
  }

  stop(): void {
    if (!this.intervalHandle) {
      return;
    }

    clearInterval(this.intervalHandle);
    this.intervalHandle = null;
  }

  async enqueueTranscodes(videoIds: string[]): Promise<void> {
    if (!env.transcodeEnabled) {
      return;
    }

    const uniqueVideoIds = [...new Set(videoIds)];
    let hasQueuedWork = false;

    for (const videoId of uniqueVideoIds) {
      const video = videoIndexService.findVideoById(videoId);

      if (!video || (video.playbackStatus !== "needs_transcode" && video.playbackStatus !== "failed")) {
        continue;
      }

      jobService.enqueueTranscodeJob(videoId);
      videoIndexService.updatePlaybackStatus(videoId, "processing");
      hasQueuedWork = true;
    }

    if (hasQueuedWork) {
      this.start();
      void this.pump();
    }
  }

  private async pump(): Promise<void> {
    if (this.pumping) {
      return;
    }

    this.pumping = true;

    try {
      while (true) {
        const job = jobService.claimNextQueuedJob();

        if (!job) {
          return;
        }

        await this.processJob(job);
      }
    } finally {
      this.pumping = false;
    }
  }

  private async processJob(job: Job): Promise<void> {
    if (job.type === "transcode") {
      await this.processTranscodeJob(job);
      return;
    }

    jobService.markFailed(job.id, `Unsupported job type: ${job.type}`);
  }

  private async processTranscodeJob(job: Job): Promise<void> {
    const videoId = job.relatedEntityId;

    if (!videoId) {
      jobService.markFailed(job.id, "Transcode job is missing a related video id.");
      return;
    }

    const video = videoIndexService.findVideoById(videoId);

    if (!video) {
      jobService.markFailed(job.id, "Video no longer exists.");
      return;
    }

    if (!env.transcodeEnabled) {
      videoIndexService.updatePlaybackStatus(video.id, "needs_transcode");
      jobService.markFailed(job.id, "Transcoding is disabled.");
      return;
    }

    const ffmpegAvailable = await thumbnailService.isAvailable();

    if (!ffmpegAvailable) {
      videoIndexService.updatePlaybackStatus(video.id, "needs_transcode");
      jobService.markFailed(job.id, "ffmpeg is not available.");
      return;
    }

    if (video.playbackStatus === "direct") {
      videoIndexService.updatePlaybackArtifacts(video.id, {
        playbackPath: null,
        playbackStatus: "direct"
      });
      jobService.markSucceeded(job.id, "Direct playback is available.");
      return;
    }

    if (video.playbackStatus === "ready" && video.playbackPath) {
      jobService.markSucceeded(job.id, "Transcoded playback is already ready.");
      return;
    }

    videoIndexService.updatePlaybackStatus(video.id, "processing");
    jobService.updateProgress(job.id, 0, 3, "Preparing transcode.");

    try {
      jobService.updateProgress(job.id, 1, 3, "Running ffmpeg.");
      const playbackPath = await transcodeService.transcodeVideo(video.id, video.sourcePath);

      jobService.updateProgress(job.id, 2, 3, "Publishing playback artifact.");
      videoIndexService.updatePlaybackArtifacts(video.id, {
        playbackPath,
        playbackStatus: "ready"
      });

      jobService.updateProgress(job.id, 3, 3, "Playback ready.");
      jobService.markSucceeded(job.id, "Playback ready.");
    } catch (error) {
      const normalizedError = error instanceof TranscodeError ? error : new TranscodeError("Transcode failed.", true);
      const canRetry = normalizedError.retryable && job.attemptCount < transcodeRetryLimit;
      const fallbackPlaybackStatus: PlaybackStatus = canRetry ? "needs_transcode" : "failed";

      videoIndexService.updatePlaybackArtifacts(video.id, {
        playbackPath: null,
        playbackStatus: fallbackPlaybackStatus
      });

      if (canRetry) {
        jobService.requeueJob(job.id, normalizedError.message);
        return;
      }

      jobService.markFailed(job.id, normalizedError.message);
    }
  }
}

export const jobWorkerService = new JobWorkerService();
