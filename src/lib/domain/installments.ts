import { daysInMonth } from "./dates";

export const MAX_INSTALLMENTS = 60;

export type Installment = { number: number; date: string; amountCents: number };

/**
 * Splits a total into `count` parts that add up EXACTLY to the total. The leftover cents go one
 * each to the first installments (100.00 / 3 -> 33.34, 33.33, 33.33), so no cent is lost or invented.
 */
export function splitAmount(totalCents: number, count: number): number[] {
  if (!Number.isInteger(totalCents) || !Number.isInteger(count) || count < 1 || totalCents < count) {
    throw new RangeError("Need an integer total of at least 1 cent per installment");
  }
  const base = Math.floor(totalCents / count);
  const extra = totalCents % count;
  return Array.from({ length: count }, (_, i) => base + (i < extra ? 1 : 0));
}

/**
 * The date `offsetMonths` after `startDate`, keeping the ORIGINAL day-of-month and clamping to the
 * month's length. Computed from the start (not chained), so Jan 31 -> Feb 28 -> Mar 31, not Mar 28.
 */
export function installmentDate(startDate: string, offsetMonths: number): string {
  const [y, m, d] = startDate.split("-").map(Number);
  const index = y * 12 + (m - 1) + offsetMonths;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  const day = Math.min(d, daysInMonth(year, month));
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** All installments of a purchase: monthly dates starting on `date`, amounts summing to the total. */
export function buildInstallments(date: string, totalCents: number, count: number): Installment[] {
  const amounts = splitAmount(totalCents, count);
  return amounts.map((amountCents, i) => ({ number: i + 1, date: installmentDate(date, i), amountCents }));
}
