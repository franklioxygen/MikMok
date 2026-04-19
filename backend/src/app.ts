import { existsSync } from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";

import { env } from "./config/env.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.js";
import { foldersRouter } from "./routes/folders.js";
import { healthRouter } from "./routes/health.js";
import { jobsRouter } from "./routes/jobs.js";
import { streamRouter } from "./routes/stream.js";
import { uploadsRouter } from "./routes/uploads.js";
import { videosRouter } from "./routes/videos.js";
import { sendError, sendSuccess } from "./utils/http.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const frontendDistPath = path.resolve(__dirname, "../../frontend/dist");
const frontendIndexPath = path.join(frontendDistPath, "index.html");

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((value) => value.trim()).filter(Boolean),
      credentials: true
    })
  );
  app.use(express.json({ limit: `${env.MAX_UPLOAD_SIZE_MB}mb` }));
  app.use(cookieParser());

  app.get("/api", (_request, response) => {
    sendSuccess(response, {
      name: "MikMok API",
      version: "0.1.0"
    });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/folders", foldersRouter);
  app.use("/api/health", healthRouter);
  app.use("/api/jobs", jobsRouter);
  app.use("/api/uploads", uploadsRouter);
  app.use("/api/videos", videosRouter);
  app.use("/stream", streamRouter);

  if (existsSync(frontendIndexPath)) {
    app.use(express.static(frontendDistPath, { index: false }));
    app.get(/^(?!\/api(?:\/|$)|\/stream(?:\/|$)).*/, (_request, response) => {
      response.sendFile(frontendIndexPath);
    });
  }

  app.use((_request, response) => {
    sendError(response, 404, "NOT_FOUND", "Route not found.");
  });

  app.use(errorHandler);

  return app;
}
