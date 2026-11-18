import { z } from "zod";
import { isValidDate } from "./dates";
import { parseAmountToCents } from "./money";

export type TransactionInput = {
  date: string;
  amountCents: number;
  description: string;
  categoryId: number;
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
});

/** Validates raw form fields. Pure: no DB access, so it is easy to unit test. */
export function parseTransactionForm(raw: Record<string, unknown>): TransactionFormResult {
  const result = schema.safeParse({
    date: raw.date ?? "",
    amount: raw.amount ?? "",
    description: raw.description ?? "",
    categoryId: raw.categoryId ?? "",
  });

  if (!result.success) {
    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? "form");
      errors[key] ??= issue.message;
    }
    return { ok: false, errors };
  }

  const { date, amount, description, categoryId } = result.data;
  return { ok: true, data: { date, amountCents: amount as number, description, categoryId } };
}
