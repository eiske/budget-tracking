"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { transactions } from "@/db/schema";
import { buildCandidates } from "@/lib/import/candidates";
import { defaultCategoryId, kindOfAmount, suggestCategory } from "@/lib/import/categorize";
import { csvToRows, detectFormats, detectMapping, parseCsvText, type DetectedMapping } from "@/lib/import/csv";
import { resolveDecision } from "@/lib/import/decisions";
import { looksLikeOfx, parseOfx } from "@/lib/import/ofx";
import {
  MAX_FILE_BYTES,
  MAX_ROWS,
  type Candidate,
  type DateFormat,
  type DecimalSeparator,
  type Formats,
  type RowError,
} from "@/lib/import/types";
import { existingImportHashes, listCategories, listCategoryRules } from "@/lib/queries";

// ---- shapes sent to the client ---------------------------------------------------------------

export type PreviewRow = {
  index: number;
  line: number;
  date: string;
  amountCents: number; // signed
  description: string;
  kind: "expense" | "income";
  /** new = can be imported; exists = already in the database; duplicate = repeated inside this file */
  status: "new" | "exists" | "duplicate";
  /** Category pre-selected for the row: a keyword-rule match, else the Other / Other income fallback. */
  suggestedCategoryId: number | null;
};

export type ImportPreview = {
  version: number; // changes on every analysis, so the client form remounts with fresh defaults
  fileName: string;
  fileKind: "csv" | "ofx";
  text: string; // sent back with the form; the server re-parses it on import and trusts nothing else
  headers: string[];
  mapping: DetectedMapping;
  formats: Formats;
  needsMapping: boolean;
  rows: PreviewRow[];
  errors: RowError[];
};

export type AnalyzeState = { error: string; preview?: undefined } | { error?: undefined; preview: ImportPreview } | null;
export type CommitState = { error: string } | null;

// ---- analysis (shared by preview and import) -------------------------------------------------

type Analysis =
  | { ok: false; error: string }
  | {
      ok: true;
      text: string;
      fileName: string;
      fileKind: "csv" | "ofx";
      headers: string[];
      mapping: DetectedMapping;
      formats: Formats;
      needsMapping: boolean;
      candidates: Candidate[];
      errors: RowError[];
    };

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

/** A column index sent by the form: "none" -> null, otherwise an integer within the header range. */
function readColumn(v: FormDataEntryValue | null, columns: number): number | null | undefined {
  const s = str(v);
  if (s === "") return undefined; // field absent: fall back to auto-detection
  if (s === "none") return null;
  if (!/^\d+$/.test(s) || Number(s) >= columns) return undefined;
  return Number(s);
}

async function analyze(formData: FormData): Promise<Analysis> {
  // 1. Get the text: a freshly uploaded file, or the text carried back by the preview form.
  let text: string;
  let fileName: string;
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_FILE_BYTES) return { ok: false, error: "That file is too large (limit 1.5 MB)." };
    text = await file.text();
    fileName = file.name.slice(0, 200);
  } else {
    text = str(formData.get("text"));
    fileName = str(formData.get("fileName")).slice(0, 200);
    if (!text) return { ok: false, error: "Choose a statement file (.csv or .ofx)." };
    if (text.length > MAX_FILE_BYTES) return { ok: false, error: "That file is too large (limit 1.5 MB)." };
  }
  if (text.includes("\u0000")) return { ok: false, error: "This does not look like a text file." };

  // 2. OFX needs no column mapping.
  if (looksLikeOfx(text)) {
    const { rows, errors } = parseOfx(text);
    if (rows.length > MAX_ROWS) return { ok: false, error: `Too many rows (limit ${MAX_ROWS}).` };
    return {
      ok: true, text, fileName, fileKind: "ofx", headers: [],
      mapping: { date: null, amount: null, description: null, id: null },
      formats: { dateFormat: "YMD", decimal: "." },
      needsMapping: false, candidates: buildCandidates(rows), errors,
    };
  }

  // 3. CSV: use the user's mapping and formats when present, else auto-detect.
  const table = parseCsvText(text);
  if (table.headers.length === 0) return { ok: false, error: "The file is empty." };
  if (table.rows.length > MAX_ROWS) return { ok: false, error: `Too many rows (limit ${MAX_ROWS}).` };

  const detected = detectMapping(table.headers);
  const cols = table.headers.length;
  const pick = (name: string, fallback: number | null, allowNone: boolean): number | null => {
    const v = readColumn(formData.get(name), cols);
    if (v === undefined || (v === null && !allowNone)) return fallback;
    return v;
  };
  const mapping: DetectedMapping = {
    date: pick("map_date", detected.date, false),
    amount: pick("map_amount", detected.amount, false),
    description: pick("map_description", detected.description, false),
    id: pick("map_id", detected.id, true),
  };

  const needsMapping = mapping.date === null || mapping.amount === null || mapping.description === null;
  const guess = needsMapping
    ? ({ dateFormat: "DMY", decimal: "." } as Formats)
    : detectFormats(table.rows, { date: mapping.date!, amount: mapping.amount! });
  const dateFormat = (["DMY", "MDY", "YMD"] as const).includes(str(formData.get("dateFormat")) as DateFormat)
    ? (str(formData.get("dateFormat")) as DateFormat)
    : guess.dateFormat;
  const decimal = ([".", ","] as const).includes(str(formData.get("decimal")) as DecimalSeparator)
    ? (str(formData.get("decimal")) as DecimalSeparator)
    : guess.decimal;
  const formats: Formats = { dateFormat, decimal };

  if (needsMapping) {
    return { ok: true, text, fileName, fileKind: "csv", headers: table.headers, mapping, formats, needsMapping, candidates: [], errors: [] };
  }
  const { rows, errors } = csvToRows(
    table,
    { date: mapping.date!, amount: mapping.amount!, description: mapping.description!, id: mapping.id },
    formats,
  );
  return { ok: true, text, fileName, fileKind: "csv", headers: table.headers, mapping, formats, needsMapping, candidates: buildCandidates(rows), errors };
}

