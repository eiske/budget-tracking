import { describe, expect, it } from "vitest";
import { budgetStatus, sortByUsage, type BudgetLine } from "./budget";

describe("budgetStatus", () => {
  it("is ok below 80%", () => {
    expect(budgetStatus(0, 10000)).toMatchObject({ state: "ok", percent: 0, fillPercent: 0 });
    expect(budgetStatus(7999, 10000)).toMatchObject({ state: "ok", percent: 79 });
  });

  it("warns from exactly 80% up to (not including) 100%", () => {
    expect(budgetStatus(8000, 10000)).toMatchObject({ state: "warning", percent: 80 });
    expect(budgetStatus(9999, 10000)).toMatchObject({ state: "warning", percent: 99 });
  });

  it("is over once the limit is reached, and the bar stays capped at 100%", () => {
    expect(budgetStatus(10000, 10000)).toMatchObject({ state: "over", percent: 100, remainingCents: 0 });
    const over = budgetStatus(15000, 10000);
    expect(over).toMatchObject({ state: "over", percent: 150, remainingCents: -5000, fillPercent: 100 });
  });

  it("never rounds 99.9% up to 100%", () => {
    // 99,999 / 100,000 = 99.999% -> must not read "100%" while still under the limit
    expect(budgetStatus(99999, 100000)).toMatchObject({ state: "warning", percent: 99 });
  });

  it("places the 80% threshold exactly for awkward limits", () => {
    // 80% of 333 = 266.4, so 266 is under and 267 is over the threshold
    expect(budgetStatus(266, 333).state).toBe("ok");
    expect(budgetStatus(267, 333).state).toBe("warning");
    expect(budgetStatus(2, 3).state).toBe("ok"); // 66%
  });

  it("computes the displayed percent without float drift", () => {
    // Divide-first (spent / limit * 100) gives 28 for 29/100 and 56 for 57/100 because
    // 0.29 * 100 === 28.999999999999996. Multiplying first stays exact.
    expect(budgetStatus(29, 100).percent).toBe(29);
    expect(budgetStatus(57, 100).percent).toBe(57);
    expect(budgetStatus(29, 50).percent).toBe(58);
  });

  it("rejects invalid input instead of returning NaN", () => {
    expect(() => budgetStatus(100, 0)).toThrow(RangeError);
    expect(() => budgetStatus(100, -5)).toThrow(RangeError);
    expect(() => budgetStatus(1.5, 100)).toThrow(RangeError);
  });
});

describe("sortByUsage", () => {
  const line = (name: string, spent: number, limit: number): BudgetLine => ({
    id: 1, categoryId: 1, name, limitCents: limit, spentCents: spent, status: budgetStatus(spent, limit),
  });

  it("puts the most-used budgets first and does not mutate the input", () => {
    const input = [line("B", 50, 100), line("A", 120, 100), line("C", 90, 100)];
    const out = sortByUsage(input);
    expect(out.map((l) => l.name)).toEqual(["A", "C", "B"]);
    expect(input.map((l) => l.name)).toEqual(["B", "A", "C"]);
  });

  it("breaks ties by name", () => {
    expect(sortByUsage([line("Zed", 50, 100), line("Amy", 50, 100)]).map((l) => l.name)).toEqual(["Amy", "Zed"]);
  });
});
