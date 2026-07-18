import { defineConfig } from "vite";

export default defineConfig({
  base: process.env.GITHUB_ACTIONS ? "/rts-landing-web/" : "/",
  build: {
    outDir: "dist",
    sourcemap: true,
    assetsInlineLimit: 4096
  }
});
