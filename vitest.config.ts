import { defineConfig } from "vitest/config";

export default defineConfig({
  // Unit tests only. Playwright specs under e2e/ run with `npm run test:e2e`.
  test: { include: ["src/**/*.test.ts"], exclude: ["node_modules/**", "e2e/**", ".next*/**"] },
});
