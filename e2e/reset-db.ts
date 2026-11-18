import fs from "node:fs";
import path from "node:path";

// Recreates the E2E database from scratch. It must NEVER touch a real database, so it refuses to
// delete anything outside e2e/.tmp, whatever DATABASE_PATH says.
const raw = process.env.DATABASE_PATH;
const allowedDir = path.join(process.cwd(), "e2e", ".tmp");

if (!raw || path.dirname(path.resolve(raw)) !== allowedDir) {
  console.error(`Refusing to reset "${raw ?? "(unset)"}": the E2E database must live in ${allowedDir}`);
  process.exit(1);
}

fs.mkdirSync(allowedDir, { recursive: true });
for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${raw}${suffix}`, { force: true });
console.log(`E2E database reset: ${raw}`);
