import { Readable } from "node:stream";
import type { Request, Response as ExpressResponse } from "express";

const passthroughRequestHeaders = ["accept", "accept-language", "if-modified-since", "if-none-match", "range"] as const;
const passthroughResponseHeaders = [
  "accept-ranges",
  "cache-control",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified"
] as const;

export function buildProxyRequestHeaders(
  request: Request,
  baseHeaders?: Headers | Record<string, string>
): Headers {
  const headers = new Headers(baseHeaders);

  for (const headerName of passthroughRequestHeaders) {
    const headerValue = request.get(headerName);

    if (headerValue && !headers.has(headerName)) {
      headers.set(headerName, headerValue);
    }
  }

  return headers;
}

export async function pipeUpstreamResponse(
  upstreamResponse: Response,
  response: ExpressResponse
): Promise<void> {
  response.status(upstreamResponse.status);

  for (const headerName of passthroughResponseHeaders) {
    const headerValue = upstreamResponse.headers.get(headerName);

    if (headerValue) {
      response.setHeader(headerName, headerValue);
    }
  }

  if (!upstreamResponse.body) {
    response.end();
    return;
  }

  Readable.fromWeb(upstreamResponse.body).pipe(response);
}
