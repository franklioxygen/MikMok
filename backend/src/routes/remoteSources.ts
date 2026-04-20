import { Router } from "express";
import { z } from "zod";

import { requireAuthenticatedSession, requireCsrfToken } from "../middleware/authGuard.js";
import { myTubeAdapterService } from "../services/integrations/mytubeAdapter.js";
import {
  remoteSourcesService,
  type RemoteSourceAuthMode,
  type RemoteSourceInternal,
  type RemoteSourceScopeMode
} from "../services/integrations/remoteSources.js";
import { AppError, sendSuccess } from "../utils/http.js";

export const remoteSourcesRouter = Router();

const remoteSourceTypeSchema = z.literal("mytube");
const authModeSchema = z.enum(["none", "session_cookie", "integration_api_key"]);
const scopeModeSchema = z.enum(["all", "collections", "authors", "mixed"]);
const optionalCredentialSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? null : value),
  z.string().trim().min(1).nullable().optional()
);

const createRemoteSourceSchema = z
  .object({
    type: remoteSourceTypeSchema.default("mytube"),
    enabled: z.boolean().default(true),
    name: z.string().trim().min(1).max(120),
    baseUrl: z.string().url(),
    authMode: authModeSchema.default("none"),
    credential: optionalCredentialSchema,
    scopeMode: scopeModeSchema.default("all"),
    collectionIds: z.array(z.string().trim().min(1)).default([]),
    authorKeys: z.array(z.string().trim().min(1)).default([])
  })
  .superRefine((value, context) => {
    if (value.authMode !== "none" && !value.credential) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["credential"],
        message: "Credential is required when auth mode is enabled."
      });
    }
  });

const updateRemoteSourceSchema = z.object({
  enabled: z.boolean().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  baseUrl: z.string().url().optional(),
  authMode: authModeSchema.optional(),
  credential: optionalCredentialSchema,
  scopeMode: scopeModeSchema.optional(),
  collectionIds: z.array(z.string().trim().min(1)).optional(),
  authorKeys: z.array(z.string().trim().min(1)).optional()
});

function requireMyTubeSource(sourceId: string): RemoteSourceInternal {
  const source = remoteSourcesService.findInternalSourceById(sourceId);

  if (!source || source.type !== "mytube") {
    throw new AppError(404, "REMOTE_SOURCE_NOT_FOUND", "Remote source not found.");
  }

  return source;
}

function readSourceId(rawSourceId: string | string[] | undefined): string {
  if (typeof rawSourceId === "string") {
    return rawSourceId;
  }

  return "";
}

remoteSourcesRouter.use(requireAuthenticatedSession);

remoteSourcesRouter.get("/", (_request, response) => {
  sendSuccess(response, remoteSourcesService.listSources());
});

remoteSourcesRouter.post("/", requireCsrfToken, async (request, response) => {
  const payload = createRemoteSourceSchema.parse(request.body);
  const source = remoteSourcesService.createSource({
    type: payload.type,
    enabled: payload.enabled,
    name: payload.name,
    baseUrl: payload.baseUrl,
    authMode: payload.authMode as RemoteSourceAuthMode,
    credential: payload.credential ?? null,
    scopeMode: payload.scopeMode as RemoteSourceScopeMode,
    collectionIds: payload.collectionIds,
    authorKeys: payload.authorKeys
  });

  myTubeAdapterService.invalidateSource(source.id);
  sendSuccess(response, source, undefined, 201);
});

remoteSourcesRouter.patch("/:id", requireCsrfToken, async (request, response) => {
  const payload = updateRemoteSourceSchema.parse(request.body);
  const sourceId = readSourceId(request.params.id);
  const source = remoteSourcesService.updateSource(sourceId, {
    enabled: payload.enabled,
    name: payload.name,
    baseUrl: payload.baseUrl,
    authMode: payload.authMode as RemoteSourceAuthMode | undefined,
    credential: payload.credential,
    scopeMode: payload.scopeMode as RemoteSourceScopeMode | undefined,
    collectionIds: payload.collectionIds,
    authorKeys: payload.authorKeys
  });

  if (!source) {
    throw new AppError(404, "REMOTE_SOURCE_NOT_FOUND", "Remote source not found.");
  }

  myTubeAdapterService.invalidateSource(source.id);
  sendSuccess(response, source);
});

remoteSourcesRouter.delete("/:id", requireCsrfToken, (request, response) => {
  const sourceId = readSourceId(request.params.id);
  const removed = remoteSourcesService.deleteSource(sourceId);

  if (!removed) {
    throw new AppError(404, "REMOTE_SOURCE_NOT_FOUND", "Remote source not found.");
  }

  myTubeAdapterService.invalidateSource(sourceId);
  sendSuccess(response, {
    id: sourceId,
    removed: true
  });
});

remoteSourcesRouter.post("/:id/test", requireCsrfToken, async (request, response) => {
  const source = requireMyTubeSource(readSourceId(request.params.id));
  const result = await myTubeAdapterService.testSource(source);
  const updatedSource = remoteSourcesService.markValidated(source.id);
  myTubeAdapterService.invalidateSource(source.id);

  sendSuccess(response, {
    ...result,
    lastValidatedAt: updatedSource?.lastValidatedAt ?? null
  });
});

remoteSourcesRouter.post("/:id/discover", requireCsrfToken, async (request, response) => {
  const source = requireMyTubeSource(readSourceId(request.params.id));
  const result = await myTubeAdapterService.discoverSource(source);

  sendSuccess(response, result);
});
