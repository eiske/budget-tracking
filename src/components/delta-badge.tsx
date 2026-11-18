import type { Delta } from "@/lib/domain/dashboard";

const TONE_COLOR = {
  good: "var(--good-text)",
  bad: "var(--bad-text)",
  neutral: "var(--text-muted)",
} as const;

/** Change vs a named period. Color is never alone: an arrow and words carry the same meaning. */
export function DeltaBadge({ delta, vs }: { delta: Delta; vs: string }) {
  const arrow = delta.direction === "up" ? "▲" : delta.direction === "down" ? "▼" : "–";
  const word = delta.direction === "up" ? "Up" : delta.direction === "down" ? "Down" : "No change";

  let amount: string;
  if (delta.direction === "flat") amount = "no change";
  else if (delta.percent === null) amount = "new";
  else if (delta.percent === 0) amount = "<1%";
  else amount = `${delta.percent}%`;

  return (
    <span className="inline-flex items-baseline gap-1.5 text-sm" style={{ color: TONE_COLOR[delta.tone] }}>
      <span aria-hidden className="text-xs">{arrow}</span>
      <span className="sr-only">{word}</span>
      <span>{amount}</span>
      <span className="text-muted">vs {vs}</span>
    </span>
  );
}
