import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: { index: resolve(import.meta.dirname, "index.html"), universe: resolve(import.meta.dirname, "universe.html") },
    },
  },
});
