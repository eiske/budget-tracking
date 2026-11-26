import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";
import { spawnSync } from "node:child_process";

// `npm run db:reset [-- --yes] [-- --no-backup]` deletes the database and rebuilds it (migrate + seed).
// It DESTROYS all data, so it asks for confirmation and writes a backup first.
const dbPath = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "app.db");
const args = process.argv.slice(2);
const skipConfirm = args.includes("--yes");
const skipBackup = args.includes("--no-backup");

function run(script: string) {
  const res = spawnSync("npm", ["run", "--silent", script], { stdio: "inherit" });
  if (res.status !== 0) {
    console.error(`"npm run ${script}" failed; aborting.`);
    process.exit(res.status ?? 1);
  }
}

async function confirm() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(`This will DELETE all data in ${dbPath}. Type "reset" to continue: `);
  rl.close();
  return answer.trim() === "reset";
}

async function main() {
  if (!skipConfirm && !(await confirm())) {
    console.log("Cancelled. Nothing was changed.");
    return;
  }

  // Back up first (only if a database exists); a failed backup stops the reset.
  if (!skipBackup && fs.existsSync(dbPath)) run("db:backup");

  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(`${dbPath}${suffix}`, { force: true });
  console.log(`Database deleted: ${dbPath}`);

  run("db:setup");
  console.log("Database reset.");
}

main().catch((e: unknown) => {
  console.error("Reset failed:", e instanceof Error ? e.message : e);
  process.exit(1);
});
