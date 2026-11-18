import { connection } from "next/server";
import { Suspense } from "react";
import { BudgetForm } from "@/components/budget-form";
import { BudgetMeter } from "@/components/budget-meter";
import { DeleteButton } from "@/components/delete-button";
import { MonthNav } from "@/components/month-nav";
import { LOCALE } from "@/lib/config";
import { sortByUsage } from "@/lib/domain/budget";
import { currentMonth, monthFromParam } from "@/lib/domain/dates";
import { addMonths, monthLabel } from "@/lib/domain/months";
import { budgetCount, budgetLines, listExpenseCategories } from "@/lib/queries";
import { ensureRecurringForMonth } from "@/lib/recurring";
import { copyBudgets, deleteBudget, saveBudget } from "./actions";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function BudgetsPage({ searchParams }: { searchParams: SearchParams }) {
  // Request-time data (SQLite) must sit under Suspense with Cache Components.
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Budgets searchParams={searchParams} />
    </Suspense>
  );
}

async function Budgets({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const sp = await searchParams;

  const nowMonth = currentMonth();
  ensureRecurringForMonth(nowMonth); // spending shown against budgets must include recurring entries
  const month = monthFromParam(first(sp.month), nowMonth);
  const prevMonth = addMonths(month, -1);

  const lines = sortByUsage(budgetLines(month));
  const needAttention = lines.filter((l) => l.status.state !== "ok").length;
  const canCopy = budgetCount(prevMonth) > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Budgets</h1>
        <MonthNav basePath="/budgets" month={month} nowMonth={nowMonth} allowFuture />
      </div>

      <section className="flex flex-col gap-3 rounded-xl border border-hairline bg-surface p-5">
        <h2 className="font-semibold">Set a budget for {monthLabel(month, LOCALE)}</h2>
        <p className="text-sm text-muted">Saving a category that already has a budget replaces its limit.</p>
        <BudgetForm action={saveBudget.bind(null, month)} categories={listExpenseCategories()} />
      </section>

      <section className="flex flex-col gap-4 rounded-xl border border-hairline bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">
            Budgets
            {needAttention > 0 && (
              <span className="ml-2 text-sm font-normal text-ink-2">
                · {needAttention} {needAttention === 1 ? "needs" : "need"} attention
              </span>
            )}
          </h2>
          {canCopy && (
            <form action={copyBudgets}>
              <input type="hidden" name="from" value={prevMonth} />
              <input type="hidden" name="to" value={month} />
              <button type="submit" className="rounded-md border border-hairline px-3 py-1.5 text-sm hover:bg-ghost">
                Copy missing from {monthLabel(prevMonth, LOCALE, "short")}
              </button>
            </form>
          )}
        </div>

        {lines.length === 0 ? (
          <p className="text-sm text-muted">No budgets for {monthLabel(month, LOCALE)} yet.</p>
        ) : (
          <ul className="flex flex-col gap-5">
            {lines.map((line) => (
              <BudgetMeter
                key={line.id}
                line={line}
                actions={<DeleteButton id={line.id} action={deleteBudget} label={`${line.name} budget`} />}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
