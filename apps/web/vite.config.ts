import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

// The marketing site: a static React build in dist/web, served as-is by Vercel.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  build: { outDir: resolve(import.meta.dirname, "../../dist/web"), emptyOutDir: true },
  server: { port: 4330 },
  preview: { port: 4330 },
});
