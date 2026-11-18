import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DeleteButton } from "@/components/delete-button";
import { CURRENCY, LOCALE } from "@/lib/config";
import { currentMonth } from "@/lib/domain/dates";
import { formatCents } from "@/lib/domain/money";
import { ruleStatus } from "@/lib/domain/recurrence";
import { listRecurringRules, recurringMonthState } from "@/lib/queries";
import { ensureRecurringForMonth } from "@/lib/recurring";
import { deleteRecurring, restoreRecurringMonth } from "./actions";

export default function RecurringPage() {
  // Request-time data (SQLite) must sit under Suspense with Cache Components.
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Recurring</h1>
        <Link
          href="/recurring/new"
          className="rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background"
        >
          Add rule
        </Link>
      </div>
      <p className="text-sm text-muted">
        Each rule creates one entry for the current month when you open the app. Past months are never
        filled in. Changing a rule affects entries that were not created yet; to change this month&apos;s
        entry, edit it under Transactions.
      </p>
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <RuleList />
      </Suspense>
    </div>
  );
}

async function RuleList() {
  await connection();
  const month = currentMonth();
  ensureRecurringForMonth(month); // so a rule saved a moment ago shows as created
  const rules = listRecurringRules();
  const { generated, skipped } = recurringMonthState(month);
  const fmt = (c: number) => formatCents(c, CURRENCY, LOCALE);

  if (rules.length === 0) {
    return <p className="text-sm text-muted">No recurring rules yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr className="border-b border-hairline text-left text-muted">
            <th className="py-2 font-medium">Description</th>
            <th className="font-medium">Category</th>
            <th className="text-right font-medium">Amount</th>
            <th className="pl-4 font-medium">Day</th>
            <th className="font-medium">Period</th>
            <th className="font-medium">This month</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => {
            const status = ruleStatus(r, month);
            const isIncome = r.categoryKind === "income";
            let thisMonth: string;
            if (status === "ended") thisMonth = "Ended";
            else if (status === "upcoming") thisMonth = `Starts ${r.startDate}`;
            else if (generated.has(r.id)) thisMonth = "Created";
            else if (skipped.has(r.id)) thisMonth = "Removed";
            else thisMonth = "Not due yet";

            return (
              <tr key={r.id} className="border-b border-hairline">
                <td className="py-2">{r.description}</td>
                <td>{r.categoryName}</td>
                <td className={`text-right tabular-nums ${isIncome ? "text-green-600" : ""}`}>
                  {isIncome ? "+" : "−"}
                  {fmt(r.amountCents)}
                </td>
                <td className="pl-4 tabular-nums">{r.dayOfMonth}</td>
                <td className="whitespace-nowrap">
                  {r.startDate} → {r.endDate ?? "no end"}
                </td>
                <td>
                  <span className="inline-flex items-center gap-2">
                    {thisMonth}
                    {skipped.has(r.id) && status === "active" && (
                      <form action={restoreRecurringMonth}>
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" className="text-sm underline">Add back</button>
                      </form>
                    )}
                  </span>
                </td>
                <td className="flex justify-end gap-4 py-2">
                  <Link href={`/recurring/${r.id}/edit`} className="underline">Edit</Link>
                  <DeleteButton
                    id={r.id}
                    action={deleteRecurring}
                    label={r.description}
                    message={`Delete the rule "${r.description}"? Entries it already created are kept as ordinary transactions.`}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
