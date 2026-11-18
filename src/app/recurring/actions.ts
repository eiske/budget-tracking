"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { categories, recurringRules, recurringSkips, transactions } from "@/db/schema";
import { currentMonth } from "@/lib/domain/dates";
import { parseRecurringForm } from "@/lib/domain/recurring-input";
import { ensureRecurringForMonth } from "@/lib/recurring";

export type RecurringFormState = {
  errors: Record<string, string>;
  values: Record<string, string>;
} | null;

const FIELDS = ["description", "amount", "categoryId", "dayOfMonth", "startDate", "endDate"] as const;

function refresh() {
  revalidatePath("/recurring");
  revalidatePath("/transactions");
  revalidatePath("/");
}

/**
 * Create (id = null) or update a rule. Bound with the id via `.bind(null, id)`.
 * Changing a rule affects entries not generated yet; this month's entry (if already created)
 * is a normal transaction and is edited under Transactions.
 */
export async function saveRecurring(
  id: number | null,
  _prev: RecurringFormState,
  formData: FormData,
): Promise<RecurringFormState> {
  const values: Record<string, string> = {};
  for (const key of FIELDS) {
    const v = formData.get(key);
    values[key] = typeof v === "string" ? v : "";
  }

  const parsed = parseRecurringForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values };
  const data = parsed.data;

  const category = db.select({ id: categories.id }).from(categories).where(eq(categories.id, data.categoryId)).get();
  if (!category) return { errors: { categoryId: "Choose a valid category." }, values };

  if (id === null) {
    db.insert(recurringRules).values(data).run();
  } else {
    if (!Number.isInteger(id) || id <= 0) return { errors: { form: "Invalid rule." }, values };
    const res = db.update(recurringRules).set(data).where(eq(recurringRules.id, id)).run();
    if (res.changes === 0) return { errors: { form: "Rule not found." }, values };
  }

  refresh();
  redirect("/recurring"); // throws; must stay outside any try/catch
}

/**
 * Deletes a rule but KEEPS the transactions it generated (they become ordinary transactions):
 * the link and its skip markers go, the history stays.
 */
export async function deleteRecurring(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;

  db.transaction((tx) => {
    tx.update(transactions)
      .set({ recurringId: null, recurringMonth: null })
      .where(eq(transactions.recurringId, id))
      .run();
    tx.delete(recurringSkips).where(eq(recurringSkips.recurringId, id)).run();
    tx.delete(recurringRules).where(eq(recurringRules.id, id)).run();
  });
  refresh();
}

/** Undo a deliberate deletion: forget this month's skip and create the entry again. */
export async function restoreRecurringMonth(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;

  const month = currentMonth(); // generation only ever concerns the current month
  db.delete(recurringSkips)
    .where(and(eq(recurringSkips.recurringId, id), eq(recurringSkips.month, month)))
    .run();
  ensureRecurringForMonth(month);
  refresh();
}
