export type CanonicalVideoRef =
  | {
      canonicalId: string;
      kind: "local";
      localVideoId: string;
    }
  | {
      canonicalId: string;
      kind: "mytube";
      remoteSourceId: string;
      remoteVideoId: string;
    };

export function createLocalCanonicalVideoId(localVideoId: string): string {
  return `local:${encodeURIComponent(localVideoId)}`;
}

export function createMyTubeCanonicalVideoId(remoteSourceId: string, remoteVideoId: string): string {
  return `mytube:${encodeURIComponent(remoteSourceId)}:${encodeURIComponent(remoteVideoId)}`;
}

export function parseCanonicalVideoId(videoId: string): CanonicalVideoRef | null {
  if (videoId.startsWith("local:")) {
    const localVideoId = videoId.slice("local:".length);

    if (!localVideoId) {
      return null;
    }

    return {
      kind: "local",
      localVideoId: decodeURIComponent(localVideoId),
      canonicalId: videoId
    };
  }

  if (videoId.startsWith("mytube:")) {
    const remainder = videoId.slice("mytube:".length);
    const separatorIndex = remainder.indexOf(":");

    if (separatorIndex <= 0 || separatorIndex >= remainder.length - 1) {
      return null;
    }

    const remoteSourceId = decodeURIComponent(remainder.slice(0, separatorIndex));
    const remoteVideoId = decodeURIComponent(remainder.slice(separatorIndex + 1));

    return {
      kind: "mytube",
      remoteSourceId,
      remoteVideoId,
      canonicalId: createMyTubeCanonicalVideoId(remoteSourceId, remoteVideoId)
    };
  }

  return null;
}

export function coerceVideoIdToCanonical(videoId: string): string {
  const parsed = parseCanonicalVideoId(videoId);
  return parsed ? parsed.canonicalId : createLocalCanonicalVideoId(videoId);
}

export function getLegacyLocalVideoId(videoId: string): string | null {
  const parsed = parseCanonicalVideoId(videoId);
  return parsed?.kind === "local" ? parsed.localVideoId : null;
}
