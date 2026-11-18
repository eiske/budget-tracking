import fs from "node:fs";
import path from "node:path";
import { backupFileName } from "../lib/backup-name";

// `npm run db:backup [dir]` writes a timestamped copy (default ./backups). Safe while the app runs.
async function main() {
  // Check BEFORE opening the database: opening it (client.ts) would create an empty file, and an
  // empty new database must not be passed off as a backup.
  const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");
  if (!fs.existsSync(dbPath)) {
    console.error(`No database at ${dbPath}; nothing to back up.`);
    process.exit(1);
  }

  const { sqlite } = await import("./client");
  const dir = path.resolve(process.argv[2] ?? "backups");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const dest = path.join(dir, backupFileName());
  try {
    await sqlite.backup(dest);
    console.log(`Backup written to ${dest}`);
  } finally {
    sqlite.close();
  }
}

main().catch((e: unknown) => {
  console.error("Backup failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
