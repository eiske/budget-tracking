/** budget-tracking-2026-11-18-142503.db (local time). No database import here on purpose: the CLI
 *  needs this name before it is allowed to open (and thereby create) the database. */
export function backupFileName(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  const time = `${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
  return `budget-tracking-${date}-${time}.db`;
}
