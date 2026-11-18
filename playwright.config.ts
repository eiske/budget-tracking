import path from "node:path";
import { defineConfig } from "@playwright/test";

const PORT = 3100;
const dbPath = path.join(process.cwd(), "e2e", ".tmp", "e2e.db");
process.env.E2E_DATABASE_PATH = dbPath; // specs read this to inspect what the app wrote

/**
 * The suite starts its own production build on port 3100 with a throwaway database, in its own
 * build directory, so it can run next to `npm run dev` without touching your data or your cache.
 * Set PLAYWRIGHT_CHROMIUM_PATH to use a browser you already have instead of `npx playwright install`.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  workers: 1, // specs share one database and run in file order
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: `npx tsx e2e/reset-db.ts && npm run db:setup && npm run build && npm run start -- -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    env: { ...(process.env as Record<string, string>), DATABASE_PATH: dbPath, NEXT_DIST_DIR: ".next-e2e" },
    // Dev convenience: E2E_REUSE_SERVER=1 reuses a server you started yourself (data then persists).
    reuseExistingServer: Boolean(process.env.E2E_REUSE_SERVER),
    timeout: 240_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
