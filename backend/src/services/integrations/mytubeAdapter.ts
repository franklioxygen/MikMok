import { createHash } from "node:crypto";

import type { Request } from "express";

import { AppError } from "../../utils/http.js";
import { buildProxyRequestHeaders } from "../../utils/proxy.js";
import { createMyTubeCanonicalVideoId, parseCanonicalVideoId } from "./videoIds.js";
import { remoteSourcesService, type RemoteSourceInternal } from "./remoteSources.js";

type MyTubeVideoCollection = {
  id: string;
  name: string;
};

type MyTubeCatalogVideo = {
  authorAvatarPath: string | null;
  authorKey: string;
  authorName: string;
  collections: MyTubeVideoCollection[];
  durationSeconds: number | null;
  height: number | null;
  id: string;
  mimeType: string;
  signedThumbnailUrl: string | null;
  signedUrl: string | null;
  sourceName: string;
  sourceSize: number;
  thumbnailPath: string | null;
  thumbnailSmPath: string | null;
  title: string;
  updatedAt: number;
  videoPath: string | null;
  width: number | null;
};

type MyTubeCatalogCollection = {
  id: string;
  name: string;
  thumbnailVideoId: string | null;
  videoCount: number;
  videoIds: string[];
};

type MyTubeCatalogAuthor = {
  avatarPath: string | null;
  key: string;
  name: string;
  sampleVideoId: string;
  sourceId: string;
  videoCount: number;
};

type MyTubeCatalog = {
  authors: MyTubeCatalogAuthor[];
  collections: MyTubeCatalogCollection[];
  source: RemoteSourceInternal;
  videos: MyTubeCatalogVideo[];
};

type MyTubeDiscoveredCollection = {
  id: string;
  name: string;
  videoCount: number;
};

type MyTubeDiscoveredAuthor = {
  avatarUrl: string | null;
  key: string;
  name: string;
  videoCount: number;
};

type RemoteFeedVideo = {
  author: {
    avatarUrl: string | null;
    id: string;
    name: string;
  } | null;
  collections: MyTubeVideoCollection[];
  durationSeconds: number | null;
  folderId: string;
  folderName: string;
  height: number | null;
  id: string;
  mimeType: string;
  playbackStatus: "remote";
  remoteSourceId: string;
  remoteVideoId: string;
  sourceName: string;
  sourceSize: number;
  streamUrl: string;
  thumbnailSmUrl: string | null;
  title: string;
  updatedAt: number;
  width: number | null;
};

type RemoteFeedVideoDetails = RemoteFeedVideo & {
  audioCodec: string | null;
  folderPath: string;
  fps: number | null;
  lastPlayedAt: number | null;
  playCount: number;
  resumePositionSeconds: number;
  thumbnailUrl: string | null;
  videoCodec: string | null;
};

type MyTubeAuthorDetail = {
  avatarUrl: string | null;
  id: string;
  name: string;
  sourceId: string;
  sourceName: string;
  videoCount: number;
};

type CachedCatalog = {
  catalog: MyTubeCatalog;
  expiresAt: number;
};

const cacheTtlMs = 30_000;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
  }

  if (typeof value === "string") {
    const parsedDate = Date.parse(value);
    return Number.isFinite(parsedDate) ? Math.floor(parsedDate / 1000) : null;
  }

  return null;
}

function unwrapPayload(payload: unknown): unknown {
  const record = asRecord(payload);

  if (record?.success === true && "data" in record) {
    return record.data;
  }

  return payload;
}

function normalizeAuthorName(authorName: string): string {
  return authorName.trim().toLowerCase().replace(/\s+/g, " ");
}

function createAuthorKey(sourceId: string, authorName: string): string {
  return `mytube_${createHash("sha1").update(`${sourceId}:${normalizeAuthorName(authorName)}`).digest("hex").slice(0, 24)}`;
}

function createFolderKey(sourceId: string, collection: MyTubeVideoCollection | null): { folderId: string; folderName: string } {
  if (!collection) {
    return {
      folderId: `mytube:${sourceId}`,
      folderName: "MyTube"
    };
  }

  return {
    folderId: `mytube:${sourceId}:collection:${encodeURIComponent(collection.id)}`,
    folderName: collection.name
  };
}

function resolveUrl(baseUrl: string, pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }

  return new URL(pathOrUrl, `${baseUrl}/`).toString();
}

