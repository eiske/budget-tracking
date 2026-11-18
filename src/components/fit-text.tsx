/**
 * A standalone figure that never overflows its container: the font grows to `maxRem` when there
 * is room and shrinks (down to `minRem`) to fit the available width, using a container query.
 * 0.68em is a safe upper bound for the width of one bold digit/separator.
 */
export function FitText({
  text,
  maxRem,
  minRem,
  className = "",
}: {
  text: string;
  maxRem: number;
  minRem: number;
  className?: string;
}) {
  const perCharEm = 0.68;
  return (
    <div style={{ containerType: "inline-size" }}>
      <p
        className={`whitespace-nowrap font-semibold leading-tight ${className}`}
        style={{
          color: "var(--text-primary)",
          fontSize: `clamp(${minRem}rem, calc(100cqw / ${(text.length * perCharEm).toFixed(2)}), ${maxRem}rem)`,
        }}
      >
        {text}
      </p>
    </div>
  );
}
