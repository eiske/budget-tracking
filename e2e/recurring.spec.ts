import { expect, test } from "@playwright/test";
import { byLabel, byText, query, tag, thisMonth } from "./helpers";

async function addRule(page: import("@playwright/test").Page, o: { description: string; amount: string; category: string; day: string; start: string; end?: string }) {
  await page.goto("/recurring/new");
  await byLabel(page, "Description").fill(o.description);
  await byLabel(page, "Amount per month").fill(o.amount);
  await byLabel(page, "Category").selectOption({ label: o.category });
  await byLabel(page, "Day of the month").fill(o.day);
  await byLabel(page, "Starts").fill(o.start);
  if (o.end) await byLabel(page, /Ends/).fill(o.end);
  await page.getByRole("button", { name: "Add rule" }).click();
  await expect(page).toHaveURL(/\/recurring$/);
}

const entries = (description: string) =>
  query<{ date: string; amount_cents: number; recurring_month: string }>(
    "select date, amount_cents, recurring_month from transactions where description = ? order by date",
    description,
  );

test.describe("recurring rules", () => {
  test("a rule that started years ago creates only THIS month's entry, once", async ({ page }) => {
    const description = `Rent ${tag()}`;
    await addRule(page, { description, amount: "1.800,00", category: "Housing", day: "5", start: "2020-01-01" });

    expect(entries(description)).toHaveLength(1);
    expect(entries(description)[0]).toMatchObject({ amount_cents: 180000, recurring_month: thisMonth() });
    expect(entries(description)[0].date.startsWith(thisMonth())).toBe(true);

    // opening other pages, including past months, never duplicates or backfills
    for (const path of ["/", "/transactions", "/budgets", "/recurring", "/transactions?month=2020-03", "/?month=2020-03"]) await page.goto(path);
    expect(entries(description)).toHaveLength(1);
    await page.goto("/recurring");
    await expect(page.getByRole("row", { name: new RegExp(description) })).toContainText("Created");
  });

  test("day 31 clamps to the last day of a short month", async ({ page }) => {
    const description = `Gym ${tag()}`;
    await addRule(page, { description, amount: "100", category: "Health", day: "31", start: "2020-01-01" });
    const [year, month] = thisMonth().split("-").map(Number);
    const lastDay = new Date(year, month, 0).getDate();
    expect(entries(description)[0].date).toBe(`${thisMonth()}-${String(lastDay).padStart(2, "0")}`);
  });

  test("future, ended and not-yet-due rules create nothing and say why", async ({ page }) => {
    const future = `Future ${tag()}`, ended = `Ended ${tag()}`;
    await addRule(page, { description: future, amount: "10", category: "Other", day: "1", start: "2099-01-01" });
    await addRule(page, { description: ended, amount: "10", category: "Other", day: "1", start: "2020-01-01", end: "2020-12-31" });
    expect(entries(future)).toHaveLength(0);
    expect(entries(ended)).toHaveLength(0);
    await expect(page.getByRole("row", { name: new RegExp(future) })).toContainText("Starts 2099-01-01");
    await expect(page.getByRole("row", { name: new RegExp(ended) })).toContainText("Ended");
  });

  test("deleting a generated entry is respected, and 'Add back' restores it", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    const description = `Streaming ${tag()}`;
    await addRule(page, { description, amount: "29,90", category: "Subscriptions", day: "10", start: "2020-01-01" });
    expect(entries(description)).toHaveLength(1);

    await page.goto(`/transactions?month=${thisMonth()}`);
    const txRow = page.getByRole("row", { name: new RegExp(description) });
    await expect(txRow).toContainText("Recurring");
    await txRow.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(txRow).toHaveCount(0);

    for (const path of ["/", "/transactions", "/recurring", "/budgets"]) await page.goto(path);
    expect(entries(description)).toHaveLength(0); // not recreated

    await page.goto("/recurring");
    const ruleRow = page.getByRole("row", { name: new RegExp(description) });
    await expect(ruleRow).toContainText("Removed");
    await ruleRow.getByRole("button", { name: "Add back" }).click();
    await expect(ruleRow).toContainText("Created");
    expect(entries(description)).toHaveLength(1);
  });

  test("editing a rule leaves this month's entry alone; deleting it keeps the history", async ({ page }) => {
    page.on("dialog", (d) => d.accept());
    const description = `Phone ${tag()}`;
    await addRule(page, { description, amount: "50", category: "Utilities", day: "3", start: "2020-01-01" });

    await page.getByRole("row", { name: new RegExp(description) }).getByRole("link", { name: "Edit" }).click();
    await byLabel(page, "Amount per month").fill("75");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByRole("row", { name: new RegExp(description) })).toContainText("R$75.00");
    expect(entries(description)).toHaveLength(1);
    expect(entries(description)[0].amount_cents).toBe(5000); // already created: unchanged

    await page.getByRole("row", { name: new RegExp(description) }).getByRole("button", { name: "Delete" }).click();
    await expect(page.getByRole("row", { name: new RegExp(description) })).toHaveCount(0);
    const kept = query<{ recurring_id: number | null }>("select recurring_id from transactions where description = ?", description);
    expect(kept).toHaveLength(1);
    expect(kept[0].recurring_id).toBeNull(); // now an ordinary transaction
  });

  test("the server rejects day 32 even when browser validation is bypassed", async ({ page }) => {
    await page.goto("/recurring/new");
    await page.evaluate(() => { (document.querySelector("form") as HTMLFormElement).noValidate = true; });
    await byLabel(page, "Description").fill("Bad day");
    await byLabel(page, "Amount per month").fill("10");
    await byLabel(page, "Category").selectOption({ label: "Other" });
    await byLabel(page, "Day of the month").fill("32");
    await byLabel(page, "Starts").fill("2026-01-01");
    await page.getByRole("button", { name: "Add rule" }).click();
    await expect(byText(page, "Enter a day from 1 to 31.")).toBeVisible();
    expect(query("select 1 from recurring_rules where description = 'Bad day'")).toHaveLength(0);
  });
});
