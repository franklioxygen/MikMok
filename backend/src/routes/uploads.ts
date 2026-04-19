import { unlink } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import multer from "multer";
import { Router } from "express";

import { env } from "../config/env.js";
import { mediaLibraryService } from "../services/library/mediaLibrary.js";
import { mountedFolderService } from "../services/library/mountedFolders.js";
import { uploadStoreService } from "../services/storage/uploadStore.js";
import { AppError, sendSuccess } from "../utils/http.js";

const allowedExtensions = new Set([".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".3gp", ".flv", ".wmv", ".ts"]);

const uploadMiddleware = multer({
  storage: multer.diskStorage({
    destination: (_request, _file, callback) => {
      callback(null, uploadStoreService.getTempDirectory());
    },
    filename: (_request, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${randomUUID()}${extension}`);
    }
  }),
  limits: {
    fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024
  },
  fileFilter: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();

    if (!allowedExtensions.has(extension)) {
      callback(new AppError(400, "FILE_TYPE_NOT_ALLOWED", "File type not allowed."));
      return;
    }

    callback(null, true);
  }
});

export const uploadsRouter = Router();

uploadsRouter.post(
  "/",
  uploadMiddleware.fields([
    { name: "files[]", maxCount: 32 },
    { name: "files", maxCount: 32 }
  ]),
  async (request, response) => {
    const filesPayload = request.files;
    const files = Array.isArray(filesPayload)
      ? filesPayload
      : [...(filesPayload?.["files[]"] ?? []), ...(filesPayload?.files ?? [])];

    if (files.length === 0) {
      throw new AppError(400, "NO_FILES_UPLOADED", "No files were uploaded.");
    }

    const uploadsFolder = await mountedFolderService.getUploadsFolder();
    const rejected: string[] = [];
    const finalizedPaths: string[] = [];

    for (const file of files) {
      try {
        finalizedPaths.push(await uploadStoreService.finalizeUpload(file.path, file.originalname));
      } catch {
        rejected.push(file.originalname);
        await unlink(file.path).catch(() => undefined);
      }
    }

    if (finalizedPaths.length === 0) {
      throw new AppError(500, "UPLOAD_WRITE_FAILED", "Failed to persist uploaded files.");
    }

    await mountedFolderService.scanFolder(uploadsFolder.id);

    const indexedVideos = await mediaLibraryService.listVideosByFolderId(uploadsFolder.id);
    const uploadedVideos = indexedVideos
      .filter((video) => finalizedPaths.includes(video.sourcePath))
      .map((video) => ({
        id: video.id,
        title: video.title,
        sourceName: video.sourceName,
        streamUrl: `/stream/${video.id}`
      }));

    sendSuccess(
      response,
      {
        uploadBatchId: `upl_${randomUUID()}`,
        accepted: finalizedPaths.length,
        rejected,
        folderId: uploadsFolder.id,
        folderName: uploadsFolder.name,
        videos: uploadedVideos
      },
      undefined,
      201
    );
  }
);
