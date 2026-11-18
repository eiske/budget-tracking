export type RuleLike = { pattern: string; categoryId: number; categoryKind: "expense" | "income" };
export type CategoryLike = { id: number; name: string; kind: "expense" | "income" };

/** Lowercase, accent-free, single-spaced: "Transferência  Enviada" -> "transferencia enviada". */
export function normalizeText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function kindOfAmount(amountCents: number): "expense" | "income" {
  return amountCents < 0 ? "expense" : "income";
}

/**
 * The category of the rule whose keyword appears in the description. Only rules whose category has
 * the right kind (an expense row never gets an income category). The longest keyword wins, being the
 * most specific; ties go to the earlier rule. Returns null when nothing matches.
 */
export function suggestCategory(
  rawDescription: string,
  kind: "expense" | "income",
  rules: RuleLike[],
): number | null {
  const text = normalizeText(rawDescription);
  let best: { length: number; id: number } | null = null;
  for (const rule of rules) {
    if (rule.categoryKind !== kind) continue;
    const pattern = normalizeText(rule.pattern);
    if (!pattern || !text.includes(pattern)) continue;
    if (!best || pattern.length > best.length) best = { length: pattern.length, id: rule.categoryId };
  }
  return best?.id ?? null;
}

/** Fallback when no rule matches: the seeded "Other" (expense) / "Other income" (income) category. */
export function defaultCategoryId(categories: CategoryLike[], kind: "expense" | "income"): number | null {
  const name = kind === "expense" ? "Other" : "Other income";
  return categories.find((c) => c.kind === kind && c.name === name)?.id ?? null;
}
