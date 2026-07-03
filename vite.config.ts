/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "P2P Игры",
        short_name: "P2P Игры",
        description: "Локальные P2P-игры без сервера",
        theme_color: "#111827",
        background_color: "#f3f5fa",
        display: "standalone",
        start_url: "./",
        scope: "./",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        cleanupOutdatedCaches: true,
        navigateFallback: "index.html",
      },
    }),
  ],
  build: {
    outDir: "docs",
    emptyOutDir: true,
  },
  test: {
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.ts"],
  },
});
