import { expect, test } from "@playwright/test";
import { addTransaction, byLabel, byText, dashboardSpentCents, query, tag, thisMonth } from "./helpers";

test.describe("transactions", () => {
  test("adding an expense shows it in the list and raises the dashboard total", async ({ page }) => {
    const before = await dashboardSpentCents(page);
    const description = `Weekly shop ${tag()}`;

    await addTransaction(page, { amount: "12.34", description, category: "Groceries" });
    await expect(page).toHaveURL(/\/transactions$/);
    await expect(page.getByRole("row", { name: new RegExp(description) })).toContainText("−R$12.34");

    expect(await dashboardSpentCents(page)).toBe(before + 1234);
  });

  test("rejects invalid input with messages and saves nothing", async ({ page }) => {
    const before = query<{ n: number }>("select count(*) n from transactions")[0].n;
    await page.goto("/transactions/new");
    await byLabel(page, "Amount", true).fill("abc");
    await byLabel(page, "Description", true).fill("   ");
    await byLabel(page, "Category").selectOption({ label: "Groceries" });
    await page.getByRole("button", { name: "Add transaction" }).click();

    await expect(byText(page, /Enter a positive amount/)).toBeVisible();
    await expect(byText(page, "Description is required.")).toBeVisible();
    expect(query<{ n: number }>("select count(*) n from transactions")[0].n).toBe(before);
  });

  test("accepts Brazilian number formats exactly (1.234,56 is 123456 cents)", async ({ page }) => {
    const description = `Formats ${tag()}`;
    await addTransaction(page, { amount: "1.234,56", description, category: "Shopping" });
    await expect(page).toHaveURL(/\/transactions$/);
    expect(query<{ a: number }>("select amount_cents a from transactions where description = ?", description)[0].a).toBe(123456);
  });

  test("edits a transaction and deletes it", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    const description = `Edit me ${tag()}`;
    await addTransaction(page, { amount: "10", description, category: "Shopping" });
    const row = page.getByRole("row", { name: new RegExp(description) });

    await row.getByRole("link", { name: "Edit" }).click();
    await byLabel(page, "Amount", true).fill("25.50");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(row).toContainText("−R$25.50");
    expect(query("select 1 from transactions where description = ?", description)).toHaveLength(1); // edited, not duplicated

    await row.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(row).toHaveCount(0);
    expect(query("select 1 from transactions where description = ?", description)).toHaveLength(0);
  });

  test("filters by search text, and treats % literally", async ({ page }) => {
    const t = tag();
    await addTransaction(page, { amount: "5", description: `Coffee 50% off ${t}`, category: "Shopping" });
    await addTransaction(page, { amount: "6", description: `Tea ${t}`, category: "Shopping" });

    await page.goto(`/transactions?month=${thisMonth()}&q=${encodeURIComponent("50%")}`);
    await expect(page.getByRole("row", { name: new RegExp(`Coffee 50% off ${t}`) })).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(`Tea ${t}`) })).toHaveCount(0);
  });
});
