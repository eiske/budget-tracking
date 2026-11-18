"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { categories, categoryRules } from "@/db/schema";
import { normalizeText } from "@/lib/import/categorize";
import { listCategoryRules } from "@/lib/queries";

export type RuleFormState = {
  errors: Record<string, string>;
  values: { pattern: string; categoryId: string };
  /** Set only after a successful save; the form uses it as a key to clear itself. */
  savedAt?: number;
} | null;

const MAX_PATTERN = 100;

/** Adds a keyword rule: statement rows whose description contains `pattern` get this category. */
export async function saveRule(_prev: RuleFormState, formData: FormData): Promise<RuleFormState> {
  const rawPattern = formData.get("pattern");
  const rawCategory = formData.get("categoryId");
  const values = {
    pattern: typeof rawPattern === "string" ? rawPattern : "",
    categoryId: typeof rawCategory === "string" ? rawCategory : "",
  };

  const errors: Record<string, string> = {};
  const pattern = values.pattern.trim();
  if (!pattern) errors.pattern = "Enter a keyword.";
  else if (pattern.length > MAX_PATTERN) errors.pattern = `At most ${MAX_PATTERN} characters.`;
  else if (!normalizeText(pattern)) errors.pattern = "Enter a keyword with letters or digits.";

  const categoryId = Number(values.categoryId);
  if (!Number.isInteger(categoryId) || categoryId <= 0) errors.categoryId = "Choose a category.";
  if (Object.keys(errors).length) return { errors, values };

  const category = db.select({ id: categories.id }).from(categories).where(eq(categories.id, categoryId)).get();
  if (!category) return { errors: { categoryId: "Choose a valid category." }, values };

  const duplicate = listCategoryRules().some(
    (r) => r.categoryId === categoryId && normalizeText(r.pattern) === normalizeText(pattern),
  );
  if (duplicate) return { errors: { pattern: "That rule already exists." }, values };

  db.insert(categoryRules).values({ pattern, categoryId }).run();
  revalidatePath("/rules");
  return { errors: {}, values: { pattern: "", categoryId: "" }, savedAt: Date.now() };
}

export async function deleteRule(formData: FormData): Promise<void> {
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id) || id <= 0) return;
  db.delete(categoryRules).where(eq(categoryRules.id, id)).run();
  revalidatePath("/rules");
}
