import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// The admin UI lives under /_/ on every domain, so files are emitted into
// dist/ui/_/ and the worker serves them through the ASSETS binding.
export default defineConfig({
  root: "src/ui",
  base: "/_/",
  plugins: [preact()],
  build: { outDir: "../../dist/ui/_", emptyOutDir: true },
  server: { proxy: { "/_/api": "http://localhost:8787" } },
});
