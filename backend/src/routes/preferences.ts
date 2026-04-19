import { Router } from "express";
import { z } from "zod";

import { preferencesService } from "../services/preferences/preferencesService.js";
import { sendSuccess } from "../utils/http.js";

export const preferencesRouter = Router();

const preferencesPatchSchema = z.object({
  favoriteVideoIds: z.array(z.string()).optional(),
  lastActiveVideoId: z.string().nullable().optional(),
  playbackCompletionMode: z.enum(["stop", "next", "repeat"]).optional(),
  playbackRate: z.number().min(0.25).max(4).optional(),
  soundOnOpen: z.boolean().optional()
});

preferencesRouter.get("/", (_request, response) => {
  sendSuccess(response, preferencesService.getPreferences());
});

preferencesRouter.patch("/", (request, response) => {
  const patch = preferencesPatchSchema.parse(request.body);
  sendSuccess(response, preferencesService.updatePreferences(patch));
});
