import type { ReactNode } from "react";
import { CURRENCY, LOCALE } from "@/lib/config";
import type { BudgetLine, BudgetState } from "@/lib/domain/budget";
import { formatCents } from "@/lib/domain/money";

const FILL: Record<BudgetState, string> = {
  ok: "var(--series-1)",
  warning: "var(--status-warning)",
  over: "var(--status-critical)",
};

const fmt = (cents: number) => formatCents(cents, CURRENCY, LOCALE);

function StatusIcon({ state }: { state: BudgetState }) {
  if (state === "ok") return null;
  // Triangle for "close", circle-cross for "reached/over": shape differs, so it never relies on hue.
  return (
    <svg aria-hidden viewBox="0 0 16 16" width="14" height="14" className="shrink-0" style={{ color: FILL[state] }}>
      {state === "warning" ? (
        <path d="M8 1.5 15 14H1L8 1.5Z M8 6v4 M8 11.5v1" fill="currentColor" stroke="var(--surface-1)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="var(--surface-1)" strokeWidth="1.6" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

function statusText(line: BudgetLine): string {
  const { state, percent, remainingCents } = line.status;
  if (state === "over") return remainingCents === 0 ? "Limit reached" : `Over by ${fmt(-remainingCents)}`;
  if (state === "warning") return `${percent}% used · ${fmt(remainingCents)} left`;
  return `${fmt(remainingCents)} left`;
}

/**
 * One budget as a meter row: name, spent of limit, a thin bar and a status line.
 * The fill carries severity (accent -> warning -> critical); the track is a lighter step of
 * the same hue so the state reads across the whole bar. Status is never color alone: it also
 * has an icon shape and a text label.
 */
export function BudgetMeter({ line, actions }: { line: BudgetLine; actions?: ReactNode }) {
  const { state, fillPercent } = line.status;
  const fill = FILL[state];

  return (
    <li className="flex flex-col gap-1.5" title={`${line.name}: ${fmt(line.spentCents)} of ${fmt(line.limitCents)}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <span className="font-medium" style={{ color: "var(--text-primary)" }}>{line.name}</span>
        <span className="flex items-baseline gap-3">
          <span>
            <span style={{ color: "var(--text-primary)" }}>{fmt(line.spentCents)}</span>
            <span className="text-muted"> of {fmt(line.limitCents)}</span>
          </span>
          {actions}
        </span>
      </div>
      <div
        role="meter"
        aria-label={`${line.name} budget`}
        aria-valuemin={0}
        aria-valuemax={line.limitCents / 100}
        aria-valuenow={line.spentCents / 100}
        aria-valuetext={`${fmt(line.spentCents)} of ${fmt(line.limitCents)}, ${statusText(line)}`}
        className="h-2 w-full overflow-hidden rounded-full"
        style={{ background: `color-mix(in srgb, ${fill} 22%, var(--surface-1))` }}
      >
        <div className="h-full rounded-full" style={{ width: `${fillPercent}%`, background: fill }} />
      </div>
      <p className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-secondary)" }}>
        <StatusIcon state={state} />
        {statusText(line)}
      </p>
    </li>
  );
}
