import { randomUUID } from "node:crypto";

import { db } from "../../db/index.js";

type JobType = "transcode";
type JobStatus = "queued" | "running" | "succeeded" | "failed";

type JobRow = {
  attempt_count: number;
  created_at: number;
  finished_at: number | null;
  id: string;
  last_error: string | null;
  payload_json: string;
  progress_current: number;
  progress_message: string | null;
  progress_total: number;
  related_entity_id: string | null;
  related_entity_type: string | null;
  started_at: number | null;
  status: JobStatus;
  type: JobType;
  updated_at: number;
};

type Job = {
  attemptCount: number;
  createdAt: number;
  finishedAt: number | null;
  id: string;
  lastError: string | null;
  payload: Record<string, unknown>;
  progressCurrent: number;
  progressMessage: string | null;
  progressTotal: number;
  relatedEntityId: string | null;
  relatedEntityType: string | null;
  startedAt: number | null;
  status: JobStatus;
  type: JobType;
  updatedAt: number;
};

type JobStatusCountRow = {
  count: number;
  status: JobStatus;
};

type JobCounts = {
  failed: number;
  queued: number;
  running: number;
  succeeded: number;
  total: number;
};

type JobPayload = Record<string, unknown>;

function normalizePayload(payloadJson: string): JobPayload {
  try {
    const parsed = JSON.parse(payloadJson) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as JobPayload) : {};
  } catch {
    return {};
  }
}

function normalizeJob(row: JobRow): Job {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    relatedEntityType: row.related_entity_type,
    relatedEntityId: row.related_entity_id,
    payload: normalizePayload(row.payload_json),
    progressCurrent: row.progress_current,
    progressTotal: row.progress_total,
    progressMessage: row.progress_message,
    attemptCount: row.attempt_count,
    lastError: row.last_error,
    createdAt: row.created_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    updatedAt: row.updated_at
  };
}

class JobService {
  private readonly insertStatement = db.prepare(`
    INSERT INTO jobs (
      id,
      type,
      status,
      related_entity_type,
      related_entity_id,
      payload_json,
      progress_current,
      progress_total,
      progress_message,
      attempt_count,
      last_error,
      created_at,
      started_at,
      finished_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  listJobs(limit = 20): Job[] {
    const safeLimit = Math.max(1, Math.min(limit, 100));
    const rows = db
      .prepare("SELECT * FROM jobs ORDER BY created_at DESC, updated_at DESC LIMIT ?")
      .all(safeLimit) as JobRow[];

    return rows.map((row) => normalizeJob(row));
  }

  getJobCounts(): JobCounts {
    const rows = db
      .prepare("SELECT status, COUNT(*) AS count FROM jobs GROUP BY status")
      .all() as JobStatusCountRow[];
    const counts: JobCounts = {
      queued: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      total: 0
    };

    for (const row of rows) {
      counts[row.status] = row.count;
      counts.total += row.count;
    }

    return counts;
  }

  findJobById(jobId: string): Job | null {
    const row = db.prepare("SELECT * FROM jobs WHERE id = ? LIMIT 1").get(jobId) as JobRow | undefined;
    return row ? normalizeJob(row) : null;
  }

  findActiveJob(type: JobType, relatedEntityType: string, relatedEntityId: string): Job | null {
    const row = db
      .prepare(
        "SELECT * FROM jobs WHERE type = ? AND related_entity_type = ? AND related_entity_id = ? AND status IN ('queued', 'running') ORDER BY created_at DESC LIMIT 1"
      )
      .get(type, relatedEntityType, relatedEntityId) as JobRow | undefined;

    return row ? normalizeJob(row) : null;
  }

  enqueueTranscodeJob(videoId: string): Job {
    const existingJob = this.findActiveJob("transcode", "video", videoId);

    if (existingJob) {
      return existingJob;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const jobId = randomUUID();
    const payloadJson = JSON.stringify({ videoId });

    this.insertStatement.run(
      jobId,
      "transcode",
      "queued",
      "video",
      videoId,
      payloadJson,
      0,
      0,
      "Queued for transcode.",
      0,
      null,
      timestamp,
      null,
      null,
      timestamp
    );

    const job = this.findJobById(jobId);

    if (!job) {
      throw new Error("Failed to create transcode job.");
    }

    return job;
  }

  claimNextQueuedJob(): Job | null {
    const queuedRow = db
      .prepare("SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at ASC, updated_at ASC LIMIT 1")
      .get() as JobRow | undefined;

    if (!queuedRow) {
      return null;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const updated = db
      .prepare(
        "UPDATE jobs SET status = 'running', attempt_count = attempt_count + 1, started_at = ?, finished_at = NULL, updated_at = ? WHERE id = ? AND status = 'queued'"
      )
      .run(timestamp, timestamp, queuedRow.id);

    if (updated.changes === 0) {
      return null;
    }

    return this.findJobById(queuedRow.id);
  }

  updateProgress(jobId: string, progressCurrent: number, progressTotal: number, progressMessage: string): void {
    db.prepare(
      "UPDATE jobs SET progress_current = ?, progress_total = ?, progress_message = ?, updated_at = ? WHERE id = ?"
    ).run(progressCurrent, progressTotal, progressMessage, Math.floor(Date.now() / 1000), jobId);
  }

  requeueJob(jobId: string, lastError: string): void {
    db.prepare(
      "UPDATE jobs SET status = 'queued', progress_current = 0, progress_total = 0, progress_message = ?, last_error = ?, finished_at = NULL, updated_at = ? WHERE id = ?"
    ).run("Queued for retry.", lastError, Math.floor(Date.now() / 1000), jobId);
  }

  markSucceeded(jobId: string, progressMessage: string): void {
    const timestamp = Math.floor(Date.now() / 1000);

    db.prepare(
      "UPDATE jobs SET status = 'succeeded', progress_current = CASE WHEN progress_total > 0 THEN progress_total ELSE progress_current END, progress_message = ?, last_error = NULL, finished_at = ?, updated_at = ? WHERE id = ?"
    ).run(progressMessage, timestamp, timestamp, jobId);
  }

  markFailed(jobId: string, lastError: string): void {
    const timestamp = Math.floor(Date.now() / 1000);

    db.prepare(
      "UPDATE jobs SET status = 'failed', progress_message = ?, last_error = ?, finished_at = ?, updated_at = ? WHERE id = ?"
    ).run("Job failed.", lastError, timestamp, timestamp, jobId);
  }
}

export const jobService = new JobService();

export type { Job, JobCounts, JobStatus, JobType };
