import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// One self-contained index.html: served by `lab ui`, or exported with data baked in.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss(), viteSingleFile()],
  // `@/...` is the shadcn convention (e.g. `@/components/ui/button`, `@/lib/utils`).
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  build: { outDir: "dist", emptyOutDir: true, assetsInlineLimit: 100_000_000 },
  server: { proxy: { "/api": "http://127.0.0.1:4320", "/files": "http://127.0.0.1:4320" } },
});
