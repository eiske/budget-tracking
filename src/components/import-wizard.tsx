"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  analyzeImport,
  commitImport,
  type AnalyzeState,
  type CommitState,
  type FilePreview,
  type ImportPreview,
} from "@/app/import/actions";
import { CURRENCY, LOCALE } from "@/lib/config";
import { formatCents } from "@/lib/domain/money";

type Category = { id: number; name: string; kind: "expense" | "income" };

const field =
  "rounded-md border border-neutral-300 bg-transparent px-2 py-1.5 text-sm dark:border-neutral-700";
const card = "flex flex-col gap-4 rounded-xl border border-hairline bg-surface p-5";

export function ImportWizard({ categories }: { categories: Category[] }) {
  const [analysis, analyze, analyzing] = useActionState<AnalyzeState, FormData>(analyzeImport, null);
  const [commitState, commit, committing] = useActionState<CommitState, FormData>(commitImport, null);
  const preview = analysis?.preview;

  return (
    <div className="flex flex-col gap-6">
      <form action={analyze} className={card}>
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-semibold">1. Choose statement files</span>
          <input type="file" name="file" accept=".csv,.ofx,.qfx,.txt,text/csv" multiple required className="text-sm" />
          <span className="text-xs text-muted">
            CSV or OFX, one or more at a time (up to 10 files, 1.5 MB each). Files are read by this app only; nothing
            is uploaded elsewhere.
          </span>
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={analyzing}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {analyzing ? "Reading…" : "Read files"}
          </button>
          {analysis?.error && <p role="alert" className="text-sm text-red-600">{analysis.error}</p>}
        </div>
      </form>

      {preview && (
        <PreviewForm
          key={preview.version}
          preview={preview}
          categories={categories}
          analyze={analyze}
          commit={commit}
          committing={committing}
          commitError={commitState?.error}
        />
      )}
    </div>
  );
}

