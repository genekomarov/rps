/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "docs",
    emptyOutDir: true,
  },
  test: {
    environment: "node",
    setupFiles: ["./src/test/setup.js"],
    include: ["src/**/*.test.js"],
  },
});
