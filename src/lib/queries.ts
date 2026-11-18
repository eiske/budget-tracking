import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { categories, transactions } from "@/db/schema";
import type { BreakdownRow } from "./domain/dashboard";
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

/** Expense totals per category for one month, largest first. */
export function categoryBreakdown(month: string): BreakdownRow[] {
  const total = sql<number>`coalesce(sum(${transactions.amountCents}), 0)`;
  return db
    .select({ id: categories.id, name: categories.name, totalCents: total })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(buildWhere({ month }), eq(categories.kind, "expense")))
    .groupBy(categories.id, categories.name)
    .orderBy(desc(total), categories.name)
    .all();
}

export type MonthTotals = { month: string; expenseCents: number; incomeCents: number };

/** Expense and income totals for each month in `months` (oldest first); empty months are zero. */
export function monthlyTotals(months: string[]): MonthTotals[] {
  const first = monthRange(months[0]).start;
  const last = monthRange(months[months.length - 1]).end;
  const monthExpr = sql<string>`substr(${transactions.date}, 1, 7)`;
  const rows = db
    .select({
      month: monthExpr,
      kind: categories.kind,
      total: sql<number>`coalesce(sum(${transactions.amountCents}), 0)`,
    })
    .from(transactions)
    .innerJoin(categories, eq(transactions.categoryId, categories.id))
    .where(and(gte(transactions.date, first), lte(transactions.date, last)))
    .groupBy(monthExpr, categories.kind)
    .all();
  return months.map((month) => ({
    month,
    expenseCents: rows.find((r) => r.month === month && r.kind === "expense")?.total ?? 0,
    incomeCents: rows.find((r) => r.month === month && r.kind === "income")?.total ?? 0,
  }));
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
