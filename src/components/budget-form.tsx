"use client";

import { useActionState } from "react";
import type { BudgetFormState } from "@/app/budgets/actions";

type Category = { id: number; name: string };

const field =
  "rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700";

export function BudgetForm({
  action,
  categories,
}: {
  action: (prev: BudgetFormState, formData: FormData) => Promise<BudgetFormState>;
  categories: Category[];
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const err = state?.errors ?? {};
  const v = state?.values;

  return (
    // key changes after each successful save, which remounts the form and clears its fields
    <form key={state?.savedAt ?? "new"} action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Category
          <select name="categoryId" defaultValue={v?.categoryId ?? ""} required className={field}>
            <option value="">Choose…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Monthly limit
          <input
            name="amount"
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={v?.amount ?? ""}
            required
            className={`${field} w-36`}
          />
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save budget"}
        </button>
      </div>
      <div aria-live="polite" className="min-h-5 text-sm">
        {err.form && <span role="alert" className="text-red-600">{err.form}</span>}
        {err.categoryId && <span role="alert" className="mr-3 text-red-600">{err.categoryId}</span>}
        {err.amount && <span role="alert" className="text-red-600">{err.amount}</span>}
        {state?.savedAt && !Object.keys(err).length && <span className="text-ink-2">Budget saved.</span>}
      </div>
    </form>
  );
}
