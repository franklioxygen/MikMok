import type { NextFunction, Request, Response } from "express";
import multer from "multer";
import { ZodError } from "zod";

import { AppError, sendError } from "../utils/http.js";

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction
): void {
  if (error instanceof AppError) {
    sendError(response, error.statusCode, error.code, error.message);
    return;
  }

  if (error instanceof ZodError) {
    const issue = error.issues[0];
    sendError(response, 400, "VALIDATION_ERROR", issue?.message ?? "Invalid request.");
    return;
  }

  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      sendError(response, 400, "FILE_TOO_LARGE", "Uploaded file exceeds the allowed size limit.");
      return;
    }

    sendError(response, 400, "UPLOAD_WRITE_FAILED", "Failed to process uploaded files.");
    return;
  }

  console.error(error);
  sendError(response, 500, "INTERNAL_SERVER_ERROR", "Unexpected server error.");
}
