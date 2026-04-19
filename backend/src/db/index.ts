import { mkdirSync } from "node:fs";
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dataDirectory = path.resolve(__dirname, "../../data");
const filename = path.join(dataDirectory, "mikmok.db");

mkdirSync(dataDirectory, { recursive: true });

export const dbConfig = {
  filename
} as const;

export const db = new Database(filename);

export function initializeDatabase(): void {
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mounted_folders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mount_path TEXT NOT NULL UNIQUE,
      is_active INTEGER NOT NULL DEFAULT 1,
      auto_scan INTEGER NOT NULL DEFAULT 0,
      scan_interval_minutes INTEGER,
      max_depth INTEGER,
      scan_status TEXT NOT NULL DEFAULT 'pending',
      last_scanned_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_mounted_folders_active
      ON mounted_folders(is_active, updated_at DESC);

    CREATE TABLE IF NOT EXISTS videos (
      id TEXT PRIMARY KEY,
      folder_id TEXT NOT NULL REFERENCES mounted_folders(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      source_name TEXT NOT NULL,
      source_path TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      extension TEXT NOT NULL,
      source_size INTEGER NOT NULL,
      source_mtime_ms REAL NOT NULL,
      indexed_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_videos_folder_mtime
      ON videos(folder_id, source_mtime_ms DESC);

    CREATE INDEX IF NOT EXISTS idx_videos_mtime
      ON videos(source_mtime_ms DESC);

    CREATE TABLE IF NOT EXISTS playback_state (
      video_id TEXT PRIMARY KEY,
      play_count INTEGER NOT NULL DEFAULT 0,
      resume_position_seconds REAL NOT NULL DEFAULT 0,
      last_played_at INTEGER,
      updated_at INTEGER NOT NULL
    );
  `);
}

initializeDatabase();
