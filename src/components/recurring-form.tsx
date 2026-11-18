"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { RecurringFormState } from "@/app/recurring/actions";

type Category = { id: number; name: string; kind: "expense" | "income" };

type Props = {
  action: (prev: RecurringFormState, formData: FormData) => Promise<RecurringFormState>;
  categories: Category[];
  defaults: {
    description: string;
    amount: string;
    categoryId: string;
    dayOfMonth: string;
    startDate: string;
    endDate: string;
  };
  submitLabel: string;
};

const field =
  "w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700";

export function RecurringForm({ action, categories, defaults, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const v = state?.values ?? defaults;
  const err = state?.errors ?? {};

  const expense = categories.filter((c) => c.kind === "expense");
  const income = categories.filter((c) => c.kind === "income");

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      {err.form && <p role="alert" className="text-sm text-red-600">{err.form}</p>}

      <label className="flex flex-col gap-1 text-sm">
        Description
        <input name="description" defaultValue={v.description} maxLength={200} required className={field} />
        {err.description && <span className="text-red-600">{err.description}</span>}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Amount per month
        <input name="amount" inputMode="decimal" placeholder="0.00" defaultValue={v.amount} required className={field} />
        {err.amount && <span className="text-red-600">{err.amount}</span>}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Category
        <select name="categoryId" defaultValue={v.categoryId} required className={field}>
          <option value="">Choose…</option>
          <optgroup label="Expenses">
            {expense.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </optgroup>
          <optgroup label="Income">
            {income.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </optgroup>
        </select>
        {err.categoryId && <span className="text-red-600">{err.categoryId}</span>}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Day of the month
        <input
          name="dayOfMonth"
          type="number"
          min={1}
          max={31}
          step={1}
          defaultValue={v.dayOfMonth}
          required
          className={`${field} w-28`}
        />
        <span className="text-xs text-muted">Days past the end of a short month use its last day (31 becomes 28 in February).</span>
        {err.dayOfMonth && <span className="text-red-600">{err.dayOfMonth}</span>}
      </label>

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Starts
          <input type="date" name="startDate" defaultValue={v.startDate} required className={field} />
          {err.startDate && <span className="text-red-600">{err.startDate}</span>}
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Ends (optional)
          <input type="date" name="endDate" defaultValue={v.endDate} className={field} />
          {err.endDate && <span className="text-red-600">{err.endDate}</span>}
        </label>
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <Link href="/recurring" className="px-4 py-2 text-sm underline">Cancel</Link>
      </div>
    </form>
  );
}
