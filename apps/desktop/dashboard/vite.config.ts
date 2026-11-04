import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// One self-contained index.html: served by `lab ui`, or exported with data baked in.
//
// No code splitting, on purpose. The server answers /app with this one HTML string and has no
// route for chunk files, and an exported snapshot has to open from disk as a single file with its
// data baked in. viteSingleFile also inlines dynamic imports, so React.lazy here would produce
// the same single bundle with no load-time saving. Splitting views needs the server to serve
// hashed /app/assets/* first, and the snapshot export to keep a single-file build of its own.
export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), tailwindcss(), viteSingleFile()],
  build: { outDir: "dist", emptyOutDir: true, assetsInlineLimit: 100_000_000 },
  server: { proxy: { "/api": "http://127.0.0.1:4320", "/files": "http://127.0.0.1:4320" } },
});