// ---- actions --------------------------------------------------------------------------------

/** Reads the file (or re-reads it with new settings) and returns a preview. Writes nothing. */
export async function analyzeImport(_prev: AnalyzeState, formData: FormData): Promise<AnalyzeState> {
  const a = await analyze(formData);
  if (!a.ok) return { error: a.error };

  const existing = existingImportHashes(a.candidates.map((c) => c.hash));
  const categories = listCategories();
  const rules = listCategoryRules().map((r) => ({
    pattern: r.pattern, categoryId: r.categoryId, categoryKind: r.categoryKind,
  }));

  const rows: PreviewRow[] = a.candidates.map((c) => {
    const kind = kindOfAmount(c.amountCents);
    return {
      index: c.index,
      line: c.line,
      date: c.date,
      amountCents: c.amountCents,
      description: c.description,
      kind,
      status: existing.has(c.hash) ? "exists" : c.duplicateInFile ? "duplicate" : "new",
      suggestedCategoryId: suggestCategory(c.rawDescription, kind, rules) ?? defaultCategoryId(categories, kind),
    };
  });

  return {
    preview: {
      version: Date.now(),
      fileName: a.fileName,
      fileKind: a.fileKind,
      text: a.text,
      headers: a.headers,
      mapping: a.mapping,
      formats: a.formats,
      needsMapping: a.needsMapping,
      rows,
      errors: a.errors.slice(0, 50),
    },
  };
}

/**
 * Imports the rows the user kept. Everything is re-derived from the file text on the server; the
 * form only contributes, per row, a category id or "skip", and each choice is validated (the
 * category must exist and match the row's direction). All-or-nothing: any invalid choice aborts
 * before a single row is written. Re-importing is safe: rows already present are ignored.
 */
export async function commitImport(_prev: CommitState, formData: FormData): Promise<CommitState> {
  const a = await analyze(formData);
  if (!a.ok) return { error: a.error };
  if (a.needsMapping) return { error: "Choose the date, amount and description columns first." };

  const categories = listCategories();
  const existing = existingImportHashes(a.candidates.map((c) => c.hash));

  const toImport: { c: Candidate; categoryId: number }[] = [];
  const problems: string[] = [];
  let duplicates = 0;
  let skipped = 0;

  for (const c of a.candidates) {
    if (existing.has(c.hash) || c.duplicateInFile) {
      duplicates++;
      continue;
    }
    const choice = formData.get(`row_${c.index}`);
    const d = resolveDecision(c.amountCents, typeof choice === "string" ? choice : null, categories);
    if (d.type === "error") problems.push(`Line ${c.line}: ${d.message}`);
    else if (d.type === "skip") skipped++;
    else toImport.push({ c, categoryId: d.categoryId });
  }

  if (problems.length > 0) {
    const more = problems.length > 3 ? ` (and ${problems.length - 3} more)` : "";
    return { error: `Nothing was imported. ${problems.slice(0, 3).join("; ")}${more}` };
  }
  if (toImport.length === 0) {
    return { error: "Nothing to import: every row is skipped or already imported." };
  }

  let imported = 0;
  db.transaction((tx) => {
    for (const { c, categoryId } of toImport) {
      imported += tx
        .insert(transactions)
        .values({
          date: c.date,
          amountCents: Math.abs(c.amountCents),
          description: c.description,
          categoryId,
          source: "import",
          importHash: c.hash,
        })
        .onConflictDoNothing() // a concurrent/double submit hits the unique hash instead of duplicating
        .run().changes;
    }
  });
  duplicates += toImport.length - imported;

  revalidatePath("/transactions");
  revalidatePath("/");
  redirect(`/import?imported=${imported}&duplicates=${duplicates}&skipped=${skipped}`); // throws
}
