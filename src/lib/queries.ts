import { and, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db/client";
import { budgets, categories, recurringRules, recurringSkips, transactions } from "@/db/schema";
import { budgetStatus, type BudgetLine } from "./domain/budget";
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
      installmentGroupId: transactions.installmentGroupId,
      installmentNumber: transactions.installmentNumber,
      installmentTotal: transactions.installmentTotal,
      recurringId: transactions.recurringId,
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

export function listExpenseCategories() {
  return db.select().from(categories).where(eq(categories.kind, "expense")).orderBy(categories.name).all();
}

/** Budgets for a month with what was spent in each category that month (unsorted). */
export function budgetLines(month: string): BudgetLine[] {
  const spentByCategory = new Map(categoryBreakdown(month).map((r) => [r.id, r.totalCents]));
  return db
    .select({
      id: budgets.id,
      categoryId: budgets.categoryId,
      name: categories.name,
      limitCents: budgets.limitCents,
    })
    .from(budgets)
    .innerJoin(categories, eq(budgets.categoryId, categories.id))
    .where(eq(budgets.month, month))
    .all()
    .map((b) => {
      const spentCents = spentByCategory.get(b.categoryId) ?? 0;
      return { ...b, spentCents, status: budgetStatus(spentCents, b.limitCents) };
    });
}

export function budgetCount(month: string): number {
  return db.select({ n: sql<number>`count(*)` }).from(budgets).where(eq(budgets.month, month)).get()?.n ?? 0;
}

export function listRecurringRules() {
  return db
    .select({
      id: recurringRules.id,
      description: recurringRules.description,
      amountCents: recurringRules.amountCents,
      categoryId: recurringRules.categoryId,
      categoryName: categories.name,
      categoryKind: categories.kind,
      dayOfMonth: recurringRules.dayOfMonth,
      startDate: recurringRules.startDate,
      endDate: recurringRules.endDate,
    })
    .from(recurringRules)
    .innerJoin(categories, eq(recurringRules.categoryId, categories.id))
    .orderBy(recurringRules.description, recurringRules.id)
    .all();
}

export function getRecurringRule(id: number) {
  return db.select().from(recurringRules).where(eq(recurringRules.id, id)).get();
}

/** Which rules already have an entry for `month`, and which the user deliberately removed. */
export function recurringMonthState(month: string) {
  const generated = new Set(
    db
      .select({ id: transactions.recurringId })
      .from(transactions)
      .where(eq(transactions.recurringMonth, month))
      .all()
      .map((r) => r.id),
  );
  const skipped = new Set(
    db
      .select({ id: recurringSkips.recurringId })
      .from(recurringSkips)
      .where(eq(recurringSkips.month, month))
      .all()
      .map((r) => r.id),
  );
  return { generated, skipped };
}
