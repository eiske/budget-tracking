import { CURRENCY, LOCALE } from "@/lib/config";
import { sharePercent, type BreakdownRow } from "@/lib/domain/dashboard";
import { formatCents } from "@/lib/domain/money";

/**
 * Ranked horizontal bars (largest first, one hue): the right form for >6 parts of a whole.
 * Every value is printed at the bar tip, so nothing depends on hover; `title` adds a native tooltip.
 */
export function CategoryBars({ rows, totalCents }: { rows: BreakdownRow[]; totalCents: number }) {
  const max = Math.max(...rows.map((r) => r.totalCents), 1);

  return (
    <ul className="flex flex-col gap-3" aria-label="Spending by category, largest first">
      {rows.map((r) => {
        const share = sharePercent(r.totalCents, totalCents);
        const amount = formatCents(r.totalCents, CURRENCY, LOCALE);
        return (
          <li
            key={r.id ?? "other"}
            title={`${r.name}: ${amount} (${share}% of spending)`}
            // Phone: name above, bar + value below (a side-by-side row runs out of room at 320px).
            className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-center sm:gap-3"
          >
            <span className="truncate" style={{ color: "var(--text-primary)" }}>{r.name}</span>
            <div className="flex min-w-0 items-center gap-2">
              {/* 12px thick (cap is 24px), 4px rounded data end, square at the baseline. */}
              <div
                className="h-3 rounded-r-[4px] transition-[filter] hover:brightness-110"
                style={{ width: `${Math.max((r.totalCents / max) * 75, 1)}%`, background: "var(--series-1)" }}
              />
              <span className="whitespace-nowrap">
                <span style={{ color: "var(--text-primary)" }}>{amount}</span>
                <span className="text-muted"> · {share}%</span>
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
