import { readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";

const videoExtensions = new Set([".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v", ".3gp", ".flv", ".wmv", ".ts"]);

const mimeTypeByExtension: Record<string, string> = {
  ".3gp": "video/3gpp",
  ".avi": "video/x-msvideo",
  ".flv": "video/x-flv",
  ".m4v": "video/mp4",
  ".mkv": "video/x-matroska",
  ".mov": "video/quicktime",
  ".mp4": "video/mp4",
  ".ts": "video/mp2t",
  ".webm": "video/webm",
  ".wmv": "video/x-ms-wmv"
};

type ScanOptions = {
  maxDepth?: number | null;
};

type ScannedVideo = {
  extension: string;
  mimeType: string;
  sourceMtimeMs: number;
  sourceName: string;
  sourcePath: string;
  sourceSize: number;
  title: string;
};

function isVideoFile(filePath: string): boolean {
  return videoExtensions.has(path.extname(filePath).toLowerCase());
}

function humanizeTitle(fileName: string): string {
  return path
    .basename(fileName, path.extname(fileName))
    .replaceAll(/[_-]+/g, " ")
    .replaceAll(/\s+/g, " ")
    .trim();
}

export async function collectVideosFromDirectory(
  directoryPath: string,
  options: ScanOptions = {},
  currentDepth = 0
): Promise<ScannedVideo[]> {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const videos: ScannedVideo[] = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      if (options.maxDepth === null || options.maxDepth === undefined || currentDepth < options.maxDepth) {
        videos.push(...(await collectVideosFromDirectory(entryPath, options, currentDepth + 1)));
      }

      continue;
    }

    if (!entry.isFile() || !isVideoFile(entryPath)) {
      continue;
    }

    const resolvedPath = await realpath(entryPath);
    const fileStat = await stat(resolvedPath);
    const extension = path.extname(resolvedPath).toLowerCase();

    videos.push({
      extension,
      mimeType: mimeTypeByExtension[extension] ?? "application/octet-stream",
      sourceMtimeMs: fileStat.mtimeMs,
      sourceName: entry.name,
      sourcePath: resolvedPath,
      sourceSize: fileStat.size,
      title: humanizeTitle(entry.name)
    });
  }

  return videos;
}

export async function countVideosInDirectory(directoryPath: string, options: ScanOptions = {}): Promise<number> {
  const videos = await collectVideosFromDirectory(directoryPath, options);
  return videos.length;
}

export type { ScanOptions, ScannedVideo };
