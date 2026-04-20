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

type TableInfoRow = {
  name: string;
};

function ensureColumn(tableName: string, columnName: string, definition: string): void {
  const rows = db.prepare(`PRAGMA table_info(${tableName})`).all() as TableInfoRow[];

  if (rows.some((row) => row.name === columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
}

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

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      related_entity_type TEXT,
      related_entity_id TEXT,
      payload_json TEXT NOT NULL,
      progress_current INTEGER NOT NULL DEFAULT 0,
      progress_total INTEGER NOT NULL DEFAULT 0,
      progress_message TEXT,
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      finished_at INTEGER,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_status_created_at
      ON jobs(status, created_at ASC);

    CREATE INDEX IF NOT EXISTS idx_jobs_related_entity
      ON jobs(related_entity_type, related_entity_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS remote_sources (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      auth_mode TEXT NOT NULL,
      api_key_encrypted TEXT,
      session_cookie_encrypted TEXT,
      scope_mode TEXT NOT NULL,
      collection_ids_json TEXT NOT NULL DEFAULT '[]',
      author_keys_json TEXT NOT NULL DEFAULT '[]',
      last_validated_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_remote_sources_type_enabled
      ON remote_sources(type, enabled, updated_at DESC);
  `);

  ensureColumn("videos", "container", "TEXT");
  ensureColumn("videos", "video_codec", "TEXT");
  ensureColumn("videos", "audio_codec", "TEXT");
  ensureColumn("videos", "duration_seconds", "REAL");
  ensureColumn("videos", "width", "INTEGER");
  ensureColumn("videos", "height", "INTEGER");
  ensureColumn("videos", "fps", "REAL");
  ensureColumn("videos", "thumbnail_path", "TEXT");
  ensureColumn("videos", "thumbnail_sm_path", "TEXT");
  ensureColumn("videos", "playback_path", "TEXT");
  ensureColumn("videos", "playback_status", "TEXT NOT NULL DEFAULT 'direct'");

  db.prepare("UPDATE videos SET playback_status = 'direct' WHERE playback_status IS NULL OR playback_status = ''").run();
  db.prepare("UPDATE jobs SET status = 'queued', updated_at = strftime('%s','now') WHERE status = 'running'").run();
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_videos_playback_status
      ON videos(playback_status, source_mtime_ms DESC);
  `);
}

initializeDatabase();