function extractCollectionVideoIds(record: Record<string, unknown>): string[] {
  const candidates = [record.videoIds, record.video_ids, record.videos];

  for (const candidate of candidates) {
    if (!Array.isArray(candidate)) {
      continue;
    }

    const videoIds = candidate
      .map((entry) => {
        if (typeof entry === "string") {
          return entry;
        }

        const entryRecord = asRecord(entry);
        return entryRecord ? readString(entryRecord.id) : null;
      })
      .filter((entry): entry is string => Boolean(entry));

    if (videoIds.length > 0) {
      return Array.from(new Set(videoIds));
    }
  }

  return [];
}

class MyTubeAdapterService {
  private readonly catalogCache = new Map<string, CachedCatalog>();

  invalidateSource(sourceId?: string): void {
    if (!sourceId) {
      this.catalogCache.clear();
      return;
    }

    this.catalogCache.delete(sourceId);
  }

  async listFeedVideos(): Promise<RemoteFeedVideo[]> {
    const sources = remoteSourcesService.listEnabledInternalSources("mytube");
    const catalogs = await Promise.all(sources.map((source) => this.getScopedCatalog(source)));

    return catalogs
      .flatMap((catalog) => catalog.videos.map((video) => this.toFeedVideo(catalog.source, video)))
      .sort((left, right) => right.updatedAt - left.updatedAt || left.title.localeCompare(right.title));
  }

  async findVideoDetailsByCanonicalId(videoId: string): Promise<RemoteFeedVideoDetails | null> {
    const parsedVideoId = parseCanonicalVideoId(videoId);

    if (parsedVideoId?.kind !== "mytube") {
      return null;
    }

    return this.findVideoDetails(parsedVideoId.remoteSourceId, parsedVideoId.remoteVideoId);
  }

  async findVideoDetails(remoteSourceId: string, remoteVideoId: string): Promise<RemoteFeedVideoDetails | null> {
    const source = remoteSourcesService.findInternalSourceById(remoteSourceId);

    if (!source || !source.enabled) {
      return null;
    }

    const catalog = await this.getScopedCatalog(source);
    const video = catalog.videos.find((entry) => entry.id === remoteVideoId);

    if (!video) {
      return null;
    }

    return this.toVideoDetails(source, video);
  }

  async testSource(source: RemoteSourceInternal): Promise<{ collectionCount: number; videoCount: number }> {
    const catalog = await this.getCatalog(source, true);

    return {
      videoCount: catalog.videos.length,
      collectionCount: catalog.collections.length
    };
  }

  async discoverSource(source: RemoteSourceInternal): Promise<{
    authors: MyTubeDiscoveredAuthor[];
    collections: MyTubeDiscoveredCollection[];
    videoCount: number;
  }> {
    const catalog = await this.getCatalog(source, true);

    return {
      videoCount: catalog.videos.length,
      collections: catalog.collections
        .map((collection) => ({
          id: collection.id,
          name: collection.name,
          videoCount: collection.videoCount
        }))
        .sort((left, right) => right.videoCount - left.videoCount || left.name.localeCompare(right.name)),
      authors: catalog.authors
        .map((author) => ({
          key: author.key,
          name: author.name,
          avatarUrl: author.avatarPath
            ? `/api/integrations/mytube/assets/avatar/${encodeURIComponent(author.sourceId)}/${encodeURIComponent(author.sampleVideoId)}`
            : null,
          videoCount: author.videoCount
        }))
        .sort((left, right) => right.videoCount - left.videoCount || left.name.localeCompare(right.name))
    };
  }

  async listAuthors(): Promise<MyTubeAuthorDetail[]> {
    const sources = remoteSourcesService.listEnabledInternalSources("mytube");
    const catalogs = await Promise.all(sources.map((source) => this.getScopedCatalog(source)));

    return catalogs
      .flatMap((catalog) =>
        catalog.authors.map((author) => ({
          id: author.key,
          name: author.name,
          avatarUrl: author.avatarPath
            ? `/api/integrations/mytube/assets/avatar/${encodeURIComponent(author.sourceId)}/${encodeURIComponent(author.sampleVideoId)}`
            : null,
          videoCount: author.videoCount,
          sourceId: catalog.source.id,
          sourceName: catalog.source.name
        }))
      )
      .sort((left, right) => right.videoCount - left.videoCount || left.name.localeCompare(right.name));
  }

  async findAuthor(authorKey: string): Promise<MyTubeAuthorDetail | null> {
    const authors = await this.listAuthors();
    return authors.find((author) => author.id === authorKey) ?? null;
  }

