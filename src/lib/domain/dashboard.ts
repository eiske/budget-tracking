export type DeltaTone = "good" | "bad" | "neutral";

export type Delta = {
  /** Whole-number percent change, or null when there is no baseline to compare with. */
  percent: number | null;
  direction: "up" | "down" | "flat";
  /** Direction x whether up is good: spending up is "bad", income up is "good". */
  tone: DeltaTone;
};

/**
 * Compares `current` with `previous` (both in cents). With no baseline (previous = 0) the
 * percent is null: "+∞%" would be noise, so the UI shows "new" or nothing instead.
 */
export function describeDelta(current: number, previous: number, upIsGood: boolean): Delta {
  if (current === previous) return { percent: previous === 0 ? null : 0, direction: "flat", tone: "neutral" };
  const direction = current > previous ? "up" : "down";
  const good = (direction === "up") === upIsGood;
  const percent = previous === 0 ? null : Math.round((Math.abs(current - previous) / previous) * 100);
  return { percent, direction, tone: good ? "good" : "bad" };
}

export type BreakdownRow = { id: number | null; name: string; totalCents: number };

/**
 * Keeps the largest `max - 1` rows and folds the rest into one "Other" row, so the ranked bars
 * never grow past `max` rows. Input must already be sorted largest first.
 */
export function foldTail(rows: BreakdownRow[], max: number): BreakdownRow[] {
  if (rows.length <= max) return rows;
  const head = rows.slice(0, max - 1);
  const tail = rows.slice(max - 1);
  const total = tail.reduce((sum, r) => sum + r.totalCents, 0);
  return [...head, { id: null, name: `Other (${tail.length} categories)`, totalCents: total }];
}

/** Share of `part` in `whole` as a whole-number percent (0 when whole is 0). */
export function sharePercent(part: number, whole: number): number {
  return whole === 0 ? 0 : Math.round((part / whole) * 100);
}
