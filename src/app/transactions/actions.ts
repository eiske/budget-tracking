"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { categories, recurringSkips, transactions } from "@/db/schema";
import { buildInstallments } from "@/lib/domain/installments";
import { parseTransactionForm } from "@/lib/domain/transaction-input";

export type FormState = {
  errors: Record<string, string>;
  values: Record<string, string>;
} | null;

function rawFields(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ["date", "amount", "description", "categoryId", "installments"]) {
    const v = formData.get(key);
    out[key] = typeof v === "string" ? v : "";
  }
  return out;
}

/**
 * Create (id = null) or update a transaction. Bound with the id via `.bind(null, id)`.
 * Creating with installments > 1 inserts all of them at once (future-dated, one per month);
 * the amount is the TOTAL. Editing changes only that one row and ignores `installments`.
 */
export async function saveTransaction(
  id: number | null,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = rawFields(formData);
  const parsed = parseTransactionForm(values);
  if (!parsed.ok) return { errors: parsed.errors, values };

  const { date, amountCents, description, categoryId, installments } = parsed.data;

  const category = db.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId)).get();
  if (!category) return { errors: { categoryId: "Choose a valid category." }, values };

  if (id === null) {
    if (installments === 1) {
      db.insert(transactions).values({ date, amountCents, description, categoryId, source: "manual" }).run();
    } else {
      const groupId = crypto.randomUUID();
      // One multi-row INSERT is atomic: either every installment exists or none does.
      db.insert(transactions)
        .values(
          buildInstallments(date, amountCents, installments).map((p) => ({
            date: p.date,
            amountCents: p.amountCents,
            description,
            categoryId,
            source: "manual" as const,
            installmentGroupId: groupId,
            installmentNumber: p.number,
            installmentTotal: installments,
          })),
        )
        .run();
    }
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

/**
 * Deletes one transaction. If a recurring rule generated it, that month is remembered as skipped
 * (in the same DB transaction) so the next app open does not recreate it.
 */
export async function deleteTransaction(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;

  db.transaction((tx) => {
    const row = tx
      .select({ recurringId: transactions.recurringId, recurringMonth: transactions.recurringMonth })
      .from(transactions)
      .where(eq(transactions.id, id))
      .get();
    if (!row) return;
    if (row.recurringId !== null && row.recurringMonth !== null) {
      tx.insert(recurringSkips)
        .values({ recurringId: row.recurringId, month: row.recurringMonth })
        .onConflictDoNothing()
        .run();
    }
    tx.delete(transactions).where(eq(transactions.id, id)).run();
  });

  revalidatePath("/transactions");
  revalidatePath("/");
}

/** Deletes every installment of one purchase. */
export async function deleteInstallmentGroup(formData: FormData): Promise<void> {
  const groupId = formData.get("groupId");
  // Group ids are UUIDs we generated; reject anything else instead of matching arbitrary text.
  if (typeof groupId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(groupId)) {
    return;
  }
  db.delete(transactions).where(eq(transactions.installmentGroupId, groupId)).run();
  revalidatePath("/transactions");
  revalidatePath("/");
}
