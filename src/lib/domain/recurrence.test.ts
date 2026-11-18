import { describe, expect, it } from "vitest";
import { dueRules, isRuleDue, occurrenceDate, ruleStatus, type RuleLike } from "./recurrence";
import { parseRecurringForm } from "./recurring-input";

const rule = (over: Partial<RuleLike> = {}): RuleLike => ({
  id: 1, dayOfMonth: 5, startDate: "2026-01-01", endDate: null, ...over,
});

describe("occurrenceDate", () => {
  it("clamps the day to the month length", () => {
    expect(occurrenceDate("2026-11", 5)).toBe("2026-11-05");
    expect(occurrenceDate("2026-04", 31)).toBe("2026-04-30");
    expect(occurrenceDate("2026-02", 31)).toBe("2026-02-28");
    expect(occurrenceDate("2028-02", 30)).toBe("2028-02-29");
    expect(occurrenceDate("2026-12", 31)).toBe("2026-12-31");
  });
});

describe("isRuleDue", () => {
  it("is due in any month between start and end", () => {
    expect(isRuleDue(rule(), "2026-11")).toBe(true);
    expect(isRuleDue(rule({ startDate: "2026-01-01" }), "2030-06")).toBe(true);
  });

  it("is not due before it starts", () => {
    expect(isRuleDue(rule({ startDate: "2026-12-01" }), "2026-11")).toBe(false);
  });

  it("skips the start month when its occurrence falls before the start date", () => {
    const r = rule({ dayOfMonth: 5, startDate: "2026-11-20" });
    expect(isRuleDue(r, "2026-11")).toBe(false); // Nov 5 < Nov 20
    expect(isRuleDue(r, "2026-12")).toBe(true);
  });

  it("includes the exact start and end dates", () => {
    expect(isRuleDue(rule({ dayOfMonth: 20, startDate: "2026-11-20" }), "2026-11")).toBe(true);
    expect(isRuleDue(rule({ dayOfMonth: 5, endDate: "2026-12-05" }), "2026-12")).toBe(true);
  });

  it("is not due once its occurrence passes the end date", () => {
    const r = rule({ dayOfMonth: 5, endDate: "2026-12-04" });
    expect(isRuleDue(r, "2026-12")).toBe(false);
    expect(isRuleDue(r, "2026-11")).toBe(true);
    expect(isRuleDue(r, "2027-01")).toBe(false);
  });
});

describe("dueRules", () => {
  it("filters by due-ness and by deliberately skipped rule ids", () => {
    const rules = [rule({ id: 1 }), rule({ id: 2 }), rule({ id: 3, startDate: "2027-01-01" })];
    expect(dueRules(rules, "2026-11", new Set()).map((r) => r.id)).toEqual([1, 2]);
    expect(dueRules(rules, "2026-11", new Set([2])).map((r) => r.id)).toEqual([1]);
  });
});

describe("ruleStatus", () => {
  it("classifies relative to a month", () => {
    expect(ruleStatus({ startDate: "2026-01-01", endDate: null }, "2026-11")).toBe("active");
    expect(ruleStatus({ startDate: "2026-12-01", endDate: null }, "2026-11")).toBe("upcoming");
    expect(ruleStatus({ startDate: "2026-01-01", endDate: "2026-10-31" }, "2026-11")).toBe("ended");
    expect(ruleStatus({ startDate: "2026-01-01", endDate: "2026-11-01" }, "2026-11")).toBe("active");
  });
});

describe("parseRecurringForm", () => {
  const valid = {
    description: " Rent ", amount: "1.800,00", categoryId: "4", dayOfMonth: "5", startDate: "2026-11-01", endDate: "",
  };

  it("normalizes valid input and turns a blank end date into null", () => {
    expect(parseRecurringForm(valid)).toEqual({
      ok: true,
      data: { description: "Rent", amountCents: 180000, categoryId: 4, dayOfMonth: 5, startDate: "2026-11-01", endDate: null },
    });
  });

  it("keeps a valid end date", () => {
    const r = parseRecurringForm({ ...valid, endDate: "2027-06-30" });
    expect(r.ok && r.data.endDate).toBe("2027-06-30");
  });

  it("rejects an end date before the start date, but allows the same day", () => {
    const bad = parseRecurringForm({ ...valid, endDate: "2026-10-31" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors)).toEqual(["endDate"]);
    expect(parseRecurringForm({ ...valid, endDate: "2026-11-01" }).ok).toBe(true);
  });

  it.each(["0", "32", "-1", "1.5", "abc", ""])("rejects day of month %j", (d) => {
    const r = parseRecurringForm({ ...valid, dayOfMonth: d });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.dayOfMonth).toBe("Enter a day from 1 to 31.");
  });

  it("accepts the boundary days 1 and 31", () => {
    expect(parseRecurringForm({ ...valid, dayOfMonth: "1" }).ok).toBe(true);
    expect(parseRecurringForm({ ...valid, dayOfMonth: "31" }).ok).toBe(true);
  });

  it("reports an error per bad field and never throws on empty input", () => {
    const r = parseRecurringForm({});
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["amount", "categoryId", "dayOfMonth", "description", "startDate"]);
  });

  it("rejects an impossible end date", () => {
    const r = parseRecurringForm({ ...valid, endDate: "2026-02-30" });
    expect(r.ok).toBe(false);
  });
});
