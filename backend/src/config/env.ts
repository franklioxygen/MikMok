import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(5552),
  CORS_ORIGIN: z.string().default("http://localhost:5173"),
  MIKMOK_PASSWORD: z.string().min(1).default("changeme"),
  REMOTE_SOURCE_SECRET: z.string().optional(),
  ALLOWED_MOUNT_ROOTS: z.string().default("/mounts"),
  SESSION_TTL_DAYS: z.coerce.number().positive().default(7),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().default(500),
  TRANSCODE_ENABLED: z
    .union([z.literal("0"), z.literal("1"), z.literal("true"), z.literal("false")])
    .default("1")
});

const parsed = envSchema.parse(process.env);

export const env = {
  ...parsed,
  remoteSourceSecret: parsed.REMOTE_SOURCE_SECRET?.trim() || parsed.MIKMOK_PASSWORD,
  transcodeEnabled: parsed.TRANSCODE_ENABLED === "1" || parsed.TRANSCODE_ENABLED === "true",
  allowedMountRoots: parsed.ALLOWED_MOUNT_ROOTS.split(",").map((value) => value.trim()).filter(Boolean)
};
