import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { access, realpath, stat } from "node:fs/promises";
import path from "node:path";

import { env } from "../../config/env.js";
import { db } from "../../db/index.js";
import { jobWorkerService } from "../jobs/jobWorker.js";
import { mediaProcessor } from "../media/mediaProcessor.js";
import { uploadStoreService } from "../storage/uploadStore.js";
import { AppError } from "../../utils/http.js";
import { collectVideosFromDirectory } from "./scanner.js";
import { buildVideoId, videoIndexService } from "./videoIndex.js";

const uploadsFolderName = "Uploads";

type MountedFolderRow = {
  auto_scan: number;
  created_at: number;
  id: string;
  is_active: number;
  last_scanned_at: number | null;
  max_depth: number | null;
  mount_path: string;
  name: string;
  scan_interval_minutes: number | null;
  scan_status: string;
  updated_at: number;
};

type MountedFolder = {
  autoScan: boolean;
  createdAt: number;
  id: string;
  isActive: boolean;
  lastScannedAt: number | null;
  maxDepth: number | null;
  mountPath: string;
  name: string;
  scanIntervalMinutes: number | null;
  scanStatus: string;
  updatedAt: number;
};

type CreateMountedFolderInput = {
  autoScan?: boolean;
  maxDepth?: number | null;
  mountPath: string;
  name?: string | null;
  scanIntervalMinutes?: number | null;
};

type MountedFolderScanResult = {
  folder: MountedFolder;
  videoCount: number;
};

function buildFolderId(folderPath: string): string {
  return createHash("sha1").update(`folder:${folderPath}`).digest("hex");
}

function isSameOrNestedPath(targetPath: string, candidateRoot: string): boolean {
  return targetPath === candidateRoot || targetPath.startsWith(`${candidateRoot}${path.sep}`);
}

function pathsOverlap(leftPath: string, rightPath: string): boolean {
  return isSameOrNestedPath(leftPath, rightPath) || isSameOrNestedPath(rightPath, leftPath);
}

