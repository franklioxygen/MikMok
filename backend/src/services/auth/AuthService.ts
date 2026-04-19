import { timingSafeEqual } from "node:crypto";

import { env } from "../../config/env.js";

class AuthService {
  verifyPassword(candidate: string): boolean {
    const expected = Buffer.from(env.MIKMOK_PASSWORD);
    const actual = Buffer.from(candidate);

    if (expected.length !== actual.length) {
      return false;
    }

    return timingSafeEqual(expected, actual);
  }
}

export const authService = new AuthService();
