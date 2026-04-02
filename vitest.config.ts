import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    include: ["**/*.test.{ts,tsx}"],
    environmentMatchGlobs: [
      // Component tests run in jsdom
      ["app/browse/**/*.test.tsx", "jsdom"],
      ["components/**/*.test.tsx", "jsdom"],
      // Everything else stays in node
      ["**/*.test.ts", "node"],
    ],
    setupFiles: ["./vitest.setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
