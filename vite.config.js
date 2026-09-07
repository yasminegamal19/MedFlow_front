import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backend = env.VITE_BACKEND_ORIGIN || "http://localhost:8010";

  return {
    plugins: [react()],
    server: {
      port: 5173,
      open: true,
      // Proxy API calls to the Laravel backend so the browser never makes a
      // cross-origin request in dev (no CORS preflight to configure).
      proxy: {
        "/api": { target: backend, changeOrigin: true },
      },
    },
  };
});
