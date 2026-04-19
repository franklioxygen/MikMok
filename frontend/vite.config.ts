import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "VITE_");

  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 5173,
      allowedHosts: env.VITE_ALLOWED_HOSTS
        ? env.VITE_ALLOWED_HOSTS.split(",")
            .map((host) => host.trim())
            .filter(Boolean)
        : [],
      proxy: {
        // Keep the proxy target on localhost so LAN clients can still use the same frontend origin.
        "/api": env.VITE_BACKEND_URL || "http://127.0.0.1:5552",
        "/stream": env.VITE_BACKEND_URL || "http://127.0.0.1:5552"
      }
    }
  };
});
