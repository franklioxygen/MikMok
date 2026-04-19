import type { Response } from "express";

type Meta = Record<string, unknown>;

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function sendSuccess<T>(
  response: Response,
  data: T,
  meta?: Meta,
  statusCode = 200
): Response {
  const payload: { data: T; meta?: Meta; success: true } = {
    success: true,
    data
  };

  if (meta) {
    payload.meta = meta;
  }

  return response.status(statusCode).json(payload);
}

export function sendError(
  response: Response,
  statusCode: number,
  code: string,
  message: string
): Response {
  return response.status(statusCode).json({
    success: false,
    error: message,
    code
  });
}
