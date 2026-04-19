import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path, { dirname } from "node:path";
import { mkdir, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const uploadsRootDirectory = path.resolve(__dirname, "../../../uploads");
const uploadVideosDirectory = path.join(uploadsRootDirectory, "videos");
const uploadTempDirectory = path.join(uploadsRootDirectory, "tmp");

const unsafeCharactersPattern = /[^a-zA-Z0-9._-]+/g;

function sanitizeFileName(fileName: string): string {
  const extension = path.extname(fileName);
  const basename = path.basename(fileName, extension);
  const sanitizedBase = basename.replaceAll(unsafeCharactersPattern, "-").replaceAll(/-+/g, "-").replace(/^-|-$/g, "");

  return `${sanitizedBase || "upload"}${extension.toLowerCase()}`;
}

class UploadStoreService {
  constructor() {
    this.ensureDirectories();
  }

  ensureDirectories(): void {
    mkdirSync(uploadVideosDirectory, { recursive: true });
    mkdirSync(uploadTempDirectory, { recursive: true });
  }

  getVideosDirectory(): string {
    return uploadVideosDirectory;
  }

  getTempDirectory(): string {
    return uploadTempDirectory;
  }

  async finalizeUpload(tempPath: string, originalName: string): Promise<string> {
    this.ensureDirectories();

    const batchDirectory = path.join(uploadVideosDirectory, randomUUID());
    const finalPath = path.join(batchDirectory, sanitizeFileName(originalName));

    await mkdir(batchDirectory, { recursive: true });

    await rename(tempPath, finalPath);

    return finalPath;
  }
}

export const uploadStoreService = new UploadStoreService();
