import { describe, expect, it } from "vitest";
import { describeDelta, foldTail, sharePercent, type BreakdownRow } from "./dashboard";
import { addMonths, lastMonths, monthLabel } from "./months";

describe("months", () => {
  it("adds months across year boundaries", () => {
    expect(addMonths("2026-11", 1)).toBe("2026-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-03", -15)).toBe("2024-12");
    expect(addMonths("2026-06", 0)).toBe("2026-06");
  });

  it("lists the last n months oldest first, including the end month", () => {
    expect(lastMonths("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
    expect(lastMonths("2026-11", 1)).toEqual(["2026-11"]);
  });

  it("formats labels in UTC (no off-by-one near month edges)", () => {
    expect(monthLabel("2026-11", "en-US")).toBe("November 2026");
    expect(monthLabel("2026-01", "en-US", "short")).toBe("Jan");
  });
});

describe("describeDelta", () => {
  it("spending up is bad, spending down is good", () => {
    expect(describeDelta(150, 100, false)).toEqual({ percent: 50, direction: "up", tone: "bad" });
    expect(describeDelta(50, 100, false)).toEqual({ percent: 50, direction: "down", tone: "good" });
  });

  it("income up is good, income down is bad", () => {
    expect(describeDelta(120, 100, true)).toEqual({ percent: 20, direction: "up", tone: "good" });
    expect(describeDelta(80, 100, true)).toEqual({ percent: 20, direction: "down", tone: "bad" });
  });

  it("has no percent when there is no baseline", () => {
    expect(describeDelta(500, 0, false)).toEqual({ percent: null, direction: "up", tone: "bad" });
    expect(describeDelta(0, 0, false)).toEqual({ percent: null, direction: "flat", tone: "neutral" });
  });

  it("treats equal values as flat/neutral", () => {
    expect(describeDelta(100, 100, false)).toEqual({ percent: 0, direction: "flat", tone: "neutral" });
  });

  it("rounds to whole percent", () => {
    expect(describeDelta(1003, 1000, false).percent).toBe(0);
    expect(describeDelta(1006, 1000, false).percent).toBe(1);
  });
});

describe("foldTail", () => {
  const rows = (n: number): BreakdownRow[] =>
    Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `C${i + 1}`, totalCents: (n - i) * 100 }));

  it("leaves short lists untouched", () => {
    expect(foldTail(rows(5), 8)).toEqual(rows(5));
    expect(foldTail(rows(8), 8)).toHaveLength(8);
  });

  it("folds everything past max-1 into one Other row, preserving the total", () => {
    const input = rows(11);
    const out = foldTail(input, 8);
    expect(out).toHaveLength(8);
    expect(out.slice(0, 7)).toEqual(input.slice(0, 7));
    expect(out[7]).toEqual({
      id: null,
      name: "Other (4 categories)",
      totalCents: input.slice(7).reduce((s, r) => s + r.totalCents, 0),
    });
    expect(out.reduce((s, r) => s + r.totalCents, 0)).toBe(input.reduce((s, r) => s + r.totalCents, 0));
  });
});

describe("sharePercent", () => {
  it("computes shares and guards against division by zero", () => {
    expect(sharePercent(25, 100)).toBe(25);
    expect(sharePercent(1, 3)).toBe(33);
    expect(sharePercent(5, 0)).toBe(0);
  });
});
