import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { sqlite } from "@/db/client";

/**
 * A consistent copy of the whole database as bytes. Uses SQLite's online backup API, which is safe
 * while the app is writing (a plain file copy could catch a half-written WAL). The snapshot is
 * staged in a private temp directory (mode 0700) and removed even if something fails.
 */
export async function snapshotBuffer(): Promise<Buffer> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "budget-tracking-backup-"));
  try {
    const file = path.join(dir, "snapshot.db");
    await sqlite.backup(file);
    return await readFile(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
