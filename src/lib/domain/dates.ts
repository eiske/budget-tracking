const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** True only for real calendar dates in YYYY-MM-DD form (rejects 2026-02-30). */
export function isValidDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function isValidMonth(value: string): boolean {
  return MONTH_RE.test(value);
}

/** Local-time YYYY-MM-DD (not UTC, so "today" matches the user's calendar). */
export function todayString(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function currentMonth(now: Date = new Date()): string {
  return todayString(now).slice(0, 7);
}

/** First and last day strings of a YYYY-MM month, usable for inclusive string comparison. */
export function monthRange(month: string): { start: string; end: string } {
  return { start: `${month}-01`, end: `${month}-31` };
}