  async listVideosByAuthor(authorKey: string): Promise<RemoteFeedVideo[]> {
    const sources = remoteSourcesService.listEnabledInternalSources("mytube");
    const catalogs = await Promise.all(sources.map((source) => this.getScopedCatalog(source)));

    return catalogs
      .flatMap((catalog) =>
        catalog.videos
          .filter((video) => video.authorKey === authorKey)
          .map((video) => this.toFeedVideo(catalog.source, video))
      )
      .sort((left, right) => right.updatedAt - left.updatedAt || left.title.localeCompare(right.title));
  }

  async fetchVideoStream(
    remoteSourceId: string,
    remoteVideoId: string,
    request: Request
  ): Promise<Response> {
    const source = this.requireEnabledSource(remoteSourceId);
    const catalog = await this.getScopedCatalog(source);
    const video = catalog.videos.find((entry) => entry.id === remoteVideoId);

    if (!video) {
      throw new AppError(404, "VIDEO_NOT_FOUND", "Video not found.");
    }

    let targetUrl = await this.resolveStreamTargetUrl(source, video);
    let upstreamResponse = await this.fetchBinary(source, targetUrl, request);

    if ((upstreamResponse.status === 401 || upstreamResponse.status === 403) && video.videoPath?.startsWith("cloud:")) {
      targetUrl = await this.resolveStreamTargetUrl(source, video, true);
      upstreamResponse = await this.fetchBinary(source, targetUrl, request);
    }

    return upstreamResponse;
  }

  async fetchThumbnail(
    remoteSourceId: string,
    remoteVideoId: string,
    request: Request,
    variant: "full" | "sm"
  ): Promise<Response> {
    const source = this.requireEnabledSource(remoteSourceId);
    const catalog = await this.getScopedCatalog(source);
    const video = catalog.videos.find((entry) => entry.id === remoteVideoId);

    if (!video) {
      throw new AppError(404, "VIDEO_NOT_FOUND", "Video not found.");
    }

    const targetUrl = await this.resolveThumbnailTargetUrl(source, video, variant);

    if (!targetUrl) {
      throw new AppError(404, "THUMBNAIL_NOT_FOUND", "Thumbnail not found.");
    }

    return this.fetchBinary(source, targetUrl, request);
  }

  async fetchAuthorAvatar(
    remoteSourceId: string,
    remoteVideoId: string,
    request: Request
  ): Promise<Response> {
    const source = this.requireEnabledSource(remoteSourceId);
    const catalog = await this.getScopedCatalog(source);
    const video = catalog.videos.find((entry) => entry.id === remoteVideoId);

    if (!video?.authorAvatarPath) {
      throw new AppError(404, "AVATAR_NOT_FOUND", "Avatar not found.");
    }

    return this.fetchBinary(source, resolveUrl(source.baseUrl, video.authorAvatarPath), request);
  }

  private requireEnabledSource(sourceId: string): RemoteSourceInternal {
    const source = remoteSourcesService.findInternalSourceById(sourceId);

    if (!source || !source.enabled) {
      throw new AppError(404, "REMOTE_SOURCE_NOT_FOUND", "Remote source not found.");
    }

    return source;
  }

  private async getScopedCatalog(source: RemoteSourceInternal): Promise<MyTubeCatalog> {
    const catalog = await this.getCatalog(source);
    return this.applyScope(source, catalog);
  }

  private async getCatalog(source: RemoteSourceInternal, bypassCache = false): Promise<MyTubeCatalog> {
    const cachedCatalog = this.catalogCache.get(source.id);

    if (!bypassCache && cachedCatalog && cachedCatalog.expiresAt > Date.now()) {
      return cachedCatalog.catalog;
    }

    const catalog = await this.fetchCatalog(source);
    this.catalogCache.set(source.id, {
      catalog,
      expiresAt: Date.now() + cacheTtlMs
    });

    return catalog;
  }

