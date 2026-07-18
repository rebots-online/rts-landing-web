import { defineConfig } from "vite";

export default defineConfig({
  base: "/",
  build: {
    outDir: "dist",
    sourcemap: true,
    assetsInlineLimit: 4096
  }
});
