import { expect, test } from "@playwright/test";
import { addTransaction, byLabel, byText, tag } from "./helpers";

// "Entertainment" is used by no other spec, so its monthly total starts at zero here.
test("a budget moves through ok, warning, limit reached and over as spending grows", async ({ page }) => {
  page.on("dialog", (d) => d.accept());
  await page.goto("/budgets");
  await byLabel(page, "Category").selectOption({ label: "Entertainment" });
  await byLabel(page, "Monthly limit").fill("100");
  await page.getByRole("button", { name: "Save budget" }).click();
  await expect(byText(page, "Budget saved.")).toBeVisible();

  const meter = () => page.getByRole("meter", { name: "Entertainment budget" });
  const status = () => page.locator("li", { has: meter() }).locator("p");
  const spend = async (amount: string) => {
    await addTransaction(page, { amount, description: `Fun ${tag()}`, category: "Entertainment" });
    await expect(page).toHaveURL(/\/transactions$/);
    await page.goto("/budgets");
  };

  await spend("79");
  await expect(status()).toHaveText("R$21.00 left"); // 79% is still ok

  await spend("1");
  await expect(status()).toContainText("80% used"); // 80% warns, to the cent

  await spend("19.50");
  await expect(status()).toContainText("99% used"); // 99.5% must not read as 100%

  await spend("0.50");
  await expect(status()).toHaveText("Limit reached");

  await spend("5");
  await expect(status()).toHaveText("Over by R$5.00");

  // saving again replaces the limit (no second row)
  await byLabel(page, "Category").selectOption({ label: "Entertainment" });
  await byLabel(page, "Monthly limit").fill("500");
  await page.getByRole("button", { name: "Save budget" }).click();
  await expect(byText(page, "R$500.00")).toBeVisible();
  await expect(page.locator("li", { has: meter() })).toHaveCount(1);

  await page.locator("li", { has: meter() }).getByRole("button", { name: "Delete" }).click();
  await expect(meter()).toHaveCount(0);
});

test("the dashboard lists budgets that need attention", async ({ page }) => {
  await page.goto("/budgets");
  await byLabel(page, "Category").selectOption({ label: "Utilities" });
  await byLabel(page, "Monthly limit").fill("10");
  await page.getByRole("button", { name: "Save budget" }).click();
  await expect(byText(page, "Budget saved.")).toBeVisible();
  await addTransaction(page, { amount: "12", description: `Power ${tag()}`, category: "Utilities" });

  await page.goto("/");
  const card = page.locator("section", { hasText: "Manage budgets" });
  await expect(card).toContainText(/needs? attention/); // "1 needs attention" / "2 need attention"
  await expect(card.getByRole("meter", { name: "Utilities budget" })).toBeVisible();
  await expect(card).toContainText("Over by R$2.00");
});

test("rejects budgets for income categories and bad amounts", async ({ page }) => {
  await page.goto("/budgets");
  await expect(byLabel(page, "Category").locator("option", { hasText: "Salary" })).toHaveCount(0);

  await byLabel(page, "Category").selectOption({ label: "Health" });
  await byLabel(page, "Monthly limit").fill("-5");
  await page.getByRole("button", { name: "Save budget" }).click();
  await expect(byText(page, /Enter a positive amount/)).toBeVisible();
});