  private async fetchCatalog(source: RemoteSourceInternal): Promise<MyTubeCatalog> {
    const rawVideos = await this.fetchArray(source, "/api/videos");
    const rawCollections = await this.fetchArray(source, "/api/collections").catch(() => []);

    const collectionsByVideoId = new Map<string, MyTubeVideoCollection[]>();
    const normalizedCollections: MyTubeCatalogCollection[] = [];

    for (const rawCollection of rawCollections) {
      const collectionRecord = asRecord(rawCollection);

      if (!collectionRecord) {
        continue;
      }

      const collectionId = readString(collectionRecord.id);
      const collectionName = readString(collectionRecord.name) ?? readString(collectionRecord.title);

      if (!collectionId || !collectionName) {
        continue;
      }

      const videoIds = extractCollectionVideoIds(collectionRecord);

      normalizedCollections.push({
        id: collectionId,
        name: collectionName,
        videoIds,
        videoCount: videoIds.length,
        thumbnailVideoId: videoIds[0] ?? null
      });

      for (const videoId of videoIds) {
        const existingCollections = collectionsByVideoId.get(videoId) ?? [];
        existingCollections.push({
          id: collectionId,
          name: collectionName
        });
        collectionsByVideoId.set(videoId, existingCollections);
      }
    }

    const normalizedVideos: MyTubeCatalogVideo[] = [];

    for (const rawVideo of rawVideos) {
      const videoRecord = asRecord(rawVideo);

      if (!videoRecord) {
        continue;
      }

      const videoId = readString(videoRecord.id);

      if (!videoId) {
        continue;
      }

      const title = readString(videoRecord.title) ?? readString(videoRecord.sourceName) ?? videoId;
      const authorName = readString(videoRecord.author) ?? "Unknown author";
      const authorKey = createAuthorKey(source.id, authorName);
      const thumbnailUrl = readString(videoRecord.thumbnailUrl);
      const thumbnailPath = readString(videoRecord.thumbnailPath) ?? thumbnailUrl;
      const thumbnailSmPath = readString(videoRecord.thumbnailSmUrl) ?? readString(videoRecord.thumbnailSmPath) ?? thumbnailPath;
      const signedThumbnailUrl = readString(videoRecord.signedThumbnailUrl);

      normalizedVideos.push({
        id: videoId,
        title,
        sourceName: readString(videoRecord.sourceName) ?? title,
        authorName,
        authorKey,
        authorAvatarPath: readString(videoRecord.authorAvatarPath) ?? readString(videoRecord.authorAvatarUrl),
        videoPath: readString(videoRecord.videoPath) ?? readString(videoRecord.path),
        signedUrl: readString(videoRecord.signedUrl),
        thumbnailPath,
        thumbnailSmPath,
        signedThumbnailUrl,
        mimeType: readString(videoRecord.mimeType) ?? "video/mp4",
        sourceSize: readNumber(videoRecord.sourceSize) ?? 0,
        durationSeconds: readNumber(videoRecord.durationSeconds) ?? readNumber(videoRecord.duration),
        width: readNumber(videoRecord.width),
        height: readNumber(videoRecord.height),
        updatedAt:
          readTimestamp(videoRecord.updatedAt) ??
          readTimestamp(videoRecord.addedAt) ??
          readTimestamp(videoRecord.createdAt) ??
          Math.floor(Date.now() / 1000),
        collections: collectionsByVideoId.get(videoId) ?? []
      });
    }

    const authorsByKey = new Map<string, MyTubeCatalogAuthor>();

    for (const video of normalizedVideos) {
      const existingAuthor = authorsByKey.get(video.authorKey);

      if (existingAuthor) {
        existingAuthor.videoCount += 1;

        if (!existingAuthor.avatarPath && video.authorAvatarPath) {
          existingAuthor.avatarPath = video.authorAvatarPath;
        }

        continue;
      }

      authorsByKey.set(video.authorKey, {
        key: video.authorKey,
        name: video.authorName,
        avatarPath: video.authorAvatarPath,
        sampleVideoId: video.id,
        sourceId: source.id,
        videoCount: 1
      });
    }

    return {
      source,
      videos: normalizedVideos,
      collections: normalizedCollections,
      authors: Array.from(authorsByKey.values()).sort(
        (left, right) => right.videoCount - left.videoCount || left.name.localeCompare(right.name)
      )
    };
  }

