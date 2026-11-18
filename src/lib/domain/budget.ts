export const WARNING_THRESHOLD_PERCENT = 80;

export type BudgetState = "ok" | "warning" | "over";

export type BudgetStatus = {
  state: BudgetState;
  /** Whole percent used, rounded DOWN so "100%" is only shown once the limit is truly reached. */
  percent: number;
  /** limit - spent; negative when over. */
  remainingCents: number;
  /** Share of the bar to fill, 0-100 (capped: an overspent bar is full, not wider than its track). */
  fillPercent: number;
};

/**
 * Status of one category budget. All comparisons use integer math (no float drift at the
 * 80% / 100% boundaries). `limitCents` must be positive.
 */
export function budgetStatus(spentCents: number, limitCents: number): BudgetStatus {
  if (!Number.isInteger(spentCents) || !Number.isInteger(limitCents) || limitCents <= 0) {
    throw new RangeError("budgetStatus needs integer cents and a positive limit");
  }
  const state: BudgetState =
    spentCents >= limitCents ? "over" : spentCents * 100 >= limitCents * WARNING_THRESHOLD_PERCENT ? "warning" : "ok";
  const percent = Math.floor((spentCents * 100) / limitCents);
  return {
    state,
    percent,
    remainingCents: limitCents - spentCents,
    fillPercent: Math.min(percent, 100),
  };
}

export type BudgetLine = {
  id: number;
  categoryId: number;
  name: string;
  limitCents: number;
  spentCents: number;
  status: BudgetStatus;
};

/** Most-used budgets first, so alerts surface at the top. Ties broken by name for a stable order. */
export function sortByUsage(lines: BudgetLine[]): BudgetLine[] {
  return [...lines].sort(
    (a, b) => b.status.percent - a.status.percent || a.name.localeCompare(b.name),
  );
}
