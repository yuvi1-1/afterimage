import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "dist", chunkSizeWarningLimit: 1500 },
  // `npm run api` serves the payment endpoints locally; the dev server forwards /api to it.
  server: { proxy: { "/api": "http://localhost:8787" } },
});
