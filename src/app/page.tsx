import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { BudgetMeter } from "@/components/budget-meter";
import { CategoryBars } from "@/components/category-bars";
import { DeltaBadge } from "@/components/delta-badge";
import { FitText } from "@/components/fit-text";
import { MonthNav } from "@/components/month-nav";
import { MonthlyChart, type MonthPoint } from "@/components/monthly-chart";
import { StatTile } from "@/components/stat-tile";
import { CURRENCY, LOCALE } from "@/lib/config";
import { sortByUsage } from "@/lib/domain/budget";
import { describeDelta, foldTail } from "@/lib/domain/dashboard";
import { currentMonth, monthFromParam } from "@/lib/domain/dates";
import { formatCents } from "@/lib/domain/money";
import { addMonths, lastMonths, monthLabel } from "@/lib/domain/months";
import { budgetLines, categoryBreakdown, monthlyTotals } from "@/lib/queries";
import { ensureRecurringForMonth } from "@/lib/recurring";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const fmt = (cents: number) => formatCents(cents, CURRENCY, LOCALE);

const TREND_MONTHS = 6;
const MAX_CATEGORY_ROWS = 8;
const MAX_BUDGET_ROWS = 5;

export default function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  // Request-time data (SQLite) must sit under Suspense with Cache Components.
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const sp = await searchParams;

  const nowMonth = currentMonth();
  ensureRecurringForMonth(nowMonth); // current month only, before any totals are read
  const month = monthFromParam(first(sp.month), nowMonth);
  const prevMonth = addMonths(month, -1);

  const months = lastMonths(month, TREND_MONTHS);
  const totals = monthlyTotals(months);
  const current = totals[totals.length - 1];
  const previous = totals[totals.length - 2];
  const netCents = current.incomeCents - current.expenseCents;
  const prevNetCents = previous.incomeCents - previous.expenseCents;

  const breakdown = foldTail(categoryBreakdown(month), MAX_CATEGORY_ROWS);
  const budgets = sortByUsage(budgetLines(month));
  const shownBudgets = budgets.slice(0, MAX_BUDGET_ROWS);
  const needAttention = budgets.filter((b) => b.status.state !== "ok").length;
  const prevShort = monthLabel(prevMonth, LOCALE, "short");
  const heroText = fmt(current.expenseCents);

  const chartData: MonthPoint[] = totals.map((t) => ({
    month: t.month,
    label: monthLabel(t.month, LOCALE, "short"),
    longLabel: monthLabel(t.month, LOCALE),
    expenseCents: t.expenseCents,
    selected: t.month === month,
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* Filters: one row above the content they scope. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <MonthNav basePath="/" month={month} nowMonth={nowMonth} />
      </div>

      {/* Hero figure: exactly one per view. */}
      <section className="flex flex-col gap-2 rounded-xl border border-hairline bg-surface p-6">
        <p className="text-sm text-ink-2">Spent in {monthLabel(month, LOCALE)}</p>
        {/* 48px on wide screens; shrinks to fit so large amounts never overflow on a phone. */}
        <FitText text={heroText} maxRem={3} minRem={1.5} />
        <DeltaBadge delta={describeDelta(current.expenseCents, previous.expenseCents, false)} vs={prevShort} />
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatTile label="Income" value={fmt(current.incomeCents)}>
          <DeltaBadge delta={describeDelta(current.incomeCents, previous.incomeCents, true)} vs={prevShort} />
        </StatTile>
        <StatTile label="Net" value={`${netCents < 0 ? "−" : ""}${fmt(Math.abs(netCents))}`}>
          <DeltaBadge delta={describeDelta(netCents, prevNetCents, true)} vs={prevShort} />
        </StatTile>
      </div>

      <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-hairline bg-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">
            Budgets
            {needAttention > 0 && (
              <span className="ml-2 text-sm font-normal text-ink-2">
                · {needAttention} {needAttention === 1 ? "needs" : "need"} attention
              </span>
            )}
          </h2>
          <Link href={month === nowMonth ? "/budgets" : `/budgets?month=${month}`} className="text-sm underline">
            Manage budgets
          </Link>
        </div>
        {shownBudgets.length === 0 ? (
          <p className="text-sm text-muted">
            No budgets set for {monthLabel(month, LOCALE)}.{" "}
            <Link href={month === nowMonth ? "/budgets" : `/budgets?month=${month}`} className="underline">
              Set a budget
            </Link>
          </p>
        ) : (
          <ul className="flex flex-col gap-5">
            {shownBudgets.map((line) => (
              <BudgetMeter key={line.id} line={line} />
            ))}
          </ul>
        )}
        {budgets.length > shownBudgets.length && (
          <p className="text-sm text-muted">
            Showing the {shownBudgets.length} most used of {budgets.length} budgets.
          </p>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-hairline bg-surface p-5">
          <h2 className="font-semibold">Spending by category</h2>
          {breakdown.length === 0 ? (
            <p className="text-sm text-muted">
              No spending recorded for {monthLabel(month, LOCALE)}.{" "}
              <Link href="/transactions/new" className="underline">Add a transaction</Link>
            </p>
          ) : (
            <CategoryBars rows={breakdown} totalCents={current.expenseCents} />
          )}
        </section>

        <section className="flex min-w-0 flex-col gap-4 rounded-xl border border-hairline bg-surface p-5">
          <h2 className="font-semibold">Spending, last {TREND_MONTHS} months</h2>
          <MonthlyChart data={chartData} currency={CURRENCY} locale={LOCALE} />
          <details className="text-sm">
            <summary className="cursor-pointer text-ink-2">View as table</summary>
            <table className="mt-2 w-full">
              <thead>
                <tr className="text-left text-muted">
                  <th className="py-1 font-medium">Month</th>
                  <th className="text-right font-medium">Spent</th>
                  <th className="text-right font-medium">Income</th>
                </tr>
              </thead>
              <tbody>
                {totals.map((t) => (
                  <tr key={t.month} className="border-t border-hairline">
                    <td className="py-1">{monthLabel(t.month, LOCALE)}</td>
                    <td className="text-right tabular-nums">{fmt(t.expenseCents)}</td>
                    <td className="text-right tabular-nums">{fmt(t.incomeCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      </div>
    </div>
  );
}
