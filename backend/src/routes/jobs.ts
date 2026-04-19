import { Router } from "express";
import { z } from "zod";

import { jobService } from "../services/jobs/jobService.js";
import { AppError, sendSuccess } from "../utils/http.js";

export const jobsRouter = Router();

const listJobsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional().default(20)
});

jobsRouter.get("/", (request, response) => {
  const { limit } = listJobsQuerySchema.parse(request.query);
  const jobs = jobService.listJobs(limit);

  sendSuccess(
    response,
    jobs.map((job) => ({
      id: job.id,
      type: job.type,
      status: job.status,
      attemptCount: job.attemptCount,
      relatedEntityType: job.relatedEntityType,
      relatedEntityId: job.relatedEntityId,
      progressCurrent: job.progressCurrent,
      progressTotal: job.progressTotal,
      progressMessage: job.progressMessage,
      lastError: job.lastError,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      updatedAt: job.updatedAt
    })),
    {
      total: jobs.length
    }
  );
});

jobsRouter.get("/:id", (request, response) => {
  const job = jobService.findJobById(request.params.id);

  if (!job) {
    throw new AppError(404, "JOB_NOT_FOUND", "Job not found.");
  }

  sendSuccess(response, {
    id: job.id,
    type: job.type,
    status: job.status,
    attemptCount: job.attemptCount,
    relatedEntityType: job.relatedEntityType,
    relatedEntityId: job.relatedEntityId,
    progressCurrent: job.progressCurrent,
    progressTotal: job.progressTotal,
    progressMessage: job.progressMessage,
    lastError: job.lastError,
    payload: job.payload,
    createdAt: job.createdAt,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    updatedAt: job.updatedAt
  });
});
