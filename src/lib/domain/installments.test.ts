import { describe, expect, it } from "vitest";
import { buildInstallments, installmentDate, splitAmount } from "./installments";

describe("splitAmount", () => {
  it("gives leftover cents to the first installments", () => {
    expect(splitAmount(10000, 3)).toEqual([3334, 3333, 3333]);
    expect(splitAmount(10001, 3)).toEqual([3334, 3334, 3333]);
    expect(splitAmount(9999, 3)).toEqual([3333, 3333, 3333]);
  });

  it("handles a single installment and one cent each", () => {
    expect(splitAmount(1234, 1)).toEqual([1234]);
    expect(splitAmount(5, 5)).toEqual([1, 1, 1, 1, 1]);
  });

  it("always sums exactly to the total, with parts differing by at most one cent", () => {
    for (let count = 1; count <= 60; count++) {
      for (const total of [count, count + 1, 99, 100, 1999, 100000, 123457, 99999999]) {
        if (total < count) continue;
        const parts = splitAmount(total, count);
        expect(parts).toHaveLength(count);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
        expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
        expect(Math.min(...parts)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it.each([
    [4, 5], // fewer cents than installments
    [100, 0],
    [100, -1],
    [100, 1.5],
    [10.5, 2],
  ])("rejects total=%s count=%s", (total, count) => {
    expect(() => splitAmount(total, count)).toThrow(RangeError);
  });
});

describe("installmentDate", () => {
  it("keeps the same day in ordinary months and crosses year ends", () => {
    expect(installmentDate("2026-03-15", 0)).toBe("2026-03-15");
    expect(installmentDate("2026-03-15", 1)).toBe("2026-04-15");
    expect(installmentDate("2026-11-15", 2)).toBe("2027-01-15");
    expect(installmentDate("2026-12-01", 1)).toBe("2027-01-01");
  });

  it("clamps to month length but re-expands from the ORIGINAL day (no drift)", () => {
    expect(installmentDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(installmentDate("2026-01-31", 2)).toBe("2026-03-31"); // not 03-28
    expect(installmentDate("2026-01-31", 3)).toBe("2026-04-30");
    expect(installmentDate("2026-08-31", 1)).toBe("2026-09-30");
  });

  it("handles leap years", () => {
    expect(installmentDate("2028-01-31", 1)).toBe("2028-02-29");
    expect(installmentDate("2027-01-31", 1)).toBe("2027-02-28");
    expect(installmentDate("2024-02-29", 12)).toBe("2025-02-28");
    expect(installmentDate("2024-02-29", 48)).toBe("2028-02-29");
  });

  it("works across many years", () => {
    expect(installmentDate("2026-06-10", 60)).toBe("2031-06-10");
  });
});

describe("buildInstallments", () => {
  it("numbers from 1, spaces monthly, and sums to the total", () => {
    const parts = buildInstallments("2026-01-31", 10000, 3);
    expect(parts).toEqual([
      { number: 1, date: "2026-01-31", amountCents: 3334 },
      { number: 2, date: "2026-02-28", amountCents: 3333 },
      { number: 3, date: "2026-03-31", amountCents: 3333 },
    ]);
    expect(parts.reduce((s, p) => s + p.amountCents, 0)).toBe(10000);
  });

  it("a single installment is just the purchase", () => {
    expect(buildInstallments("2026-11-18", 5000, 1)).toEqual([{ number: 1, date: "2026-11-18", amountCents: 5000 }]);
  });
});
