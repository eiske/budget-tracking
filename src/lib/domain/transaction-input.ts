import { z } from "zod";
import { isValidDate } from "./dates";
import { MAX_INSTALLMENTS } from "./installments";
import { parseAmountToCents } from "./money";

export type TransactionInput = {
  date: string;
  /** The TOTAL amount. With installments > 1 it is split across them. */
  amountCents: number;
  description: string;
  categoryId: number;
  installments: number;
};

export type TransactionFormResult =
  | { ok: true; data: TransactionInput }
  | { ok: false; errors: Record<string, string> };

const schema = z.object({
  date: z.string().refine(isValidDate, "Enter a valid date."),
  amount: z
    .string()
    .transform((v) => parseAmountToCents(v))
    .refine((v): v is number => v !== null, "Enter a positive amount, e.g. 12.50."),
  description: z.string().trim().min(1, "Description is required.").max(200, "Max 200 characters."),
  categoryId: z.coerce.number().int().positive("Choose a category."),
  // Blank means "not installments" (the edit form has no such field).
  installments: z
    .string()
    .trim()
    // Only plain integers count: Number() alone would accept "0x10" and "1e1".
    .transform((v) => (v === "" ? 1 : /^-?\d+$/.test(v) ? Number(v) : NaN))
    .refine((n) => Number.isInteger(n), "Enter a whole number of installments.")
    .refine((n) => n >= 1, "Use 1 or more installments.")
    .refine((n) => n <= MAX_INSTALLMENTS, `At most ${MAX_INSTALLMENTS} installments.`),
});

/** Validates raw form fields. Pure: no DB access, so it is easy to unit test. */
export function parseTransactionForm(raw: Record<string, unknown>): TransactionFormResult {
  const result = schema.safeParse({
    date: raw.date ?? "",
    amount: raw.amount ?? "",
    description: raw.description ?? "",
    categoryId: raw.categoryId ?? "",
    installments: raw.installments ?? "",
  });

  if (!result.success) {
    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? "form");
      errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }

  const { date, amount, description, categoryId, installments } = result.data;
  const amountCents = amount as number;

  // Every installment needs at least one cent.
  if (amountCents < installments) {
    return { ok: false, errors: { installments: "The amount is too small to split that many ways." } };
  }

  return { ok: true, data: { date, amountCents, description, categoryId, installments } };
}
