"use client";

import { useActionState } from "react";
import type { RuleFormState } from "@/app/rules/actions";

type Category = { id: number; name: string; kind: "expense" | "income" };

const field =
  "rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700";

export function RuleForm({
  action,
  categories,
}: {
  action: (prev: RuleFormState, formData: FormData) => Promise<RuleFormState>;
  categories: Category[];
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const err = state?.errors ?? {};
  const v = state?.values;
  const expense = categories.filter((c) => c.kind === "expense");
  const income = categories.filter((c) => c.kind === "income");

  return (
    // key changes after each successful save, which remounts the form and clears its fields
    <form key={state?.savedAt ?? "new"} action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          If the description contains
          <input name="pattern" defaultValue={v?.pattern ?? ""} maxLength={100} required placeholder="e.g. supermercado" className={`${field} w-56`} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Use category
          <select name="categoryId" defaultValue={v?.categoryId ?? ""} required className={field}>
            <option value="">Choose…</option>
            <optgroup label="Expenses">
              {expense.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
            <optgroup label="Income">
              {income.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </optgroup>
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "Saving…" : "Add rule"}
        </button>
      </div>
      <div aria-live="polite" className="min-h-5 text-sm">
        {err.pattern && <span role="alert" className="mr-3 text-red-600">{err.pattern}</span>}
        {err.categoryId && <span role="alert" className="text-red-600">{err.categoryId}</span>}
        {state?.savedAt && !Object.keys(err).length && <span className="text-ink-2">Rule added.</span>}
      </div>
    </form>
  );
}