  private applyScope(source: RemoteSourceInternal, catalog: MyTubeCatalog): MyTubeCatalog {
    if (source.scopeMode === "all") {
      return catalog;
    }

    const allowedCollectionIds = new Set(source.collectionIds);
    const allowedAuthorKeys = new Set(source.authorKeys);

    const filteredVideos = catalog.videos.filter((video) => {
      const matchesCollection = video.collections.some((collection) => allowedCollectionIds.has(collection.id));
      const matchesAuthor = allowedAuthorKeys.has(video.authorKey);

      if (source.scopeMode === "collections") {
        return matchesCollection;
      }

      if (source.scopeMode === "authors") {
        return matchesAuthor;
      }

      return matchesCollection || matchesAuthor;
    });

    const videoIds = new Set(filteredVideos.map((video) => video.id));
    const collectionVideoCounts = new Map<string, number>();

    for (const video of filteredVideos) {
      for (const collection of video.collections) {
        collectionVideoCounts.set(collection.id, (collectionVideoCounts.get(collection.id) ?? 0) + 1);
      }
    }

    const filteredCollections = catalog.collections
      .map((collection) => ({
        ...collection,
        videoCount: collectionVideoCounts.get(collection.id) ?? 0,
        videoIds: collection.videoIds.filter((videoId) => videoIds.has(videoId)),
        thumbnailVideoId: collection.videoIds.find((videoId) => videoIds.has(videoId)) ?? null
      }))
      .filter((collection) => collection.videoCount > 0);

    const filteredAuthors = catalog.authors
      .map((author) => ({
        ...author,
        videoCount: filteredVideos.filter((video) => video.authorKey === author.key).length,
        sampleVideoId:
          filteredVideos.find((video) => video.authorKey === author.key)?.id ?? author.sampleVideoId
      }))
      .filter((author) => author.videoCount > 0);

    return {
      source,
      videos: filteredVideos,
      collections: filteredCollections,
      authors: filteredAuthors
    };
  }

  private async fetchArray(source: RemoteSourceInternal, pathname: string): Promise<unknown[]> {
    const response = await this.fetchJson(source, pathname);
    return Array.isArray(response) ? response : [];
  }

  private async fetchJson(source: RemoteSourceInternal, pathname: string): Promise<unknown> {
    const url = resolveUrl(source.baseUrl, pathname);
    const response = await fetch(url, {
      headers: this.buildSourceHeaders(source)
    }).catch(() => {
      throw new AppError(502, "REMOTE_SOURCE_UNREACHABLE", `Failed to reach ${source.name}.`);
    });

    if (!response.ok) {
      throw new AppError(502, "REMOTE_SOURCE_REQUEST_FAILED", `${source.name} responded with status ${response.status}.`);
    }

    const payload = await response.json().catch(() => null);

    if (payload === null) {
      throw new AppError(502, "REMOTE_SOURCE_INVALID_RESPONSE", `${source.name} returned invalid JSON.`);
    }

    return unwrapPayload(payload);
  }

  private buildSourceHeaders(source: RemoteSourceInternal): Headers {
    const headers = new Headers({
      accept: "application/json"
    });

    if (source.authMode === "session_cookie" && source.sessionCookie) {
      headers.set("cookie", source.sessionCookie);
    }

    if (source.authMode === "integration_api_key" && source.apiKey) {
      headers.set("x-api-key", source.apiKey);
      headers.set("authorization", `Bearer ${source.apiKey}`);
    }

    return headers;
  }

  private buildAssetHeaders(source: RemoteSourceInternal, targetUrl: string, request: Request): Headers {
    const headers = buildProxyRequestHeaders(request);
    const baseOrigin = new URL(source.baseUrl).origin;
    const targetOrigin = new URL(targetUrl).origin;

    if (baseOrigin === targetOrigin) {
      for (const [headerName, headerValue] of this.buildSourceHeaders(source).entries()) {
        headers.set(headerName, headerValue);
      }
    }

    return headers;
  }

  private async fetchBinary(source: RemoteSourceInternal, targetUrl: string, request: Request): Promise<Response> {
    const response = await fetch(targetUrl, {
      headers: this.buildAssetHeaders(source, targetUrl, request)
    }).catch(() => {
      throw new AppError(502, "REMOTE_SOURCE_UNREACHABLE", `Failed to reach ${source.name}.`);
    });

    if (response.status >= 500) {
      throw new AppError(502, "REMOTE_SOURCE_REQUEST_FAILED", `${source.name} responded with status ${response.status}.`);
    }

    return response;
  }

