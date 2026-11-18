import { describe, expect, it } from "vitest";
import { currentMonth, isValidDate, isValidMonth, monthFromParam, todayString } from "./dates";
import { centsToInputValue, formatCents, parseAmountToCents } from "./money";
import { parseTransactionForm } from "./transaction-input";

describe("parseAmountToCents", () => {
  it.each([
    ["12", 1200],
    ["12.5", 1250],
    ["12,50", 1250],
    ["0.99", 99],
    ["1.234,56", 123456],
    ["1,234.56", 123456],
    ["R$ 1 234,56", 123456],
    ["1.234", 123400], // single separator + 3 digits = thousands
    ["1,234", 123400],
    ["1.234.567", 123456700],
  ])("parses %s -> %d", (input, cents) => {
    expect(parseAmountToCents(input)).toBe(cents);
  });

  it.each([
    "", "abc", "0", "0,00", "-5", "12.345,678",
    "1,2,3,4x", "1,2,3,4", "1.2.3", "12abc", "1.234,56,7", "1.234.5",
  ])(
    "rejects %j",
    (input) => {
      expect(parseAmountToCents(input)).toBeNull();
    },
  );

  it("avoids floating-point drift (19.99 * 100 !== 1999 in JS floats)", () => {
    expect(19.99 * 100).not.toBe(1999);
    expect(parseAmountToCents("19.99")).toBe(1999);
  });
});

describe("money formatting", () => {
  it("formats cents with Intl", () => {
    expect(formatCents(123456, "USD", "en-US")).toBe("$1,234.56");
  });
  it("round-trips to an input value", () => {
    expect(centsToInputValue(1250)).toBe("12.50");
    expect(parseAmountToCents(centsToInputValue(123456))).toBe(123456);
  });
});

describe("dates", () => {
  it("accepts real dates, including leap day", () => {
    expect(isValidDate("2026-11-18")).toBe(true);
    expect(isValidDate("2028-02-29")).toBe(true);
  });
  it.each(["2026-02-30", "2027-02-29", "2026-13-01", "2026-1-1", "", "18/11/2026"])(
    "rejects %j",
    (v) => expect(isValidDate(v)).toBe(false),
  );
  it("validates months", () => {
    expect(isValidMonth("2026-11")).toBe(true);
    expect(isValidMonth("2026-00")).toBe(false);
    expect(isValidMonth("2026-13")).toBe(false);
  });
  it("uses local time for today", () => {
    const d = new Date(2026, 0, 5, 23, 59); // local Jan 5
    expect(todayString(d)).toBe("2026-01-05");
    expect(currentMonth(d)).toBe("2026-01");
  });
});

describe("parseTransactionForm", () => {
  const valid = { date: "2026-11-18", amount: "12,50", description: "  Coffee ", categoryId: "3" };

  it("returns normalized data", () => {
    expect(parseTransactionForm(valid)).toEqual({
      ok: true,
      data: { date: "2026-11-18", amountCents: 1250, description: "Coffee", categoryId: 3, installments: 1 },
    });
  });

  it("reports one error per invalid field", () => {
    const r = parseTransactionForm({ date: "nope", amount: "0", description: " ", categoryId: "" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors).sort()).toEqual(["amount", "categoryId", "date", "description"]);
  });

  it("handles missing fields without throwing", () => {
    expect(parseTransactionForm({}).ok).toBe(false);
  });

  it("treats a blank installments field as a single payment", () => {
    const r = parseTransactionForm({ ...valid, installments: "" });
    expect(r.ok && r.data.installments).toBe(1);
  });

  it("accepts installments and keeps the total amount", () => {
    const r = parseTransactionForm({ ...valid, amount: "300", installments: "3" });
    expect(r).toMatchObject({ ok: true, data: { amountCents: 30000, installments: 3 } });
  });

  it.each(["0", "-2", "1.5", "abc", "61", "0x10", "1e1"])("rejects installments %j", (n) => {
    const r = parseTransactionForm({ ...valid, installments: n });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(Object.keys(r.errors)).toEqual(["installments"]);
  });

  it("rejects a total too small to give every installment a cent", () => {
    const r = parseTransactionForm({ ...valid, amount: "0.05", installments: "6" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.installments).toMatch(/too small/);
    expect(parseTransactionForm({ ...valid, amount: "0.06", installments: "6" }).ok).toBe(true);
  });
});

describe("monthFromParam", () => {
  it("accepts a valid month and falls back otherwise", () => {
    expect(monthFromParam("2026-03", "2026-11")).toBe("2026-03");
    for (const bad of [undefined, "", "2026-13", "garbage", "2026-3", "2026-03-01"]) {
      expect(monthFromParam(bad, "2026-11")).toBe("2026-11");
    }
  });
});
