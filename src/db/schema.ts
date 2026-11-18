import { sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// All monetary values are stored as integer cents to avoid floating-point errors.

export const categories = sqliteTable("categories", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  color: text("color").notNull().default("#64748b"),
  kind: text("kind", { enum: ["expense", "income"] })
    .notNull()
    .default("expense"),
});

export const recurringRules = sqliteTable("recurring_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  description: text("description").notNull(),
  amountCents: integer("amount_cents").notNull(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id),
  dayOfMonth: integer("day_of_month").notNull(), // 1-31, clamped to month length
  startDate: text("start_date").notNull(), // YYYY-MM-DD
  endDate: text("end_date"), // YYYY-MM-DD, null = open ended
});

/**
 * Months a user deliberately deleted a rule's generated entry for. Without this, generation would
 * recreate the deleted transaction on the next app open.
 */
export const recurringSkips = sqliteTable(
  "recurring_skips",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    recurringId: integer("recurring_id")
      .notNull()
      .references(() => recurringRules.id),
    month: text("month").notNull(), // YYYY-MM
  },
  (t) => [uniqueIndex("recurring_skips_uq").on(t.recurringId, t.month)],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    date: text("date").notNull(), // YYYY-MM-DD
    amountCents: integer("amount_cents").notNull(), // positive number; direction comes from category.kind
    description: text("description").notNull(),
    categoryId: integer("category_id").references(() => categories.id),
    source: text("source", { enum: ["manual", "import"] })
      .notNull()
      .default("manual"),
    importHash: text("import_hash"), // dedupe key for imported rows
    installmentGroupId: text("installment_group_id"),
    installmentNumber: integer("installment_number"),
    installmentTotal: integer("installment_total"),
    recurringId: integer("recurring_id").references(() => recurringRules.id),
    recurringMonth: text("recurring_month"), // YYYY-MM, set only for rule-generated rows
    createdAt: text("created_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [
    index("transactions_date_idx").on(t.date),
    index("transactions_category_idx").on(t.categoryId),
    uniqueIndex("transactions_import_hash_uq").on(t.importHash),
    // A recurring rule can generate at most one entry per month (idempotent generation).
    // NULLs are distinct in SQLite unique indexes, so non-recurring rows never collide.
    uniqueIndex("transactions_recurring_month_uq").on(
      t.recurringId,
      t.recurringMonth,
    ),
  ],
);

export const budgets = sqliteTable(
  "budgets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    categoryId: integer("category_id")
      .notNull()
      .references(() => categories.id),
    month: text("month").notNull(), // YYYY-MM
    limitCents: integer("limit_cents").notNull(),
  },
  (t) => [uniqueIndex("budgets_category_month_uq").on(t.categoryId, t.month)],
);

export const categoryRules = sqliteTable("category_rules", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  pattern: text("pattern").notNull(), // case-insensitive keyword matched against the description
  categoryId: integer("category_id")
    .notNull()
    .references(() => categories.id),
});

export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type NewTransaction = typeof transactions.$inferInsert;
export type Budget = typeof budgets.$inferSelect;
export type RecurringRule = typeof recurringRules.$inferSelect;
export type RecurringSkip = typeof recurringSkips.$inferSelect;
export type CategoryRule = typeof categoryRules.$inferSelect;
