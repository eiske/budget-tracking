"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { budgets, categories } from "@/db/schema";
import { isValidMonth } from "@/lib/domain/dates";
import { parseAmountToCents } from "@/lib/domain/money";

export type BudgetFormState = {
  errors: Record<string, string>;
  values: { categoryId: string; amount: string };
  /** Set only after a successful save; the form uses it as a key to clear itself. */
  savedAt?: number;
} | null;

function refresh() {
  revalidatePath("/budgets");
  revalidatePath("/");
}

/** Create or replace the budget of one expense category for `month` (bound via `.bind(null, month)`). */
export async function saveBudget(
  month: string,
  _prev: BudgetFormState,
  formData: FormData,
): Promise<BudgetFormState> {
  const rawCategory = formData.get("categoryId");
  const rawAmount = formData.get("amount");
  const values = {
    categoryId: typeof rawCategory === "string" ? rawCategory : "",
    amount: typeof rawAmount === "string" ? rawAmount : "",
  };

  if (!isValidMonth(month)) return { errors: { form: "Invalid month." }, values };

  const errors: Record<string, string> = {};
  const categoryId = Number(values.categoryId);
  if (!Number.isInteger(categoryId) || categoryId <= 0) errors.categoryId = "Choose a category.";

  const limitCents = parseAmountToCents(values.amount);
  if (limitCents === null) errors.amount = "Enter a positive amount, e.g. 500.00.";
  if (Object.keys(errors).length) return { errors, values };

  const category = db
    .select({ kind: categories.kind })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .get();
  if (!category) return { errors: { categoryId: "Choose a valid category." }, values };
  if (category.kind !== "expense") return { errors: { categoryId: "Budgets apply to expense categories only." }, values };

  // Atomic upsert on the (category, month) unique index: saving again replaces the limit.
  db.insert(budgets)
    .values({ categoryId, month, limitCents: limitCents! })
    .onConflictDoUpdate({ target: [budgets.categoryId, budgets.month], set: { limitCents: limitCents! } })
    .run();

  refresh();
  return { errors: {}, values: { categoryId: "", amount: "" }, savedAt: Date.now() };
}

export async function deleteBudget(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;
  db.delete(budgets).where(eq(budgets.id, id)).run();
  refresh();
}

/**
 * Copies the budgets of `from` into `to`, only for categories that have none in `to`
 * (existing budgets are never overwritten, so running it twice changes nothing).
 */
export async function copyBudgets(formData: FormData): Promise<void> {
  const from = formData.get("from");
  const to = formData.get("to");
  if (typeof from !== "string" || typeof to !== "string") return;
  if (!isValidMonth(from) || !isValidMonth(to) || from === to) return;

  db.run(sql`
    INSERT INTO budgets (category_id, month, limit_cents)
    SELECT category_id, ${to}, limit_cents FROM budgets WHERE month = ${from}
    ON CONFLICT (category_id, month) DO NOTHING
  `);
  refresh();
}
