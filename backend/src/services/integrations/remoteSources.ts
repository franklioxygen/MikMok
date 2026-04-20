import { randomUUID } from "node:crypto";

import { db } from "../../db/index.js";
import { secretsService } from "../security/secretsService.js";

type RemoteSourceType = "mytube";
type RemoteSourceScopeMode = "all" | "authors" | "collections" | "mixed";
type RemoteSourceAuthMode = "integration_api_key" | "none" | "session_cookie";

type RemoteSourceRow = {
  api_key_encrypted: string | null;
  auth_mode: RemoteSourceAuthMode;
  author_keys_json: string;
  base_url: string;
  collection_ids_json: string;
  created_at: number;
  enabled: number;
  id: string;
  last_validated_at: number | null;
  name: string;
  scope_mode: RemoteSourceScopeMode;
  session_cookie_encrypted: string | null;
  type: RemoteSourceType;
  updated_at: number;
};

type RemoteSourcePublic = {
  authMode: RemoteSourceAuthMode;
  authorKeys: string[];
  baseUrl: string;
  collectionIds: string[];
  createdAt: number;
  enabled: boolean;
  hasCredential: boolean;
  id: string;
  lastValidatedAt: number | null;
  name: string;
  scopeMode: RemoteSourceScopeMode;
  type: RemoteSourceType;
  updatedAt: number;
};

type RemoteSourceInternal = RemoteSourcePublic & {
  apiKey: string | null;
  sessionCookie: string | null;
};

type RemoteSourceCreateInput = {
  authMode: RemoteSourceAuthMode;
  authorKeys: string[];
  baseUrl: string;
  collectionIds: string[];
  credential: string | null;
  enabled: boolean;
  name: string;
  scopeMode: RemoteSourceScopeMode;
  type: RemoteSourceType;
};

type RemoteSourceUpdateInput = Partial<Omit<RemoteSourceCreateInput, "type">>;

