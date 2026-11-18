/**
 * Parses a user-typed amount into integer cents.
 * Accepts "12", "12.5", "12,50", "1.234,56", "1,234.56", "R$ 1 234,56".
 * Returns null for invalid, zero or negative input (direction comes from the category).
 */
export function parseAmountToCents(input: string): number | null {
  // Strip only known currency symbols and whitespace; anything else (letters, "-") is invalid.
  const s = input.replace(/R\$|[$€£\s]/g, "");
  if (!/^[\d.,]+$/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");

  let decimalSep: "." | "," | null = null;
  if (lastDot !== -1 && lastComma !== -1) {
    // Both present: the one that appears last is the decimal separator.
    decimalSep = lastDot > lastComma ? "." : ",";
  } else if (lastDot !== -1 || lastComma !== -1) {
    const sep = lastDot !== -1 ? "." : ",";
    const count = s.split(sep).length - 1;
    const digitsAfter = s.length - s.lastIndexOf(sep) - 1;
    // A single separator followed by 1-2 digits is a decimal point; otherwise thousands.
    if (count === 1 && digitsAfter >= 1 && digitsAfter <= 2) decimalSep = sep;
  }

  let intPart = s;
  let fracPart = "";
  if (decimalSep) {
    const idx = s.lastIndexOf(decimalSep);
    intPart = s.slice(0, idx);
    fracPart = s.slice(idx + 1);
  }
  // Integer part: plain digits, or groups of exactly 3 digits split by one repeated separator.
  const grouped = /^\d{1,3}(?:([.,])\d{3}(?:\1\d{3})*)$/.test(intPart);
  if (intPart !== "" && !/^\d+$/.test(intPart) && !grouped) return null;
  if (fracPart && !/^\d{1,2}$/.test(fracPart)) return null;
  intPart = intPart.replace(/[.,]/g, "");

  const cents = Number(intPart || "0") * 100 + Number((fracPart + "0").slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents <= 0) return null;
  return cents;
}

/** Formats integer cents with Intl, e.g. 123456 -> "R$1,234.56". */
export function formatCents(cents: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency }).format(cents / 100);
}

/** Cents to a plain editable string for form inputs, e.g. 123456 -> "1234.56". */
export function centsToInputValue(cents: number): string {
  return (cents / 100).toFixed(2);
}
