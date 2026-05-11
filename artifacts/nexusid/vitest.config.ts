import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

// Component tests for the nexusid web app. Backend / API contract tests
// live in `artifacts/api-server` (see `routes/ghost-mode.test.ts`); this
// suite exercises the React layer in isolation with jsdom + RTL so we
// can lock in UX contracts (e.g. Ghost Mode toggle behavior, anonymous
// post rendering) without the full e2e harness.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
