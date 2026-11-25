/** One statement line, already parsed. Amount is SIGNED: negative = money out, positive = money in. */
export type RawRow = {
  line: number; // human line number in the source, for error messages
  date: string; // YYYY-MM-DD
  amountCents: number;
  description: string;
  externalId: string | null; // the bank's own id for the line, when the file has one
};

export type RowError = { line: number; message: string };

/** Column positions in a CSV. `id` is optional; the others are required. */
export type ColumnMapping = { date: number; amount: number; description: number; id: number | null };

export type DateFormat = "DMY" | "MDY" | "YMD";
export type DecimalSeparator = "." | ",";
export type Formats = { dateFormat: DateFormat; decimal: DecimalSeparator };

export type Candidate = {
  /** Position among parsed rows. Stable for the same file + settings, so a form can refer to it. */
  index: number;
  line: number;
  date: string;
  amountCents: number; // signed
  description: string; // shortened, what gets stored
  rawDescription: string; // full text, used only for keyword rules
  hash: string; // dedupe key stored in transactions.import_hash
  duplicateInFile: boolean; // same hash seen earlier in this file (or in an earlier file of the same import)
};

export const MAX_FILE_BYTES = 1.5 * 1024 * 1024;
export const MAX_ROWS = 5000; // per import, across all files
export const MAX_FILES = 10;
/** All files together. The import form re-sends every text, so this must stay under the server action body limit (next.config). */
export const MAX_TOTAL_BYTES = 3 * 1024 * 1024;
