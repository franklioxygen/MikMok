import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { env } from "../../config/env.js";

const algorithm = "aes-256-gcm";
const payloadVersion = "v1";

class SecretsService {
  private readonly encryptionKey = createHash("sha256").update(env.remoteSourceSecret).digest();

  encrypt(value: string | null): string | null {
    if (value === null) {
      return null;
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv(algorithm, this.encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [payloadVersion, iv.toString("base64url"), authTag.toString("base64url"), ciphertext.toString("base64url")].join(".");
  }

  decrypt(value: string | null): string | null {
    if (value === null) {
      return null;
    }

    const [version, ivRaw, authTagRaw, ciphertextRaw] = value.split(".");

    if (version !== payloadVersion || !ivRaw || !authTagRaw || !ciphertextRaw) {
      return null;
    }

    try {
      const decipher = createDecipheriv(algorithm, this.encryptionKey, Buffer.from(ivRaw, "base64url"));
      decipher.setAuthTag(Buffer.from(authTagRaw, "base64url"));

      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertextRaw, "base64url")),
        decipher.final()
      ]);

      return plaintext.toString("utf8");
    } catch {
      return null;
    }
  }
}

export const secretsService = new SecretsService();
