"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from "recharts";

export type MonthPoint = {
  month: string; // YYYY-MM
  label: string; // "Nov"
  longLabel: string; // "November 2026"
  expenseCents: number;
  selected: boolean;
};

type Props = { data: MonthPoint[]; currency: string; locale: string };

/**
 * Expense per month. Emphasis form: the selected month wears the accent hue, the rest are
 * gray context. Single series, so no legend box; the card title names what is plotted.
 */
export function MonthlyChart({ data, currency, locale }: Props) {
  const full = new Intl.NumberFormat(locale, { style: "currency", currency });
  const compact = new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
  const toMoney = (cents: number) => full.format(cents / 100);

  const rows = data.map((d) => ({ ...d, expense: d.expenseCents / 100 }));
  const selectedIndex = rows.findIndex((r) => r.selected);

  return (
    <div role="img" aria-label={`Monthly spending, last ${rows.length} months. Values are listed in the table below.`}>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={rows} margin={{ top: 20, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" strokeWidth={1} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={{ stroke: "var(--baseline)" }}
            tick={{ fill: "var(--text-muted)", fontSize: 12 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            tickFormatter={(v: number) => compact.format(v)}
            tick={{ fill: "var(--text-muted)", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: "var(--ghost)" }}
            content={(props: TooltipContentProps) => <MonthTooltip {...props} toMoney={toMoney} />}
          />
          {/* maxBarSize 24px; 4px rounded data end, square at the baseline. */}
          <Bar dataKey="expense" maxBarSize={24} radius={[4, 4, 0, 0]} isAnimationActive={false}>
            {rows.map((r) => (
              <Cell key={r.month} fill={r.selected ? "var(--series-1)" : "var(--deemph)"} />
            ))}
            {/* Label only the bar the story is about; the rest live in the tooltip and table. */}
            <LabelList
              dataKey="expense"
              position="top"
              content={(p) => {
                const { x, y, width, index } = p as { x: number; y: number; width: number; index: number };
                if (index !== selectedIndex) return null;
                return (
                  // The selected month is always the last bar, so anchor the label to the bar's
                  // right edge and let it extend left; centered, it clips on narrow screens.
                  <text
                    x={Number(x) + Number(width)}
                    y={Number(y) - 6}
                    textAnchor="end"
                    fontSize={12}
                    fontWeight={600}
                    fill="var(--text-primary)"
                  >
                    {toMoney(rows[index].expenseCents)}
                  </text>
                );
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function MonthTooltip({
  active,
  payload,
  toMoney,
}: TooltipContentProps & { toMoney: (cents: number) => string }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as MonthPoint;
  return (
    <div
      className="rounded-md border px-3 py-2 text-sm shadow-sm"
      style={{ background: "var(--surface-1)", borderColor: "var(--hairline)" }}
    >
      <div style={{ color: "var(--text-secondary)" }}>{point.longLabel}</div>
      <div className="flex items-center gap-2">
        {/* line key, not a box */}
        <span aria-hidden className="inline-block h-0.5 w-3" style={{ background: "var(--series-1)" }} />
        <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
          {toMoney(point.expenseCents)}
        </span>
        <span style={{ color: "var(--text-secondary)" }}>spent</span>
      </div>
    </div>
  );
}
