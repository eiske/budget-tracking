import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, transactions } from "@/db/schema";
import { monthRange } from "./domain/dates";

export type TransactionFilters = {
  month?: string; // YYYY-MM; undefined = all time
  categoryId?: number;
  q?: string; // case-insensitive description search
};

function buildWhere(f: TransactionFilters): SQL | undefined {
  const conds: SQL[] = [];
  if (f.month) {
    const { start, end } = monthRange(f.month);
    conds.push(gte(transactions.date, start), lte(transactions.date, end));
  }
  if (f.categoryId) conds.push(eq(transactions.categoryId, f.categoryId));
  if (f.q) {
    // Escape LIKE wildcards so user input like "50%" is matched literally.
    const escaped = f.q.replace(/[\\%_]/g, (c) => `\\${c}`);
    conds.push(sql`${transactions.description} LIKE ${`%${escaped}%`} ESCAPE '\\'`);
  }
  return conds.length ? and(...conds) : undefined;
}

export function listCategories() {
  return db.select().from(categories).orderBy(categories.kind, categories.name).all();
}

export function listTransactions(f: TransactionFilters) {
  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      amountCents: transactions.amountCents,
      description: transactions.description,
      categoryId: transactions.categoryId,
      categoryName: categories.name,
      categoryColor: categories.color,
      categoryKind: categories.kind,
    })
    .from(transactions)
    .leftJoin(categories, eq(transactions.categoryId, categories.id))
    .where(buildWhere(f))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .all();
}

export function getTransaction(id: number) {
  return db.select().from(transactions).where(eq(transactions.id, id)).get();
}

/** Income and expense totals (in cents) for the same filters as the list. */
export function totalsFor(f: TransactionFilters) {
  const rows = db
    .select({
      kind: categories.kind,
      total: sql<number>`coalesce(sum(${transactions.amountCents}), 0)`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(buildWhere(f))
    .groupBy(categories.kind)
    .all();
  const get = (k: "income" | "expense") => rows.find((r) => r.kind === k)?.total ?? 0;
  return { incomeCents: get("income"), expenseCents: get("expense") };
}
