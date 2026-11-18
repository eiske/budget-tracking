/** Adds (or subtracts) whole months to a YYYY-MM string. */
export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + delta;
  const year = Math.floor(index / 12);
  const mon = (index % 12 + 12) % 12;
  return `${String(year).padStart(4, "0")}-${String(mon + 1).padStart(2, "0")}`;
}

/** The n months ending at `endMonth` (inclusive), oldest first. */
export function lastMonths(endMonth: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => addMonths(endMonth, i - (n - 1)));
}

/** "November 2026" (long) or "Nov" (short). Formatted in UTC so the month never shifts. */
export function monthLabel(month: string, locale: string, style: "long" | "short" = "long"): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, 1));
  return new Intl.DateTimeFormat(
    locale,
    style === "long"
      ? { month: "long", year: "numeric", timeZone: "UTC" }
      : { month: "short", timeZone: "UTC" },
  ).format(date);
}
