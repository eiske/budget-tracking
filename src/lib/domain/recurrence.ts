import { daysInMonth } from "./dates";

export type RuleLike = {
  id: number;
  dayOfMonth: number; // 1-31
  startDate: string; // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD, null = open ended
};

/** The date a rule falls on in `month` (YYYY-MM). Day 31 in a 30-day month becomes the 30th. */
export function occurrenceDate(month: string, dayOfMonth: number): string {
  const [y, m] = month.split("-").map(Number);
  const day = Math.min(dayOfMonth, daysInMonth(y, m));
  return `${month}-${String(day).padStart(2, "0")}`;
}

/**
 * A rule is due in `month` when its occurrence date lies within [startDate, endDate].
 * So a rule starting Nov 20 with day 5 first fires on Dec 5, not on Nov 5 (before it started).
 */
export function isRuleDue(rule: RuleLike, month: string): boolean {
  const date = occurrenceDate(month, rule.dayOfMonth);
  return date >= rule.startDate && (rule.endDate === null || date <= rule.endDate);
}

/** Rules that should have an entry in `month`, minus those whose entry the user deliberately deleted. */
export function dueRules<T extends RuleLike>(rules: T[], month: string, skippedRuleIds: Set<number>): T[] {
  return rules.filter((r) => !skippedRuleIds.has(r.id) && isRuleDue(r, month));
}

export type RuleStatus = "active" | "upcoming" | "ended";

/** Display status relative to `month`: ended before it, starting after it, or in effect. */
export function ruleStatus(rule: Pick<RuleLike, "startDate" | "endDate">, month: string): RuleStatus {
  if (rule.endDate !== null && rule.endDate < `${month}-01`) return "ended";
  if (rule.startDate > `${month}-31`) return "upcoming";
  return "active";
}
