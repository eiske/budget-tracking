import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { byLabel, byText, query } from "./helpers";

const fixture = (name: string) => path.join(process.cwd(), "e2e", "fixtures", name);
const importedCount = () => query<{ n: number }>("select count(*) n from transactions where source = 'import'")[0].n;

type Upload = { name: string; mimeType: string; buffer: Buffer };
const csv = (name: string, lines: string[]): Upload => ({ name, mimeType: "text/csv", buffer: Buffer.from(lines.join("\n") + "\n") });

async function readFile(page: Page, files: string | Upload[]) {
  await page.goto("/import");
  await page.setInputFiles('input[type="file"]', typeof files === "string" ? fixture(files) : files);
  await page.getByRole("button", { name: "Read files" }).click();
  await expect(page.getByRole("heading", { name: /2\. Review/ })).toBeVisible();
}
const summary = (page: Page) => page.locator("form:has(h2) p").first();
const chosen = (page: Page, row: number, file = 0) => page.locator(`select[name="row_${file}_${row}"] option:checked`);

test.describe.configure({ mode: "serial" });

test.describe("statement import", () => {
  test("keyword rules suggest categories (case- and accent-insensitive)", async ({ page }) => {
    await page.goto("/rules");
    for (const [pattern, category] of [["PADARIA", "Restaurants"], ["mercado", "Groceries"], ["Salário", "Salary"]]) {
      await byLabel(page, "If the description contains").fill(pattern);
      await byLabel(page, "Use category").selectOption({ label: category });
      await page.getByRole("button", { name: "Add rule" }).click();
      await expect(page.getByRole("row", { name: new RegExp(`${pattern} ${category}`, "i") })).toBeVisible();
    }
    // a duplicate (same words, different case) is refused
    await byLabel(page, "If the description contains").fill("padaria");
    await byLabel(page, "Use category").selectOption({ label: "Restaurants" });
    await page.getByRole("button", { name: "Add rule" }).click();
    await expect(byText(page, "That rule already exists.")).toBeVisible();
  });

  test("reads a bank-shaped CSV, suggests categories, imports the kept rows only", async ({ page }) => {
    await readFile(page, "statement.csv");
    await expect(summary(page)).toContainText("12 rows read: 12 new");

    // columns and formats were detected, nothing to fix by hand
    await expect(page.locator('select[name="f0_map_date"] option:checked')).toHaveText("Data");
    await expect(page.locator('select[name="f0_map_description"] option:checked')).toHaveText("Descrição");
    await expect(page.locator('select[name="f0_map_id"] option:checked')).toHaveText("Identificador");
    await expect(page.locator('select[name="f0_dateFormat"]')).toHaveValue("DMY");
    await expect(page.locator('select[name="f0_decimal"]')).toHaveValue(".");

    // long bank descriptions are shortened: no CNPJ or account details on screen
    const table = page.locator("tbody");
    await expect(table).toContainText("ACME PADARIA LTDA");
    await expect(table).not.toContainText("/0001");
    await expect(table).not.toContainText("Agência");

    await expect(chosen(page, 0)).toHaveText("Restaurants"); // "padaria"
    await expect(chosen(page, 1)).toHaveText("Groceries"); // "MERCADO"
    await expect(chosen(page, 3)).toHaveText("Other income"); // income, no rule
    await expect(chosen(page, 4)).toHaveText("Other"); // expense, no rule
    await expect(chosen(page, 8)).toHaveText("Salary"); // "SALARIO"

    // not real spending/income: investment movements and the card-bill payment
    for (const row of [5, 9, 11]) await page.selectOption(`select[name="row_0_${row}"]`, "skip");
    await page.getByRole("button", { name: "Import selected rows" }).click();

    await expect(page.getByRole("status")).toContainText("Imported 9 transactions, 3 skipped");
    expect(importedCount()).toBe(9);
    expect(query("select 1 from transactions where description like 'Resgate%' or description like 'Aplica%' or description like 'Pagamento de fatura%'")).toHaveLength(0);
    // amounts are stored positive (direction comes from the category kind); no counterparty ids stored
    expect(query("select 1 from transactions where source = 'import' and amount_cents <= 0")).toHaveLength(0);
    expect(query("select 1 from transactions where source = 'import' and (description like '%/0001%' or description like '%Agência%')")).toHaveLength(0);
    expect(query<{ a: number }>("select amount_cents a from transactions where description like '%ACME PADARIA%'")[0].a).toBe(4890);
  });

  test("importing the same statement again adds nothing", async ({ page }) => {
    await readFile(page, "statement.csv");
    await expect(summary(page)).toContainText("3 new, 9 already imported");
    await expect(byText(page, "Already imported", { exact: true })).toHaveCount(9);

    for (const row of [5, 9, 11]) await page.selectOption(`select[name="row_0_${row}"]`, "skip");
    await page.getByRole("button", { name: "Import selected rows" }).click();
    await expect(byText(page, /Nothing to import/)).toBeVisible();
    expect(importedCount()).toBe(9);
  });

  test("a tampered form cannot put an expense into an income category", async ({ page }) => {
    await readFile(page, "statement.csv");
    const salaryId = query<{ id: number }>("select id from categories where name = 'Salary'")[0].id;
    // row 9 ("Aplicação CDB") is money out; force an income category onto it
    await page.evaluate((id) => {
      const select = document.querySelector('select[name="row_0_9"]') as HTMLSelectElement;
      select.add(new Option("tampered", String(id)));
      select.value = String(id);
    }, salaryId);
    await page.getByRole("button", { name: "Import selected rows" }).click();

    await expect(page.locator('form:has(h2) p[role="alert"]')).toContainText(/Nothing was imported\. Line 11: .*income category but this row is money out/);
    expect(importedCount()).toBe(9); // nothing at all was written, not even the valid rows
  });

  test("reads OFX, including a statement with a single transaction", async ({ page }) => {
    await readFile(page, "single.ofx");
    await expect(summary(page)).toContainText("1 rows read: 1 new");
    await expect(page.locator('select[name="f0_map_date"]')).toHaveCount(0); // OFX needs no column mapping
    await page.getByRole("button", { name: "Import selected rows" }).click();
    await expect(page.getByRole("status")).toContainText("Imported 1 transaction");

    await readFile(page, "single.ofx");
    await expect(summary(page)).toContainText("1 already imported");
    await expect(page.getByRole("button", { name: "Import selected rows" })).toBeDisabled();
  });

  test("reads several files at once, each CSV with its own columns, and skips rows repeated across them", async ({ page }) => {
    const before = importedCount();
    await readFile(page, [
      csv("card.csv", ["date,title,amount", "2026-09-05,LIVRARIA CENTRAL,-31.50", "2026-09-06,CINEMA SHOPPING,-44.00"]),
      // different bank layout: semicolons, comma decimals, other column order
      csv("account.csv", ["Descrição;Data;Valor", "CINEMA SHOPPING;06/09/2026;-44,00", "FARMACIA BOA;07/09/2026;-12,90"]),
    ]);
    await expect(page.getByRole("heading", { name: /2\. Review · 2 files/ })).toBeVisible();
    await expect(summary(page)).toContainText("4 rows read: 3 new, 1 repeated across the files");

    // each CSV got its own detected mapping
    await expect(page.locator('select[name="f0_map_description"] option:checked')).toHaveText("title");
    await expect(page.locator('select[name="f1_map_description"] option:checked')).toHaveText("Descrição");
    await expect(page.locator('select[name="f1_decimal"]')).toHaveValue(",");
    await expect(byText(page, "Repeated in the files", { exact: true })).toHaveCount(1);
    await expect(page.locator('select[name="row_1_0"]')).toHaveCount(0); // the repeated row has no choice

    // changing one file's settings keeps the other file in the preview
    await page.selectOption('select[name="f1_decimal"]', ",");
    await page.getByRole("button", { name: "Update preview" }).nth(1).click();
    await expect(summary(page)).toContainText("4 rows read: 3 new, 1 repeated across the files");

    await page.getByRole("button", { name: "Import selected rows" }).click();
    await expect(page.getByRole("status")).toContainText("Imported 3 transactions");
    expect(importedCount()).toBe(before + 3);
    expect(query<{ a: number }>("select amount_cents a from transactions where description = 'FARMACIA BOA'")[0].a).toBe(1290);
    expect(query("select 1 from transactions where description = 'CINEMA SHOPPING'")).toHaveLength(1);
  });

  test("refuses files that are not statements", async ({ page }) => {
    const before = importedCount();
    await page.goto("/import");
    await page.setInputFiles('input[type="file"]', { name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from("Data,Valor\n01/01/2026,\u0000\u0001-5\n") });
    await page.getByRole("button", { name: "Read files" }).click();
    await expect(byText(page, /does not look like a text file/)).toBeVisible();

    await page.setInputFiles('input[type="file"]', { name: "big.csv", mimeType: "text/csv", buffer: Buffer.alloc(1.6 * 1024 * 1024, "a") });
    await page.getByRole("button", { name: "Read files" }).click();
    await expect(byText(page, /too large/)).toBeVisible();
    expect(importedCount()).toBe(before);
  });
});
