import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "."),
      "react-native": "react-native-web",
    },
    extensions: [".web.tsx", ".web.ts", ".web.jsx", ".web.js", ".tsx", ".ts", ".jsx", ".js"],
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["**/*.test.tsx", "**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**", ".expo/**"],
    setupFiles: ["./test/setup.ts"],
    css: false,
  },
});
