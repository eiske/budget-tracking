import { kindOfAmount, type CategoryLike } from "./categorize";

export type Decision =
  | { type: "skip" }
  | { type: "import"; categoryId: number }
  | { type: "error"; message: string };

/**
 * What the user chose for one row: "skip", or a category id. The server never trusts the form: the
 * category must exist AND match the row's direction (money out -> expense category, money in ->
 * income category), because the app derives income/expense from the category.
 * A missing choice is treated as skip, so a tampered or partial form cannot import anything by accident.
 */
export function resolveDecision(
  amountCents: number,
  choice: string | null | undefined,
  categories: CategoryLike[],
): Decision {
  if (choice === null || choice === undefined || choice === "" || choice === "skip") return { type: "skip" };
  if (!/^\d+$/.test(choice)) return { type: "error", message: "Invalid category" };

  const category = categories.find((c) => c.id === Number(choice));
  if (!category) return { type: "error", message: "Unknown category" };

  const kind = kindOfAmount(amountCents);
  if (category.kind !== kind) {
    return { type: "error", message: `"${category.name}" is an ${category.kind} category but this row is ${kind === "expense" ? "money out" : "money in"}` };
  }
  return { type: "import", categoryId: category.id };
}
