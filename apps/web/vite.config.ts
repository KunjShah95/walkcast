import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

// The output folder is overridable so two builds can run at once without emptying each other's
// directory: `npm run web:build` uses dist/web, tests pass their own temp folder.
const outDir = process.env.WEB_OUT ? resolve(process.env.WEB_OUT) : resolve(import.meta.dirname, "../../dist/web");

// The marketing site: a static React build in dist/web, served as-is by Vercel.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react()],
  build: {
    outDir,
    emptyOutDir: true,
    // The framework and the icons change on their own schedule; keeping them in their own files
    // lets a returning visitor's browser reuse them while the copy on the page changes.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return "react";
          if (/[\\/]node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/.test(id)) return "motion";
          if (/[\\/]node_modules[\\/]lucide-react[\\/]/.test(id)) return "icons";
          return;
        },
      },
    },
  },
  server: { port: 4330 },
  preview: { port: 4330 },
});
