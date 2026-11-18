"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { categories, transactions } from "@/db/schema";
import { parseTransactionForm } from "@/lib/domain/transaction-input";

export type FormState = {
  errors: Record<string, string>;
  values: Record<string, string>;
} | null;

function rawFields(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ["date", "amount", "description", "categoryId"]) {
    const v = formData.get(key);
    out[key] = typeof v === "string" ? v : "";
  }
  return out;
}

/** Create (id = null) or update a transaction. Bound with the id via `.bind(null, id)`. */
export async function saveTransaction(
  id: number | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = rawFields(formData);
  const parsed = parseTransactionForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const { date, amountCents, description, categoryId } = parsed.data;

  const category = db.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId)).get();
  if (!category) return { errors: { categoryId: "Choose a valid category." }, values };

  if (id === null) {
    db.insert(transactions).values({ date, amountCents, description, categoryId, source: "manual" }).run();
  } else {
    if (!Number.isInteger(id) || id <= 0) return { errors: { form: "Invalid transaction." }, values };
    const res = db
      .update(transactions)
      .set({ date, amountCents, description, categoryId })
      .where(eq(transactions.id, id))
      .run();
    if (res.changes === 0) return { errors: { form: "Transaction not found." }, values };
  }

  revalidatePath("/transactions");
  redirect("/transactions"); // throws; must stay outside any try/catch
}

export async function deleteTransaction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;
  db.delete(transactions).where(eq(transactions.id, id)).run();
  revalidatePath("/transactions");
}
