import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: `npm run dev` serves on :5173 and proxies /api to the Express API on :4000.
// Prod: `npm run build` writes web/dist, which api/src/server.js serves at "/".
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { port: 5173, proxy: { "/api": process.env.VITE_API_PROXY || "http://localhost:4000" } },
  build: { outDir: "dist", chunkSizeWarningLimit: 700 },
  test: { environment: "jsdom", globals: true, setupFiles: ["./test/setup.js"], css: false },
});