function parseStringArray(value: string): string[] {
  try {
    const parsedValue = JSON.parse(value) as unknown;
    return Array.isArray(parsedValue) ? parsedValue.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

function toPublicRemoteSource(row: RemoteSourceRow): RemoteSourcePublic {
  return {
    id: row.id,
    type: row.type,
    enabled: row.enabled === 1,
    name: row.name,
    baseUrl: row.base_url,
    authMode: row.auth_mode,
    scopeMode: row.scope_mode,
    collectionIds: parseStringArray(row.collection_ids_json),
    authorKeys: parseStringArray(row.author_keys_json),
    lastValidatedAt: row.last_validated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hasCredential: Boolean(row.api_key_encrypted || row.session_cookie_encrypted)
  };
}

function toInternalRemoteSource(row: RemoteSourceRow): RemoteSourceInternal {
  const publicSource = toPublicRemoteSource(row);

  return {
    ...publicSource,
    apiKey: secretsService.decrypt(row.api_key_encrypted),
    sessionCookie: secretsService.decrypt(row.session_cookie_encrypted)
  };
}

class RemoteSourcesService {
  listSources(): RemoteSourcePublic[] {
    const rows = db
      .prepare(
        `
          SELECT *
          FROM remote_sources
          ORDER BY enabled DESC, updated_at DESC, name ASC
        `
      )
      .all() as RemoteSourceRow[];

    return rows.map((row) => toPublicRemoteSource(row));
  }

  listEnabledInternalSources(type: RemoteSourceType): RemoteSourceInternal[] {
    const rows = db
      .prepare(
        `
          SELECT *
          FROM remote_sources
          WHERE type = ? AND enabled = 1
          ORDER BY updated_at DESC, name ASC
        `
      )
      .all(type) as RemoteSourceRow[];

    return rows.map((row) => toInternalRemoteSource(row));
  }

  findSourceById(sourceId: string): RemoteSourcePublic | null {
    const row = db.prepare("SELECT * FROM remote_sources WHERE id = ? LIMIT 1").get(sourceId) as
      | RemoteSourceRow
      | undefined;

    return row ? toPublicRemoteSource(row) : null;
  }

  findInternalSourceById(sourceId: string): RemoteSourceInternal | null {
    const row = db.prepare("SELECT * FROM remote_sources WHERE id = ? LIMIT 1").get(sourceId) as
      | RemoteSourceRow
      | undefined;

    return row ? toInternalRemoteSource(row) : null;
  }

  createSource(input: RemoteSourceCreateInput): RemoteSourcePublic {
    const now = Math.floor(Date.now() / 1000);
    const id = randomUUID();
    const credential = input.credential?.trim() || null;

    const apiKeyEncrypted =
      input.authMode === "integration_api_key" ? secretsService.encrypt(credential) : null;
    const sessionCookieEncrypted =
      input.authMode === "session_cookie" ? secretsService.encrypt(credential) : null;

    db.prepare(
      `
        INSERT INTO remote_sources (
          id,
          type,
          enabled,
          name,
          base_url,
          auth_mode,
          api_key_encrypted,
          session_cookie_encrypted,
          scope_mode,
          collection_ids_json,
          author_keys_json,
          last_validated_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    ).run(
      id,
      input.type,
      input.enabled ? 1 : 0,
      input.name.trim(),
      normalizeBaseUrl(input.baseUrl),
      input.authMode,
      apiKeyEncrypted,
      sessionCookieEncrypted,
      input.scopeMode,
      JSON.stringify(input.collectionIds),
      JSON.stringify(input.authorKeys),
      null,
      now,
      now
    );

    return this.findSourceById(id)!;
  }

  updateSource(sourceId: string, input: RemoteSourceUpdateInput): RemoteSourcePublic | null {
    const existingSource = this.findInternalSourceById(sourceId);

    if (!existingSource) {
      return null;
    }

    const nextAuthMode = input.authMode ?? existingSource.authMode;
    const nextCredential = input.credential === undefined ? undefined : input.credential?.trim() || null;

    let apiKeyEncrypted = secretsService.encrypt(existingSource.apiKey);
    let sessionCookieEncrypted = secretsService.encrypt(existingSource.sessionCookie);

    if (nextAuthMode === "none") {
      apiKeyEncrypted = null;
      sessionCookieEncrypted = null;
    } else if (nextCredential !== undefined) {
      apiKeyEncrypted = nextAuthMode === "integration_api_key" ? secretsService.encrypt(nextCredential) : null;
      sessionCookieEncrypted = nextAuthMode === "session_cookie" ? secretsService.encrypt(nextCredential) : null;
    } else if (input.authMode && input.authMode !== existingSource.authMode) {
      apiKeyEncrypted = null;
      sessionCookieEncrypted = null;
    }

    const updatedAt = Math.floor(Date.now() / 1000);

    db.prepare(
      `
        UPDATE remote_sources
        SET
          enabled = ?,
          name = ?,
          base_url = ?,
          auth_mode = ?,
          api_key_encrypted = ?,
          session_cookie_encrypted = ?,
          scope_mode = ?,
          collection_ids_json = ?,
          author_keys_json = ?,
          updated_at = ?
        WHERE id = ?
      `
    ).run(
      (input.enabled ?? existingSource.enabled) ? 1 : 0,
      (input.name ?? existingSource.name).trim(),
      normalizeBaseUrl(input.baseUrl ?? existingSource.baseUrl),
      nextAuthMode,
      apiKeyEncrypted,
      sessionCookieEncrypted,
      input.scopeMode ?? existingSource.scopeMode,
      JSON.stringify(input.collectionIds ?? existingSource.collectionIds),
      JSON.stringify(input.authorKeys ?? existingSource.authorKeys),
      updatedAt,
      sourceId
    );

    return this.findSourceById(sourceId);
  }

  deleteSource(sourceId: string): boolean {
    const result = db.prepare("DELETE FROM remote_sources WHERE id = ?").run(sourceId);
    return result.changes > 0;
  }

  markValidated(sourceId: string): RemoteSourcePublic | null {
    const now = Math.floor(Date.now() / 1000);
    db.prepare("UPDATE remote_sources SET last_validated_at = ?, updated_at = ? WHERE id = ?").run(now, now, sourceId);
    return this.findSourceById(sourceId);
  }
}

export const remoteSourcesService = new RemoteSourcesService();

export type {
  RemoteSourceAuthMode,
  RemoteSourceCreateInput,
  RemoteSourceInternal,
  RemoteSourcePublic,
  RemoteSourceScopeMode,
  RemoteSourceType,
  RemoteSourceUpdateInput
};
