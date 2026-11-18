import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { recurringRules, recurringSkips, transactions } from "@/db/schema";
import { dueRules, occurrenceDate } from "./domain/recurrence";

/**
 * Creates the entries that recurring rules owe for `month`. Intended for the CURRENT month only,
 * and called when a page is opened: it never backfills past months or creates future ones.
 *
 * Idempotent: the unique index on (recurring_id, recurring_month) makes a second call a no-op, and
 * months the user deliberately deleted (recurring_skips) are not recreated.
 * Returns how many entries were created.
 */
export function ensureRecurringForMonth(month: string): number {
  const rules = db.select().from(recurringRules).all();
  if (rules.length === 0) return 0;

  const skipped = new Set(
    db
      .select({ id: recurringSkips.recurringId })
      .from(recurringSkips)
      .where(eq(recurringSkips.month, month))
      .all()
      .map((r) => r.id),
  );

  const due = dueRules(rules, month, skipped);
  if (due.length === 0) return 0;

  return db
    .insert(transactions)
    .values(
      due.map((r) => ({
        date: occurrenceDate(month, r.dayOfMonth),
        amountCents: r.amountCents,
        description: r.description,
        categoryId: r.categoryId,
        source: "manual" as const,
        recurringId: r.id,
        recurringMonth: month,
      })),
    )
    .onConflictDoNothing()
    .run().changes;
}
