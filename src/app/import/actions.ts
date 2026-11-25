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
  MAX_FILES,
  MAX_ROWS,
  MAX_TOTAL_BYTES,
  type Candidate,
  type DateFormat,
  type DecimalSeparator,
  type Formats,
  type RowError,
} from "@/lib/import/types";
import { existingImportHashes, listCategories, listCategoryRules } from "@/lib/queries";

// ---- shapes sent to the client ---------------------------------------------------------------

export type PreviewRow = {
  file: number; // position of the file in the selection
  index: number; // position among that file's parsed rows
  line: number;
  date: string;
  amountCents: number; // signed
  description: string;
  kind: "expense" | "income";
  /** new = can be imported; exists = already in the database; duplicate = repeated in the selected files */
  status: "new" | "exists" | "duplicate";
  /** Category pre-selected for the row: a keyword-rule match, else the Other / Other income fallback. */
  suggestedCategoryId: number | null;
};

export type FilePreview = {
  fileName: string;
  fileKind: "csv" | "ofx";
  text: string; // sent back with the form; the server re-parses it on import and trusts nothing else
  headers: string[];
  mapping: DetectedMapping;
  formats: Formats;
  needsMapping: boolean;
  errors: RowError[];
};

export type ImportPreview = {
  version: number; // changes on every analysis, so the client form remounts with fresh defaults
  files: FilePreview[];
  rows: PreviewRow[];
};

export type AnalyzeState = { error: string; preview?: undefined } | { error?: undefined; preview: ImportPreview } | null;
export type CommitState = { error: string } | null;

// ---- analysis (shared by preview and import) -------------------------------------------------

