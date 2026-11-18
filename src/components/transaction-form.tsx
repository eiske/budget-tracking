"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "@/app/transactions/actions";

type Category = { id: number; name: string; kind: "expense" | "income" };

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  categories: Category[];
  defaults: { date: string; amount: string; description: string; categoryId: string };
  submitLabel: string;
};

const field =
  "w-full rounded-md border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700";

export function TransactionForm({ action, categories, defaults, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, null);
  const v = state?.values ?? defaults;
  const err = state?.errors ?? {};

  const expense = categories.filter((c) => c.kind === "expense");
  const income = categories.filter((c) => c.kind === "income");

  return (
    <form action={formAction} className="flex max-w-md flex-col gap-4">
      {err.form && <p role="alert" className="text-sm text-red-600">{err.form}</p>}

      <label className="flex flex-col gap-1 text-sm">
        Date
        <input type="date" name="date" defaultValue={v.date} required className={field} />
        {err.date && <span className="text-red-600">{err.date}</span>}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Amount
        <input
          name="amount"
          inputMode="decimal"
          placeholder="0.00"
          defaultValue={v.amount}
          required
          className={field}
        />
        {err.amount && <span className="text-red-600">{err.amount}</span>}
      </label>

      <label className="flex flex-col gap-1 text-sm">
        Description
        <input name="description" defaultValue={v.description} maxLength={200} required className={field} />
        {err.description && <span className="text-red-600">{err.description}</span>}
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

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? "Saving…" : submitLabel}
        </button>
        <Link href="/transactions" className="px-4 py-2 text-sm underline">Cancel</Link>
      </div>
    </form>
  );
}
