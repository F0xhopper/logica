import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => {
  // Share PORT with apps/api via the root .env so both sides agree on where the API lives.
  const env = { ...loadEnv(mode, "../..", ""), ...process.env };
  const apiTarget = env.LOGICA_API_URL ?? `http://localhost:${env.PORT ?? 8787}`;

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          configure(proxy) {
            // Keep SSE un-buffered: ask upstream not to compress, and tell any intermediary not to buffer.
            proxy.on("proxyReq", (req) => req.setHeader("accept-encoding", "identity"));
            proxy.on("proxyRes", (res) => {
              if (String(res.headers["content-type"] ?? "").startsWith("text/event-stream")) {
                res.headers["cache-control"] = "no-cache, no-transform";
                res.headers["x-accel-buffering"] = "no";
              }
            });
          },
        },
      },
    },
    build: {
      // The lazily loaded elkjs chunk is large by nature; everything else is well under the default.
      chunkSizeWarningLimit: 1600,
    },
    test: {
      environment: "jsdom",
      include: ["src/**/*.test.{ts,tsx}"],
    },
  };
});
