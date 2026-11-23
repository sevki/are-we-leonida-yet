import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// `pnpm dev:web` serves the UI with HMR and proxies the worker (run `pnpm dev` alongside it).
export default defineConfig({
  root: "web",
  // The same version string is baked into the page (here) and into the worker (`wrangler deploy --var APP_VERSION`),
  // so a page can tell when the worker it talks to is newer than the bundle it is running.
  define: { __APP_VERSION__: JSON.stringify(process.env.APP_VERSION ?? "dev") },
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": resolve(import.meta.dirname, "web/src") } },
  build: { outDir: "../public", emptyOutDir: true },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
      "/ws": { target: "ws://localhost:8787", ws: true },
    },
  },
});
