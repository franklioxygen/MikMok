import type { Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";

import { authService } from "../services/auth/AuthService.js";
import { sessionService } from "../services/auth/SessionService.js";
import { AppError, sendSuccess } from "../utils/http.js";

const loginSchema = z.object({
  password: z.string().min(1, "Password is required.")
});

const sessionCookieName = "mikmok_session";
const csrfCookieName = "mikmok_csrf";

function clearAuthCookies(response: Response): void {
  response.clearCookie(sessionCookieName, { path: "/" });
  response.clearCookie(csrfCookieName, { path: "/" });
}

function applyAuthCookies(response: Response, token: string, csrfToken: string, expiresAt: number): void {
  const expires = new Date(expiresAt * 1000);
  const secure = process.env.NODE_ENV === "production";

  response.cookie(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    expires
  });

  response.cookie(csrfCookieName, csrfToken, {
    httpOnly: false,
    sameSite: "lax",
    secure,
    path: "/",
    expires
  });
}

export const authRouter = Router();

authRouter.post("/login", (request: Request, response: Response) => {
  const { password } = loginSchema.parse(request.body);

  if (!authService.verifyPassword(password)) {
    throw new AppError(401, "INVALID_CREDENTIALS", "Password is incorrect.");
  }

  const session = sessionService.createSession();
  applyAuthCookies(response, session.token, session.csrfToken, session.expiresAt);

  sendSuccess(response, {
    authenticated: true,
    sessionExpiresAt: session.expiresAt
  });
});

authRouter.post("/logout", (request: Request, response: Response) => {
  const token = request.cookies[sessionCookieName] as string | undefined;
  sessionService.revokeSession(token);
  clearAuthCookies(response);

  sendSuccess(response, {
    authenticated: false,
    sessionExpiresAt: null
  });
});

authRouter.get("/status", (request: Request, response: Response) => {
  const token = request.cookies[sessionCookieName] as string | undefined;
  const session = sessionService.getSession(token);

  if (!session || !token) {
    clearAuthCookies(response);
    sendSuccess(response, {
      authenticated: false,
      sessionExpiresAt: null
    });
    return;
  }

  applyAuthCookies(response, token, session.csrfToken, session.expiresAt);

  sendSuccess(response, {
    authenticated: true,
    sessionExpiresAt: session.expiresAt
  });
});
