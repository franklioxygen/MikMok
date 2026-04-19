import { Router } from "express";

import { env } from "../config/env.js";
import { dbConfig } from "../db/index.js";
import { sendSuccess } from "../utils/http.js";

export const healthRouter = Router();

healthRouter.get("/", (_request, response) => {
  sendSuccess(response, {
    service: "mikmok-api",
    status: "ok",
    environment: env.NODE_ENV,
    timestamp: Math.floor(Date.now() / 1000),
    transcodeEnabled: env.transcodeEnabled,
    dbFile: dbConfig.filename
  });
});
