import type { NextFunction, Request, Response } from "express";

import { sessionService } from "../services/auth/SessionService.js";
import { AppError } from "../utils/http.js";

const sessionCookieName = "mikmok_session";

type AuthenticatedSession = {
  csrfToken: string;
  expiresAt: number;
};

declare global {
  namespace Express {
    interface Request {
      authSession?: AuthenticatedSession;
      authToken?: string;
    }
  }
}

function readAuthenticatedSession(request: Request): { session: AuthenticatedSession; token: string } | null {
  const token = request.cookies?.[sessionCookieName] as string | undefined;
  const session = sessionService.getSession(token);

  if (!token || !session) {
    return null;
  }

  return {
    token,
    session
  };
}

export function requireAuthenticatedSession(request: Request, _response: Response, next: NextFunction): void {
  const authenticatedSession = readAuthenticatedSession(request);

  if (!authenticatedSession) {
    next(new AppError(401, "AUTH_REQUIRED", "Login required."));
    return;
  }

  request.authSession = authenticatedSession.session;
  request.authToken = authenticatedSession.token;
  next();
}

export function requireCsrfToken(request: Request, _response: Response, next: NextFunction): void {
  const authenticatedSession = request.authSession
    ? {
        token: request.authToken ?? "",
        session: request.authSession
      }
    : readAuthenticatedSession(request);

  if (!authenticatedSession) {
    next(new AppError(401, "AUTH_REQUIRED", "Login required."));
    return;
  }

  const csrfToken = request.get("x-csrf-token");

  if (!csrfToken || csrfToken !== authenticatedSession.session.csrfToken) {
    next(new AppError(403, "INVALID_CSRF_TOKEN", "CSRF token mismatch."));
    return;
  }

  request.authSession = authenticatedSession.session;
  request.authToken = authenticatedSession.token;
  next();
}
