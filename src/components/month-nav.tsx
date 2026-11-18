import Link from "next/link";
import { LOCALE } from "@/lib/config";
import { addMonths, monthLabel } from "@/lib/domain/months";

const btn = "rounded-md border border-hairline px-3 py-1.5 hover:bg-ghost";

/**
 * Previous / next month controls. The current month links to the bare path (no ?month=).
 * `allowFuture`: budgets can be planned ahead; the dashboard has nothing to show for the future.
 */
export function MonthNav({
  basePath,
  month,
  nowMonth,
  allowFuture = false,
}: {
  basePath: string;
  month: string;
  nowMonth: string;
  allowFuture?: boolean;
}) {
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  const href = (m: string) => (m === nowMonth ? basePath : `${basePath}?month=${m}`);
  const canGoNext = allowFuture || month < nowMonth;

  return (
    <nav aria-label="Month" className="flex items-center gap-3 text-sm">
      <Link href={href(prev)} className={btn}>← {monthLabel(prev, LOCALE, "short")}</Link>
      <span className="min-w-32 text-center font-medium">{monthLabel(month, LOCALE)}</span>
      {canGoNext ? (
        <Link href={href(next)} className={btn}>{monthLabel(next, LOCALE, "short")} →</Link>
      ) : (
        <span aria-disabled className={`${btn} text-muted opacity-50`}>{monthLabel(next, LOCALE, "short")} →</span>
      )}
    </nav>
  );
}
