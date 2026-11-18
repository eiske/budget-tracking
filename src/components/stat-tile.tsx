import type { ReactNode } from "react";
import { FitText } from "./fit-text";

export function StatTile({ label, value, children }: { label: string; value: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-hairline bg-surface p-5">
      <p className="text-sm text-ink-2">{label}</p>
      {/* Proportional figures (no tabular-nums): a standalone value, not a column. */}
      <FitText text={value} maxRem={1.5} minRem={1} />
      {children}
    </div>
  );
}
