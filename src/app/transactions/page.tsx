import Link from "next/link";
import { connection } from "next/server";
import { DeleteButton } from "@/components/delete-button";
import { CURRENCY, LOCALE } from "@/lib/config";
import { currentMonth, isValidMonth } from "@/lib/domain/dates";
import { formatCents } from "@/lib/domain/money";
import { listCategories, listTransactions, totalsFor, type TransactionFilters } from "@/lib/queries";
import { deleteTransaction } from "./actions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const input =
  "rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700";

export default async function TransactionsPage({ searchParams }: { searchParams: SearchParams }) {
  await connection(); // sync SQLite driver: keep queries out of prerendering
  const sp = await searchParams;

  // month: absent -> current month; empty -> all time; invalid -> current month
  const rawMonth = first(sp.month);
  const month =
    rawMonth === undefined ? currentMonth() : rawMonth === "" ? "" : isValidMonth(rawMonth) ? rawMonth : currentMonth();

  const categoryId = Number(first(sp.category)) || undefined;
  const q = first(sp.q)?.trim().slice(0, 100) || undefined;

  const filters: TransactionFilters = { month: month || undefined, categoryId, q };
  const rows = listTransactions(filters);
  const totals = totalsFor(filters);
  const categories = listCategories();
  const fmt = (c: number) => formatCents(c, CURRENCY, LOCALE);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Transactions</h1>
        <Link
          href="/transactions/new"
          className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background"
        >
          Add transaction
        </Link>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs">
          Month
          <input type="month" name="month" defaultValue={month} className={input} />
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Category
          <select name="category" defaultValue={categoryId ?? ""} className={input}>
            <option value="">All</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Search
          <input type="search" name="q" defaultValue={q ?? ""} placeholder="Description" className={input} />
        </label>
        <button type="submit" className={`${input} font-medium`}>Apply</button>
        <Link href="/transactions" className="py-1.5 text-sm underline">Reset</Link>
      </form>

      <dl className="flex gap-8 text-sm">
        <div>
          <dt className="text-neutral-500">Expenses</dt>
          <dd className="text-lg font-semibold">{fmt(totals.expenseCents)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Income</dt>
          <dd className="text-lg font-semibold">{fmt(totals.incomeCents)}</dd>
        </div>
        <div>
          <dt className="text-neutral-500">Net</dt>
          <dd className="text-lg font-semibold">{fmt(totals.incomeCents - totals.expenseCents)}</dd>
        </div>
      </dl>

      {rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No transactions match these filters.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-800">
              <th className="py-2 font-medium">Date</th>
              <th className="font-medium">Description</th>
              <th className="font-medium">Category</th>
              <th className="text-right font-medium">Amount</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const isIncome = t.categoryKind === "income";
              return (
                <tr key={t.id} className="border-b border-neutral-100 dark:border-neutral-900">
                  <td className="py-2 whitespace-nowrap">{t.date}</td>
                  <td>{t.description}</td>
                  <td>
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden
                        className="inline-block size-2.5 rounded-full"
                        style={{ background: t.categoryColor ?? "#64748b" }}
                      />
                      {t.categoryName ?? "Uncategorized"}
                    </span>
                  </td>
                  <td
                    className={`text-right tabular-nums ${isIncome ? "text-green-600" : ""}`}
                  >
                    {isIncome ? "+" : "−"}
                    {fmt(t.amountCents)}
                  </td>
                  <td className="flex justify-end gap-4 py-2">
                    <Link href={`/transactions/${t.id}/edit`} className="underline">Edit</Link>
                    <DeleteButton id={t.id} action={deleteTransaction} label={t.description} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
