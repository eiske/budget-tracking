import { expect, test } from "@playwright/test";
import { addTransaction, byLabel, byText, query, tag } from "./helpers";

// Fixed far-future dates so these rows never touch the current month's totals.
test.describe("installments", () => {
  test("splits the total exactly and keeps the day-of-month across short months", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    const description = `Laptop ${tag()}`;
    await addTransaction(page, { date: "2030-01-31", amount: "100,00", description, category: "Shopping", installments: "3" });
    await expect(page).toHaveURL(/\/transactions$/);

    const rows = query<{ date: string; amount_cents: number; installment_number: number; installment_total: number; installment_group_id: string }>(
      "select date, amount_cents, installment_number, installment_total, installment_group_id from transactions where description = ? order by installment_number",
      description,
    );
    expect(rows.map((r) => r.amount_cents)).toEqual([3334, 3333, 3333]); // sums to exactly 100.00
    expect(rows.map((r) => r.date)).toEqual(["2030-01-31", "2030-02-28", "2030-03-31"]); // 28 in Feb, back to 31 in Mar
    expect(new Set(rows.map((r) => r.installment_group_id)).size).toBe(1);
    expect(rows.every((r) => r.installment_total === 3)).toBe(true);

    await page.goto("/transactions?month=2030-02");
    const row = page.getByRole("row", { name: new RegExp(description) });
    await expect(row).toContainText("2/3");
    await expect(row).toContainText("R$33.33");

    await row.getByRole("button", { name: "Delete all" }).click();
    await expect(row).toHaveCount(0);
    expect(query("select 1 from transactions where description = ?", description)).toHaveLength(0);
  });

  test("rejects a plan the amount cannot cover, and a non-integer count", async ({ page }) => {
    const before = query<{ n: number }>("select count(*) n from transactions")[0].n;

    await addTransaction(page, { date: "2030-01-10", amount: "0.05", description: "Too small", category: "Shopping", installments: "6" });
    await expect(byText(page, /too small to split/)).toBeVisible();

    await addTransaction(page, { date: "2030-01-10", amount: "10", description: "Bad count", category: "Shopping", installments: "1e1" });
    await expect(byText(page, /whole number of installments/)).toBeVisible();

    expect(query<{ n: number }>("select count(*) n from transactions")[0].n).toBe(before);
  });

  test("an installment can be edited on its own", async ({ page }) => {
    const description = `Phone ${tag()}`;
    await addTransaction(page, { date: "2030-05-15", amount: "90", description, category: "Shopping", installments: "3" });
    await page.goto("/transactions?month=2030-06");
    await page.getByRole("row", { name: new RegExp(description) }).getByRole("link", { name: "Edit" }).click();
    await expect(byText(page, /Installment 2 of 3/)).toBeVisible();
    await expect(page.locator('input[name="installments"]').filter({ visible: true })).toHaveCount(0);
    await byLabel(page, "Amount", true).fill("40");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(/\/transactions$/); // the save has finished before we read the database

    const amounts = query<{ a: number }>("select amount_cents a from transactions where description = ? order by installment_number", description).map((r) => r.a);
    expect(amounts).toEqual([3000, 4000, 3000]);
  });
});