  private async resolveStreamTargetUrl(
    source: RemoteSourceInternal,
    video: MyTubeCatalogVideo,
    forceDetailRefresh = false
  ): Promise<string> {
    if (!forceDetailRefresh) {
      if (video.signedUrl) {
        return resolveUrl(source.baseUrl, video.signedUrl);
      }

      if (video.videoPath?.startsWith("/")) {
        return resolveUrl(source.baseUrl, video.videoPath);
      }

      if (video.videoPath?.startsWith("mount:")) {
        return resolveUrl(source.baseUrl, `/api/mount-video/${encodeURIComponent(video.id)}`);
      }
    }

    const details = await this.fetchJson(source, `/api/videos/${encodeURIComponent(video.id)}`);
    const detailsRecord = asRecord(details);
    const signedUrl = readString(detailsRecord?.signedUrl);

    if (signedUrl) {
      return resolveUrl(source.baseUrl, signedUrl);
    }

    const detailVideoPath = readString(detailsRecord?.videoPath) ?? video.videoPath;

    if (detailVideoPath?.startsWith("/")) {
      return resolveUrl(source.baseUrl, detailVideoPath);
    }

    if (detailVideoPath?.startsWith("mount:")) {
      return resolveUrl(source.baseUrl, `/api/mount-video/${encodeURIComponent(video.id)}`);
    }

    throw new AppError(502, "REMOTE_STREAM_UNAVAILABLE", "Remote video stream is not available.");
  }

  private async resolveThumbnailTargetUrl(
    source: RemoteSourceInternal,
    video: MyTubeCatalogVideo,
    variant: "full" | "sm"
  ): Promise<string | null> {
    const initialCandidate =
      variant === "sm"
        ? video.thumbnailSmPath ?? video.thumbnailPath ?? video.signedThumbnailUrl
        : video.thumbnailPath ?? video.thumbnailSmPath ?? video.signedThumbnailUrl;

    if (initialCandidate && !initialCandidate.startsWith("cloud:")) {
      return resolveUrl(source.baseUrl, initialCandidate);
    }

    const details = await this.fetchJson(source, `/api/videos/${encodeURIComponent(video.id)}`);
    const detailsRecord = asRecord(details);
    const signedThumbnailUrl = readString(detailsRecord?.signedThumbnailUrl);
    const detailThumbnailUrl =
      readString(detailsRecord?.thumbnailUrl) ??
      readString(detailsRecord?.thumbnailPath) ??
      readString(detailsRecord?.thumbnailSmUrl);

    if (signedThumbnailUrl) {
      return resolveUrl(source.baseUrl, signedThumbnailUrl);
    }

    if (detailThumbnailUrl) {
      return resolveUrl(source.baseUrl, detailThumbnailUrl);
    }

    return null;
  }

  private toFeedVideo(source: RemoteSourceInternal, video: MyTubeCatalogVideo): RemoteFeedVideo {
    const canonicalId = createMyTubeCanonicalVideoId(source.id, video.id);
    const primaryCollection = video.collections[0] ?? null;
    const folder = createFolderKey(source.id, primaryCollection);

    return {
      id: canonicalId,
      title: video.title,
      sourceName: video.sourceName,
      folderId: folder.folderId,
      folderName: primaryCollection?.name ?? source.name,
      streamUrl: `/stream/${encodeURIComponent(canonicalId)}`,
      mimeType: video.mimeType,
      sourceSize: video.sourceSize,
      playbackStatus: "remote",
      durationSeconds: video.durationSeconds,
      width: video.width,
      height: video.height,
      thumbnailSmUrl:
        video.thumbnailSmPath || video.thumbnailPath || video.signedThumbnailUrl
          ? `/api/videos/${encodeURIComponent(canonicalId)}/thumbnail-sm`
          : null,
      updatedAt: video.updatedAt,
      author: {
        id: video.authorKey,
        name: video.authorName,
        avatarUrl: video.authorAvatarPath
          ? `/api/integrations/mytube/assets/avatar/${encodeURIComponent(source.id)}/${encodeURIComponent(video.id)}`
          : null
      },
      collections: video.collections,
      remoteSourceId: source.id,
      remoteVideoId: video.id
    };
  }

  private toVideoDetails(source: RemoteSourceInternal, video: MyTubeCatalogVideo): RemoteFeedVideoDetails {
    const feedVideo = this.toFeedVideo(source, video);

    return {
      ...feedVideo,
      folderPath: source.baseUrl,
      playCount: 0,
      resumePositionSeconds: 0,
      lastPlayedAt: null,
      thumbnailUrl:
        video.thumbnailPath || video.thumbnailSmPath || video.signedThumbnailUrl
          ? `/api/videos/${encodeURIComponent(feedVideo.id)}/thumbnail`
          : null,
      videoCodec: null,
      audioCodec: null,
      fps: null
    };
  }
}

export const myTubeAdapterService = new MyTubeAdapterService();

export type { MyTubeAuthorDetail, RemoteFeedVideo, RemoteFeedVideoDetails };
