import { z } from "zod";
import { isValidDate } from "./dates";
import { parseAmountToCents } from "./money";

export type RecurringInput = {
  description: string;
  amountCents: number;
  categoryId: number;
  dayOfMonth: number;
  startDate: string;
  endDate: string | null;
};

export type RecurringFormResult =
  | { ok: true; data: RecurringInput }
  | { ok: false; errors: Record<string, string> };

const schema = z.object({
  description: z.string().trim().min(1, "Description is required.").max(200, "Max 200 characters."),
  amount: z
    .string()
    .transform((v) => parseAmountToCents(v))
    .refine((v): v is number => v !== null, "Enter a positive amount, e.g. 12.50."),
  categoryId: z.coerce.number().int().positive("Choose a category."),
  dayOfMonth: z.coerce
    .number("Enter a day from 1 to 31.")
    .int("Enter a day from 1 to 31.")
    .min(1, "Enter a day from 1 to 31.")
    .max(31, "Enter a day from 1 to 31."),
  startDate: z.string().refine(isValidDate, "Enter a valid start date."),
  endDate: z
    .string()
    .trim()
    .refine((v) => v === "" || isValidDate(v), "Enter a valid end date or leave it empty."),
});

/** Validates the recurring-rule form. Pure: no DB access. */
export function parseRecurringForm(raw: Record<string, unknown>): RecurringFormResult {
  const result = schema.safeParse({
    description: raw.description ?? "",
    amount: raw.amount ?? "",
    categoryId: raw.categoryId ?? "",
    dayOfMonth: raw.dayOfMonth ?? "",
    startDate: raw.startDate ?? "",
    endDate: raw.endDate ?? "",
  });

  if (!result.success) {
    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      errors[String(issue.path[0] ?? "form")] ??= issue.message;
    }
    return { ok: false, errors };
  }

  const { description, amount, categoryId, dayOfMonth, startDate, endDate } = result.data;
  if (endDate !== "" && endDate < startDate) {
    return { ok: false, errors: { endDate: "The end date cannot be before the start date." } };
  }

  return {
    ok: true,
    data: {
      description,
      amountCents: amount as number,
      categoryId,
      dayOfMonth,
      startDate,
      endDate: endDate === "" ? null : endDate,
    },
  };
}
