import { createHash, randomBytes } from "node:crypto";

import { env } from "../../config/env.js";

type SessionRecord = {
  createdAt: number;
  csrfToken: string;
  expiresAt: number;
  lastSeenAt: number;
};

type CreatedSession = {
  csrfToken: string;
  expiresAt: number;
  token: string;
};

class SessionService {
  private readonly sessions = new Map<string, SessionRecord>();

  createSession(): CreatedSession {
    this.pruneExpiredSessions();

    const token = randomBytes(32).toString("hex");
    const csrfToken = randomBytes(24).toString("hex");
    const now = Date.now();
    const expiresAt = now + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

    this.sessions.set(this.hashToken(token), {
      createdAt: now,
      csrfToken,
      expiresAt,
      lastSeenAt: now
    });

    return {
      token,
      csrfToken,
      expiresAt: Math.floor(expiresAt / 1000)
    };
  }

  getSession(token: string | undefined): { csrfToken: string; expiresAt: number } | null {
    if (!token) {
      return null;
    }

    const key = this.hashToken(token);
    const session = this.sessions.get(key);

    if (!session) {
      return null;
    }

    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(key);
      return null;
    }

    session.lastSeenAt = Date.now();

    return {
      csrfToken: session.csrfToken,
      expiresAt: Math.floor(session.expiresAt / 1000)
    };
  }

  revokeSession(token: string | undefined): void {
    if (!token) {
      return;
    }

    this.sessions.delete(this.hashToken(token));
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private pruneExpiredSessions(): void {
    const now = Date.now();

    for (const [token, session] of this.sessions.entries()) {
      if (session.expiresAt <= now) {
        this.sessions.delete(token);
      }
    }
  }
}

export const sessionService = new SessionService();