type FileAnalysis = {
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

type Analysis = { ok: false; error: string } | { ok: true; files: FileAnalysis[] };

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");
const tooLarge = (name: string) =>
  `${name ? `"${name}"` : "That file"} is too large (limit 1.5 MB per file).`;

/** Form field prefix for a file's settings, so each CSV in the selection keeps its own mapping. */
const prefix = (file: number) => `f${file}_`;

/** A column index sent by the form: "none" -> null, otherwise an integer within the header range. */
function readColumn(v: FormDataEntryValue | null, columns: number): number | null | undefined {
  const s = str(v);
  if (s === "") return undefined; // field absent: fall back to auto-detection
  if (s === "none") return null;
  if (!/^\d+$/.test(s) || Number(s) >= columns) return undefined;
  return Number(s);
}

/** Reads one file's text. Settings come from the form fields named with that file's prefix. */
function analyzeFile(text: string, fileName: string, formData: FormData, p: string): FileAnalysis | string {
  const named = fileName ? `"${fileName}"` : "This file";
  if (text.includes("\u0000")) return `${named} does not look like a text file.`;

  // OFX needs no column mapping.
  if (looksLikeOfx(text)) {
    const { rows, errors } = parseOfx(text);
    return {
      text, fileName, fileKind: "ofx", headers: [],
      mapping: { date: null, amount: null, description: null, id: null },
      formats: { dateFormat: "YMD", decimal: "." },
      needsMapping: false, candidates: buildCandidates(rows), errors,
    };
  }

  // CSV: use the user's mapping and formats when present, else auto-detect.
  const table = parseCsvText(text);
  if (table.headers.length === 0) return `${named} is empty.`;
  if (table.rows.length > MAX_ROWS) return `Too many rows (limit ${MAX_ROWS}).`;

  const detected = detectMapping(table.headers);
  const cols = table.headers.length;
  const pick = (name: string, fallback: number | null, allowNone: boolean): number | null => {
    const v = readColumn(formData.get(p + name), cols);
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
  const sentDate = str(formData.get(p + "dateFormat"));
  const sentDecimal = str(formData.get(p + "decimal"));
  const dateFormat = (["DMY", "MDY", "YMD"] as const).includes(sentDate as DateFormat) ? (sentDate as DateFormat) : guess.dateFormat;
  const decimal = ([".", ","] as const).includes(sentDecimal as DecimalSeparator) ? (sentDecimal as DecimalSeparator) : guess.decimal;
  const formats: Formats = { dateFormat, decimal };

  if (needsMapping) {
    return { text, fileName, fileKind: "csv", headers: table.headers, mapping, formats, needsMapping, candidates: [], errors: [] };
  }
  const { rows, errors } = csvToRows(
    table,
    { date: mapping.date!, amount: mapping.amount!, description: mapping.description!, id: mapping.id },
    formats,
  );
  return { text, fileName, fileKind: "csv", headers: table.headers, mapping, formats, needsMapping, candidates: buildCandidates(rows), errors };
}

async function analyze(formData: FormData): Promise<Analysis> {
  // 1. Get the texts: freshly uploaded files, or the texts carried back by the preview form.
  const sources: { text: string; fileName: string }[] = [];
  const uploads = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (uploads.length > MAX_FILES) return { ok: false, error: `Choose at most ${MAX_FILES} files at a time.` };
  if (uploads.length > 0) {
    for (const file of uploads) {
      const fileName = file.name.slice(0, 200);
      if (file.size > MAX_FILE_BYTES) return { ok: false, error: tooLarge(fileName) };
      sources.push({ text: await file.text(), fileName });
    }
  } else {
    const count = Number(str(formData.get("fileCount")));
    if (!Number.isInteger(count) || count < 1 || count > MAX_FILES) {
      return { ok: false, error: "Choose a statement file (.csv or .ofx)." };
    }
    for (let i = 0; i < count; i++) {
      const text = str(formData.get(prefix(i) + "text"));
      const fileName = str(formData.get(prefix(i) + "fileName")).slice(0, 200);
      if (!text) return { ok: false, error: "Choose a statement file (.csv or .ofx)." };
      if (text.length > MAX_FILE_BYTES) return { ok: false, error: tooLarge(fileName) };
      sources.push({ text, fileName });
    }
  }
  if (sources.reduce((n, s) => n + Buffer.byteLength(s.text), 0) > MAX_TOTAL_BYTES) {
    return { ok: false, error: "The selected files are too large together (limit 3 MB). Import them in smaller groups." };
  }

  // 2. Each file is parsed on its own, so its dedupe hashes match importing it alone.
  const files: FileAnalysis[] = [];
  for (const [i, s] of sources.entries()) {
    const a = analyzeFile(s.text, s.fileName, formData, prefix(i));
    if (typeof a === "string") return { ok: false, error: a };
    files.push(a);
  }
  if (files.reduce((n, f) => n + f.candidates.length, 0) > MAX_ROWS) {
    return { ok: false, error: `Too many rows (limit ${MAX_ROWS} across all files).` };
  }

  // 3. Overlapping statements: a row whose hash appeared in an earlier file is a duplicate.
  const seen = new Set<string>();
  for (const f of files) {
    const local = new Set<string>();
    for (const c of f.candidates) {
      if (seen.has(c.hash)) c.duplicateInFile = true;
      local.add(c.hash);
    }
    for (const h of local) seen.add(h);
  }
  return { ok: true, files };
}

const allCandidates = (files: FileAnalysis[]) => files.flatMap((f, file) => f.candidates.map((c) => ({ file, c })));

// ---- actions --------------------------------------------------------------------------------

/** Reads the files (or re-reads them with new settings) and returns a preview. Writes nothing. */
export async function analyzeImport(_prev: AnalyzeState, formData: FormData): Promise<AnalyzeState> {
  const a = await analyze(formData);
  if (!a.ok) return { error: a.error };

  const all = allCandidates(a.files);
  const existing = existingImportHashes(all.map(({ c }) => c.hash));
  const categories = listCategories();
  const rules = listCategoryRules().map((r) => ({
    pattern: r.pattern, categoryId: r.categoryId, categoryKind: r.categoryKind,
  }));

  const rows: PreviewRow[] = all.map(({ file, c }) => {
    const kind = kindOfAmount(c.amountCents);
    return {
      file,
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
      files: a.files.map((f) => ({
        fileName: f.fileName,
        fileKind: f.fileKind,
        text: f.text,
        headers: f.headers,
        mapping: f.mapping,
        formats: f.formats,
        needsMapping: f.needsMapping,
        errors: f.errors.slice(0, 50),
      })),
      rows,
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
  if (a.files.some((f) => f.needsMapping)) return { error: "Choose the date, amount and description columns first." };

  const categories = listCategories();
  const all = allCandidates(a.files);
  const existing = existingImportHashes(all.map(({ c }) => c.hash));
  const where = (file: number, line: number) =>
    a.files.length > 1 ? `${a.files[file].fileName || `File ${file + 1}`}, line ${line}` : `Line ${line}`;

  const toImport: { c: Candidate; categoryId: number }[] = [];
  const problems: string[] = [];
  let duplicates = 0;
  let skipped = 0;

  for (const { file, c } of all) {
    if (existing.has(c.hash) || c.duplicateInFile) {
      duplicates++;
      continue;
    }
    const choice = formData.get(`row_${file}_${c.index}`);
    const d = resolveDecision(c.amountCents, typeof choice === "string" ? choice : null, categories);
    if (d.type === "error") problems.push(`${where(file, c.line)}: ${d.message}`);
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
