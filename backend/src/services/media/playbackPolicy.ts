type PlaybackStatus = "direct" | "needs_transcode" | "processing" | "ready" | "failed";

type PlaybackCandidate = {
  audioCodec: string | null;
  extension: string;
  mimeType: string;
  videoCodec: string | null;
};

function normalizeCodec(codec: string | null): string {
  return codec?.trim().toLowerCase() ?? "";
}

export function isPlayablePlaybackStatus(playbackStatus: string | null | undefined): boolean {
  return playbackStatus === "direct" || playbackStatus === "ready";
}

export function resolvePlaybackStatus(candidate: PlaybackCandidate): PlaybackStatus {
  const isMp4Like = candidate.mimeType === "video/mp4" || candidate.extension === ".mp4" || candidate.extension === ".m4v";
  const hasSupportedVideoCodec = normalizeCodec(candidate.videoCodec) === "h264";
  const normalizedAudioCodec = normalizeCodec(candidate.audioCodec);
  const hasSupportedAudioCodec = normalizedAudioCodec === "" || normalizedAudioCodec === "aac";

  return isMp4Like && hasSupportedVideoCodec && hasSupportedAudioCodec ? "direct" : "needs_transcode";
}

export type { PlaybackStatus };