function PreviewForm({
  preview,
  categories,
  analyze,
  commit,
  committing,
  commitError,
}: {
  preview: ImportPreview;
  categories: Category[];
  analyze: (formData: FormData) => void;
  commit: (formData: FormData) => void;
  committing: boolean;
  commitError?: string;
}) {
  const fmt = (c: number) => formatCents(Math.abs(c), CURRENCY, LOCALE);
  const multi = preview.files.length > 1;
  const fresh = preview.rows.filter((r) => r.status === "new").length;
  const existing = preview.rows.filter((r) => r.status === "exists").length;
  const repeated = preview.rows.filter((r) => r.status === "duplicate").length;
  const errorCount = preview.files.reduce((n, f) => n + f.errors.length, 0);
  const needsMapping = preview.files.some((f) => f.needsMapping);
  const expenseCats = categories.filter((c) => c.kind === "expense");
  const incomeCats = categories.filter((c) => c.kind === "income");
  const fileLabel = (i: number) => preview.files[i].fileName || `File ${i + 1}`;

  return (
    <form action={commit} className={card}>
      <input type="hidden" name="fileCount" value={preview.files.length} />
      {preview.files.map((f, i) => (
        <span key={i} hidden>
          <input type="hidden" name={`f${i}_text`} value={f.text} />
          <input type="hidden" name={`f${i}_fileName`} value={f.fileName} />
        </span>
      ))}

      <div>
        <h2 className="font-semibold">
          2. Review{" "}
          {multi ? (
            <span className="font-normal text-muted">· {preview.files.length} files</span>
          ) : (
            preview.files[0].fileName && <span className="font-normal text-muted">· {preview.files[0].fileName}</span>
          )}
        </h2>
        <p className="mt-1 text-sm text-ink-2">
          {preview.rows.length} rows read: {fresh} new
          {existing > 0 && `, ${existing} already imported`}
          {repeated > 0 && `, ${repeated} repeated ${multi ? "across the files" : "in the file"}`}
          {errorCount > 0 && `, ${errorCount} with problems`}.
        </p>
      </div>

      {preview.files.map((f, i) =>
        f.fileKind === "csv" ? (
          <ColumnSettings key={i} file={f} p={`f${i}_`} title={multi ? fileLabel(i) : undefined} analyze={analyze} />
        ) : null,
      )}

      {errorCount > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-red-600">
            {errorCount} {errorCount === 1 ? "row" : "rows"} could not be read and will be left out
          </summary>
          <ul className="mt-2 list-disc pl-5 text-ink-2">
            {preview.files
              .flatMap((f, i) => f.errors.map((e) => ({ ...e, file: i })))
              .slice(0, 10)
              .map((e, i) => (
                <li key={i}>
                  {multi && `${fileLabel(e.file)}${e.line > 0 ? ", " : ": "}`}
                  {e.line > 0 ? `${multi ? "line" : "Line"} ${e.line}: ` : ""}
                  {e.message}
                </li>
              ))}
          </ul>
        </details>
      )}

      {preview.rows.length > 0 && (
        <>
          <p className="text-xs text-muted">
            Categories are suggested from your <Link href="/rules" className="underline">keyword rules</Link>. Choose
            “Skip” for rows that are not real spending or income, such as transfers between your own accounts,
            investments or credit-card bill payments.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-muted">
                  <th className="py-2 font-medium">Date</th>
                  {multi && <th className="font-medium">File</th>}
                  <th className="font-medium">Description</th>
                  <th className="pr-3 text-right font-medium">Amount</th>
                  <th className="font-medium">Category</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={`${r.file}-${r.index}`} className="border-b border-hairline align-top">
                    <td className="whitespace-nowrap py-2 pr-3">{r.date}</td>
                    {multi && <td className="max-w-40 truncate pr-3 text-muted" title={fileLabel(r.file)}>{fileLabel(r.file)}</td>}
                    <td className="pr-3">{r.description}</td>
                    <td className={`whitespace-nowrap pr-3 text-right tabular-nums ${r.kind === "income" ? "text-green-600" : ""}`}>
                      {r.kind === "income" ? "+" : "−"}{fmt(r.amountCents)}
                    </td>
                    <td className="py-1.5">
                      {r.status === "new" ? (
                        <select
                          name={`row_${r.file}_${r.index}`}
                          defaultValue={r.suggestedCategoryId === null ? "skip" : String(r.suggestedCategoryId)}
                          className={`${field} w-48`}
                          aria-label={`Category for ${r.description}`}
                        >
                          {(r.kind === "expense" ? expenseCats : incomeCats).map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                          <option value="skip">Skip this row</option>
                        </select>
                      ) : (
                        <span className="text-muted">
                          {r.status === "exists" ? "Already imported" : multi ? "Repeated in the files" : "Repeated in this file"}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={committing || fresh === 0 || needsMapping}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {committing ? "Importing…" : "Import selected rows"}
        </button>
        {fresh === 0 && !needsMapping && preview.rows.length > 0 && (
          <span className="text-sm text-muted">Every row is already in the app.</span>
        )}
        {commitError && <p role="alert" className="text-sm text-red-600">{commitError}</p>}
      </div>
    </form>
  );
}

/** Column mapping and formats for one CSV. Field names carry the file's prefix (f0_, f1_, …). */
function ColumnSettings({
  file,
  p,
  title,
  analyze,
}: {
  file: FilePreview;
  p: string;
  title?: string;
  analyze: (formData: FormData) => void;
}) {
  const columnSelect = (name: string, value: number | null, allowNone: boolean, label: string) => (
    <label className="flex flex-col gap-1 text-xs">
      {label}
      <select name={p + name} defaultValue={value === null ? (allowNone ? "none" : "") : String(value)} className={field}>
        {allowNone ? <option value="none">None</option> : <option value="" disabled>Choose…</option>}
        {file.headers.map((h, i) => (
          <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
        ))}
      </select>
    </label>
  );

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-medium">
        Columns and formats{title && <span className="font-normal text-muted"> · {title}</span>}
      </legend>
      <div className="flex flex-wrap items-end gap-3">
        {columnSelect("map_date", file.mapping.date, false, "Date")}
        {columnSelect("map_amount", file.mapping.amount, false, "Amount")}
        {columnSelect("map_description", file.mapping.description, false, "Description")}
        {columnSelect("map_id", file.mapping.id, true, "Unique id (optional)")}
        <label className="flex flex-col gap-1 text-xs">
          Date format
          <select name={p + "dateFormat"} defaultValue={file.needsMapping ? "" : file.formats.dateFormat} className={field}>
            {/* Before the columns are known nothing could be detected: let the next read detect it. */}
            {file.needsMapping && <option value="">Auto-detect</option>}
            <option value="DMY">DD/MM/YYYY</option>
            <option value="MDY">MM/DD/YYYY</option>
            <option value="YMD">YYYY-MM-DD</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs">
          Decimal separator
          <select name={p + "decimal"} defaultValue={file.needsMapping ? "" : file.formats.decimal} className={field}>
            {file.needsMapping && <option value="">Auto-detect</option>}
            <option value=".">Dot (1234.56)</option>
            <option value=",">Comma (1234,56)</option>
          </select>
        </label>
        {/* Submit buttons ahead of "Import", so pressing Enter re-reads instead of importing. */}
        <button type="submit" formAction={analyze} className={`${field} font-medium`}>Update preview</button>
      </div>
      {file.needsMapping && (
        <p role="alert" className="text-sm text-red-600">
          Could not tell which columns hold the date, amount and description{title ? ` in ${title}` : ""}. Choose
          them, then update the preview.
        </p>
      )}
    </fieldset>
  );
}