function normalizeFolder(row: MountedFolderRow): MountedFolder {
  return {
    id: row.id,
    name: row.name,
    mountPath: row.mount_path,
    isActive: row.is_active === 1,
    autoScan: row.auto_scan === 1,
    scanIntervalMinutes: row.scan_interval_minutes,
    maxDepth: row.max_depth,
    scanStatus: row.scan_status,
    lastScannedAt: row.last_scanned_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function resolveExistingDirectory(candidatePath: string): Promise<string> {
  let resolvedPath: string;

  try {
    resolvedPath = await realpath(candidatePath);
  } catch {
    throw new AppError(404, "PATH_NOT_FOUND", "Mount path does not exist.");
  }

  const fileStat = await stat(resolvedPath).catch(() => null);

  if (!fileStat) {
    throw new AppError(404, "PATH_NOT_FOUND", "Mount path does not exist.");
  }

  if (!fileStat.isDirectory()) {
    throw new AppError(400, "PATH_NOT_DIRECTORY", "Mount path must be a directory.");
  }

  try {
    await access(resolvedPath, constants.R_OK);
  } catch {
    throw new AppError(400, "PATH_NOT_READABLE", "Mount path is not readable.");
  }

  return resolvedPath;
}

async function resolveAllowedRootPaths(): Promise<string[]> {
  const roots = await Promise.all(
    env.allowedMountRoots.map(async (rootPath) => {
      try {
        return await resolveExistingDirectory(rootPath);
      } catch {
        return null;
      }
    })
  );

  return roots.filter((rootPath): rootPath is string => Boolean(rootPath));
}

class MountedFolderService {
  private readonly activeScans = new Map<string, Promise<void>>();
  private indexSeedPromise: Promise<void> | null = null;
  private seedPromise: Promise<void> | null = null;

  async ensureSeededFromAllowedRoots(): Promise<void> {
    const folderSeedState = this.readAppState("mounted_folders_seeded");
    const existingCount = db.prepare("SELECT COUNT(*) as count FROM mounted_folders").get() as { count: number };

    if (folderSeedState !== "1" && existingCount.count === 0) {
      if (this.seedPromise) {
        await this.seedPromise;
      } else {
        this.seedPromise = (async () => {
          const allowedRoots = await resolveAllowedRootPaths();

          for (const rootPath of allowedRoots) {
            const folder = await this.insertMountedFolder({
              mountPath: rootPath,
              name: path.basename(rootPath) || rootPath
            });

            await this.scanFolderRecord(folder);
          }

          this.writeAppState("mounted_folders_seeded", "1");
        })();

        try {
          await this.seedPromise;
        } finally {
          this.seedPromise = null;
        }
      }
    } else if (!folderSeedState) {
      this.writeAppState("mounted_folders_seeded", "1");
    }

    await this.ensureUploadsFolderSeeded();
    await this.ensureVideoIndexSeeded();
  }

  async listFolders(): Promise<MountedFolder[]> {
    await this.ensureSeededFromAllowedRoots();

    const rows = db
      .prepare("SELECT * FROM mounted_folders ORDER BY is_active DESC, updated_at DESC, name ASC")
      .all() as MountedFolderRow[];

    return rows.map((row) => normalizeFolder(row));
  }

  async listActiveFolders(): Promise<MountedFolder[]> {
    const folders = await this.listFolders();
    return folders.filter((folder) => folder.isActive);
  }

  async findFolderById(folderId: string): Promise<MountedFolder | null> {
    await this.ensureSeededFromAllowedRoots();

    const row = db.prepare("SELECT * FROM mounted_folders WHERE id = ?").get(folderId) as MountedFolderRow | undefined;

    return row ? normalizeFolder(row) : null;
  }

  async createFolder(input: CreateMountedFolderInput): Promise<MountedFolderScanResult> {
    await this.ensureSeededFromAllowedRoots();

    const mountPath = await resolveExistingDirectory(input.mountPath);
    const allowedRoots = await resolveAllowedRootPaths();

    if (!allowedRoots.some((rootPath) => isSameOrNestedPath(mountPath, rootPath))) {
      throw new AppError(400, "PATH_OUTSIDE_ALLOWED_ROOTS", "Mount path must be inside an allowed root.");
    }

    const existingFolders = await this.listFolders();

    if (existingFolders.some((folder) => pathsOverlap(mountPath, folder.mountPath))) {
      throw new AppError(409, "PATH_OVERLAPS_EXISTING_MOUNT", "Mount path overlaps an existing folder mount.");
    }

    const folder = await this.insertMountedFolder({
      autoScan: input.autoScan,
      maxDepth: input.maxDepth,
      mountPath,
      name: input.name?.trim() ? input.name.trim() : path.basename(mountPath),
      scanIntervalMinutes: input.scanIntervalMinutes
    });

    const queuedFolder = await this.queueFolderScan(folder);

    return {
      folder: queuedFolder,
      videoCount: videoIndexService.getVideoCountByFolderId(queuedFolder.id)
    };
  }

  async deleteFolder(folderId: string): Promise<MountedFolder | null> {
    if (this.isProtectedFolderId(folderId)) {
      throw new AppError(400, "FOLDER_PROTECTED", "This folder source is managed by the system.");
    }

    if (this.activeScans.has(folderId)) {
      throw new AppError(409, "FOLDER_SCAN_IN_PROGRESS", "Folder scan is still running.");
    }

    const folder = await this.findFolderById(folderId);

    if (!folder) {
      return null;
    }

    db.prepare("DELETE FROM mounted_folders WHERE id = ?").run(folderId);

    return folder;
  }

  async scanFolder(folderId: string): Promise<MountedFolderScanResult | null> {
    const folder = await this.findFolderById(folderId);

    if (!folder) {
      return null;
    }

    const queuedFolder = await this.queueFolderScan(folder);

    return {
      folder: queuedFolder,
      videoCount: videoIndexService.getVideoCountByFolderId(queuedFolder.id)
    };
  }

  async getUploadsFolder(): Promise<MountedFolder> {
    await this.ensureSeededFromAllowedRoots();

    const row = db
      .prepare("SELECT * FROM mounted_folders WHERE id = ?")
      .get(this.getUploadsFolderId()) as MountedFolderRow | undefined;

    if (!row) {
      throw new AppError(500, "UPLOAD_FOLDER_MISSING", "Uploads folder is not registered.");
    }

    return normalizeFolder(row);
  }

  isProtectedFolderId(folderId: string): boolean {
    return folderId === this.getUploadsFolderId();
  }

  private async ensureVideoIndexSeeded(): Promise<void> {
    const videoSeedState = this.readAppState("videos_index_seeded");

    if (videoSeedState === "1") {
      return;
    }

    if (this.indexSeedPromise) {
      return this.indexSeedPromise;
    }

    this.indexSeedPromise = (async () => {
      const rows = db
        .prepare("SELECT * FROM mounted_folders WHERE is_active = 1 ORDER BY updated_at ASC, name ASC")
        .all() as MountedFolderRow[];

      for (const row of rows) {
        try {
          await this.scanFolderRecord(normalizeFolder(row));
        } catch {
          continue;
        }
      }

      this.writeAppState("videos_index_seeded", "1");
    })();

    try {
      await this.indexSeedPromise;
    } finally {
      this.indexSeedPromise = null;
    }
  }

  private async ensureUploadsFolderSeeded(): Promise<void> {
    const uploadsFolderId = this.getUploadsFolderId();
    const existingRow = db.prepare("SELECT * FROM mounted_folders WHERE id = ?").get(uploadsFolderId) as
      | MountedFolderRow
      | undefined;

    if (existingRow) {
      return;
    }

    const folder = await this.insertMountedFolder({
      mountPath: uploadStoreService.getVideosDirectory(),
      name: uploadsFolderName
    });

    await this.scanFolderRecord(folder);
  }

  private async insertMountedFolder(input: CreateMountedFolderInput): Promise<MountedFolder> {
    const timestamp = Math.floor(Date.now() / 1000);
    const mountPath = await resolveExistingDirectory(input.mountPath);
    const folderId = buildFolderId(mountPath);

    db.prepare(
      `INSERT OR IGNORE INTO mounted_folders (
        id,
        name,
        mount_path,
        is_active,
        auto_scan,
        scan_interval_minutes,
        max_depth,
        scan_status,
        last_scanned_at,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      folderId,
      input.name?.trim() ? input.name.trim() : path.basename(mountPath),
      mountPath,
      1,
      input.autoScan ? 1 : 0,
      input.scanIntervalMinutes ?? null,
      input.maxDepth ?? null,
      "pending",
      null,
      timestamp,
      timestamp
    );

    const row = db.prepare("SELECT * FROM mounted_folders WHERE id = ?").get(folderId) as MountedFolderRow | undefined;

    if (!row) {
      throw new AppError(500, "FOLDER_CREATE_FAILED", "Failed to create mounted folder.");
    }

    return normalizeFolder(row);
  }

  private readAppState(key: string): string | null {
    const row = db.prepare("SELECT value FROM app_state WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  private getUploadsFolderId(): string {
    return buildFolderId(uploadStoreService.getVideosDirectory());
  }

  private async scanFolderRecord(folder: MountedFolder): Promise<MountedFolderScanResult> {
    const timestamp = Math.floor(Date.now() / 1000);

    try {
      const mountPath = await resolveExistingDirectory(folder.mountPath);
      const scannedVideos = await collectVideosFromDirectory(mountPath, {
        maxDepth: folder.maxDepth
      });
      const processedVideos = await mediaProcessor.processScannedVideos(scannedVideos);
      const videoCount = videoIndexService.replaceFolderVideos(folder.id, processedVideos);
      const transcodeVideoIds = processedVideos
        .filter((video) => video.playbackStatus === "needs_transcode" || video.playbackStatus === "failed")
        .map((video) => buildVideoId(video.sourcePath));
      const scanStatus = videoCount > 0 ? "ready" : "empty";

      if (transcodeVideoIds.length > 0) {
        await jobWorkerService.enqueueTranscodes(transcodeVideoIds).catch((error: unknown) => {
          console.error("Failed to enqueue transcode jobs.", error);
        });
      }

      db.prepare("UPDATE mounted_folders SET mount_path = ?, scan_status = ?, last_scanned_at = ?, updated_at = ? WHERE id = ?")
        .run(mountPath, scanStatus, timestamp, timestamp, folder.id);

      return {
        folder: {
          ...folder,
          mountPath,
          scanStatus,
          lastScannedAt: timestamp,
          updatedAt: timestamp
        },
        videoCount
      };
    } catch (error) {
      videoIndexService.clearFolderVideos(folder.id);
      db.prepare("UPDATE mounted_folders SET scan_status = ?, last_scanned_at = ?, updated_at = ? WHERE id = ?")
        .run("error", timestamp, timestamp, folder.id);

      throw error;
    }
  }

  private async queueFolderScan(folder: MountedFolder): Promise<MountedFolder> {
    const existingScan = this.activeScans.get(folder.id);

    if (existingScan) {
      const currentFolder = await this.findFolderById(folder.id);
      return currentFolder ?? folder;
    }

    const timestamp = Math.floor(Date.now() / 1000);

    db.prepare("UPDATE mounted_folders SET scan_status = ?, updated_at = ? WHERE id = ?")
      .run("scanning", timestamp, folder.id);

    const queuedFolder: MountedFolder = {
      ...folder,
      scanStatus: "scanning",
      updatedAt: timestamp
    };

    const scanPromise = this.scanFolderRecord(queuedFolder)
      .then(() => undefined)
      .catch((error: unknown) => {
        console.error(`Failed to scan mounted folder ${folder.id}.`, error);
      })
      .finally(() => {
        this.activeScans.delete(folder.id);
      });

    this.activeScans.set(folder.id, scanPromise);

    return queuedFolder;
  }

  private writeAppState(key: string, value: string): void {
    db.prepare("INSERT INTO app_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(key, value);
  }
}

export const mountedFolderService = new MountedFolderService();

export { buildFolderId };
export type { CreateMountedFolderInput, MountedFolder, MountedFolderScanResult };
