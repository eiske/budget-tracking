import Database from "better-sqlite3";
import { expect, type Page } from "@playwright/test";

/**
 * Next keeps pages you already visited in the DOM, hidden, after a CLIENT-SIDE navigation (a redirect
 * after saving, a link click), so a plain getByLabel/getByText can also match a stale hidden copy,
 * e.g. the "new rule" form while you are on "edit rule". Always target the visible one.
 */
export const byLabel = (page: Page, label: string | RegExp, exact = false) =>
  page.getByLabel(label, { exact }).filter({ visible: true });
export const byText = (page: Page, text: string | RegExp, options?: { exact?: boolean }) =>
  page.getByText(text, options).filter({ visible: true });

/** Read-only look at the database the app under test is writing to. */
export function query<T = Record<string, unknown>>(sql: string, ...params: unknown[]): T[] {
  const db = new Database(process.env.E2E_DATABASE_PATH!, { readonly: true });
  try {
    return db.prepare(sql).all(...params) as T[];
  } finally {
    db.close();
  }
}

/** A short unique suffix so specs never collide on descriptions. */
export const tag = () => Math.random().toString(36).slice(2, 8);

const pad = (n: number) => String(n).padStart(2, "0");
export const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const thisMonth = () => todayIso().slice(0, 7);

/** "−R$1,234.56" or "R$12.00" -> cents (always positive; callers know the direction). */
export function toCents(text: string): number {
  const digits = text.replace(/[^\d.]/g, "");
  const [whole, frac = ""] = digits.split(".");
  return Number(whole) * 100 + Number((frac + "00").slice(0, 2));
}

export async function addTransaction(
  page: Page,
  o: { date?: string; amount: string; description: string; category: string; installments?: string },
) {
  await page.goto("/transactions/new");
  // exact for text fields: the Installments help text sits inside its <label> and mentions "date" and
  // "amount". Not for the <select>: its label's text also contains every option, so exact never matches.
  await byLabel(page, "Date", true).fill(o.date ?? todayIso());
  await byLabel(page, "Amount", true).fill(o.amount);
  await byLabel(page, "Description", true).fill(o.description);
  await byLabel(page, "Category").selectOption({ label: o.category });
  if (o.installments) await page.locator('input[name="installments"]').fill(o.installments);
  await page.getByRole("button", { name: "Add transaction" }).click();
}

/** The big "Spent in <month>" number on the dashboard, in cents. */
export async function dashboardSpentCents(page: Page): Promise<number> {
  await page.goto("/");
  const hero = page.locator("section", { hasText: "Spent in" }).getByText(/^R\$[\d,]+\.\d{2}$/).first();
  await expect(hero).toBeVisible();
  return toCents(await hero.innerText());
}
