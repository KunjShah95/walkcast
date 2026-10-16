import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// One self-contained index.html: served by `lab ui`, or exported with data baked in.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: { outDir: "dist", emptyOutDir: true, assetsInlineLimit: 100_000_000 },
  server: { proxy: { "/api": "http://127.0.0.1:4320", "/files": "http://127.0.0.1:4320" } },
});
