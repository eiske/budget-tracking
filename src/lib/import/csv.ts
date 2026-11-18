import Papa from "papaparse";
import { isValidDate } from "../domain/dates";
import { normalizeText } from "./categorize";
import type { ColumnMapping, DateFormat, DecimalSeparator, Formats, RawRow, RowError } from "./types";

export type CsvTable = { headers: string[]; rows: string[][] };

/** First row is the header. Blank lines are dropped; the delimiter (comma, semicolon, tab) is detected. */
export function parseCsvText(text: string): CsvTable {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy" });
  const data = parsed.data.filter((r) => r.some((c) => c.trim() !== ""));
  if (data.length === 0) return { headers: [], rows: [] };
  const [headers, ...rows] = data;
  return { headers: headers.map((h) => h.trim()), rows };
}

// ---- column detection --------------------------------------------------------------------

const DATE_NAMES = ["data", "date", "dt", "data lancamento", "data da transacao", "data transacao", "posted date", "booking date"];
const AMOUNT_NAMES = ["valor", "amount", "montante", "value", "valor (r$)", "quantia"];
const DESC_NAMES = ["descricao", "description", "historico", "memo", "lancamento", "detalhes", "estabelecimento", "title", "titulo"];
const ID_NAMES = ["identificador", "id", "fitid", "transaction id", "id da transacao", "id transacao", "codigo"];

export type DetectedMapping = { date: number | null; amount: number | null; description: number | null; id: number | null };

/** Guesses which column is which from header names (accent- and case-insensitive). */
export function detectMapping(headers: string[]): DetectedMapping {
  const names = headers.map(normalizeText);
  const used = new Set<number>();
  const find = (candidates: string[]): number | null => {
    for (const c of candidates) {
      const i = names.findIndex((n, idx) => n === c && !used.has(idx));
      if (i !== -1) { used.add(i); return i; }
    }
    return null;
  };
  // Order matters: pick the specific roles before the generic "id"/"codigo".
  const date = find(DATE_NAMES);
  const amount = find(AMOUNT_NAMES);
  const description = find(DESC_NAMES);
  const id = find(ID_NAMES);
  return { date, amount, description, id };
}

// ---- format detection --------------------------------------------------------------------

/** Suggests date and decimal formats from the data. Only a suggestion: the user can override. */
export function detectFormats(rows: string[][], mapping: Pick<ColumnMapping, "date" | "amount">): Formats {
  const sample = rows.slice(0, 200);

  let dateFormat: DateFormat = "DMY"; // Brazilian default when the data cannot tell
  let sawFirstOver12 = false;
  let sawSecondOver12 = false;
  let sawYearFirst = false;
  for (const row of sample) {
    const m = /^\s*(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})/.exec(row[mapping.date] ?? "");
    if (!m) continue;
    if (m[1].length === 4) sawYearFirst = true;
    else {
      if (Number(m[1]) > 12) sawFirstOver12 = true;
      if (Number(m[2]) > 12) sawSecondOver12 = true;
    }
  }
  if (sawYearFirst) dateFormat = "YMD";
  else if (sawSecondOver12 && !sawFirstOver12) dateFormat = "MDY";

  let commaStyle = 0;
  let dotStyle = 0;
  for (const row of sample) {
    const v = (row[mapping.amount] ?? "").trim();
    if (/,\d{1,2}\D*$/.test(v)) commaStyle++;
    else if (/\.\d{1,2}\D*$/.test(v)) dotStyle++;
  }
  const decimal: DecimalSeparator = commaStyle > dotStyle ? "," : ".";

  return { dateFormat, decimal };
}

// ---- value parsing -----------------------------------------------------------------------

/** "01/10/2026" + DMY -> "2026-10-01". Null for impossible dates (30/02) or 2-digit years. */
export function parseDate(raw: string, format: DateFormat): string | null {
  const m = /^\s*(\d{1,4})[/.-](\d{1,2})[/.-](\d{1,4})(?:[ T].*)?$/.exec(raw);
  if (!m) return null;
  const [a, b, c] = [m[1], m[2], m[3]];
  let y: string, mo: string, d: string;
  if (format === "YMD") [y, mo, d] = [a, b, c];
  else if (format === "DMY") [d, mo, y] = [a, b, c];
  else [mo, d, y] = [a, b, c];
  if (y.length !== 4) return null;
  const iso = `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  return isValidDate(iso) ? iso : null;
}

/**
 * Strict signed amount -> integer cents. The decimal separator is GIVEN, never guessed per value,
 * so "1.234" with "." means 1.234 (invalid: 3 decimals), not 1234. Accepts "-4883.90", "(10,00)",
 * "10,00-", "R$ 1.234,56". Returns null when invalid; 0 is returned as 0 so callers can flag it.
 */
export function parseSignedAmount(raw: string, decimal: DecimalSeparator): number | null {
  let s = raw.replace(/R\$|[\s ]/g, "");
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  if (s.startsWith("-")) { negative = true; s = s.slice(1); }
  else if (s.startsWith("+")) s = s.slice(1);
  if (s.endsWith("-")) { negative = true; s = s.slice(0, -1); }

  const dec = decimal === "." ? "\\." : ",";
  const thou = decimal === "." ? "," : "\\.";
  const shape = new RegExp(`^(\\d{1,3}(?:${thou}\\d{3})+|\\d+)(?:${dec}(\\d{1,2}))?$`);
  const m = shape.exec(s);
  if (!m) return null;

  const whole = Number(m[1].replace(/[.,]/g, ""));
  const cents = whole * 100 + Number(((m[2] ?? "") + "00").slice(0, 2));
  if (!Number.isSafeInteger(cents)) return null;
  return negative ? -cents : cents;
}

// ---- table -> rows -----------------------------------------------------------------------

/** Applies a mapping to every data row. Bad rows become errors; good rows are kept. */
export function csvToRows(
  table: CsvTable,
  mapping: ColumnMapping,
  formats: Formats,
): { rows: RawRow[]; errors: RowError[] } {
  const rows: RawRow[] = [];
  const errors: RowError[] = [];

  table.rows.forEach((cells, i) => {
    const line = i + 2; // header is line 1
    const cell = (col: number | null) => (col === null ? "" : (cells[col] ?? "").trim());

    const date = parseDate(cell(mapping.date), formats.dateFormat);
    if (!date) return void errors.push({ line, message: `Invalid date "${cell(mapping.date)}"` });

    const amountCents = parseSignedAmount(cell(mapping.amount), formats.decimal);
    if (amountCents === null) return void errors.push({ line, message: `Invalid amount "${cell(mapping.amount)}"` });
    if (amountCents === 0) return void errors.push({ line, message: "Amount is zero" });

    const description = cell(mapping.description);
    if (!description) return void errors.push({ line, message: "Missing description" });

    rows.push({ line, date, amountCents, description, externalId: cell(mapping.id) || null });
  });

  return { rows, errors };
}
