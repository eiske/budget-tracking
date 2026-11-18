"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  analyzeImport,
  commitImport,
  type AnalyzeState,
  type CommitState,
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
          <span className="font-semibold">1. Choose a statement file</span>
          <input type="file" name="file" accept=".csv,.ofx,.qfx,.txt,text/csv" required className="text-sm" />
          <span className="text-xs text-muted">CSV or OFX, up to 1.5 MB. The file is read by this app only; nothing is uploaded elsewhere.</span>
        </label>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={analyzing}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {analyzing ? "Reading…" : "Read file"}
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
  const fresh = preview.rows.filter((r) => r.status === "new").length;
  const existing = preview.rows.filter((r) => r.status === "exists").length;
  const repeated = preview.rows.filter((r) => r.status === "duplicate").length;
  const expenseCats = categories.filter((c) => c.kind === "expense");
  const incomeCats = categories.filter((c) => c.kind === "income");

  const columnSelect = (name: string, value: number | null, allowNone: boolean, label: string) => (
    <label className="flex flex-col gap-1 text-xs">
      {label}
      <select name={name} defaultValue={value === null ? (allowNone ? "none" : "") : String(value)} className={field}>
        {allowNone ? <option value="none">None</option> : <option value="" disabled>Choose…</option>}
        {preview.headers.map((h, i) => (
          <option key={i} value={i}>{h || `Column ${i + 1}`}</option>
        ))}
      </select>
    </label>
  );

  return (
    <form action={commit} className={card}>
      <input type="hidden" name="text" value={preview.text} />
      <input type="hidden" name="fileName" value={preview.fileName} />

      <div>
        <h2 className="font-semibold">2. Review {preview.fileName && <span className="font-normal text-muted">· {preview.fileName}</span>}</h2>
        <p className="mt-1 text-sm text-ink-2">
          {preview.rows.length} rows read: {fresh} new
          {existing > 0 && `, ${existing} already imported`}
          {repeated > 0 && `, ${repeated} repeated in the file`}
          {preview.errors.length > 0 && `, ${preview.errors.length} with problems`}.
        </p>
      </div>

      {preview.fileKind === "csv" && (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-medium">Columns and formats</legend>
          <div className="flex flex-wrap items-end gap-3">
            {columnSelect("map_date", preview.mapping.date, false, "Date")}
            {columnSelect("map_amount", preview.mapping.amount, false, "Amount")}
            {columnSelect("map_description", preview.mapping.description, false, "Description")}
            {columnSelect("map_id", preview.mapping.id, true, "Unique id (optional)")}
            <label className="flex flex-col gap-1 text-xs">
              Date format
              <select name="dateFormat" defaultValue={preview.needsMapping ? "" : preview.formats.dateFormat} className={field}>
                {/* Before the columns are known nothing could be detected: let the next read detect it. */}
                {preview.needsMapping && <option value="">Auto-detect</option>}
                <option value="DMY">DD/MM/YYYY</option>
                <option value="MDY">MM/DD/YYYY</option>
                <option value="YMD">YYYY-MM-DD</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs">
              Decimal separator
              <select name="decimal" defaultValue={preview.needsMapping ? "" : preview.formats.decimal} className={field}>
                {preview.needsMapping && <option value="">Auto-detect</option>}
                <option value=".">Dot (1234.56)</option>
                <option value=",">Comma (1234,56)</option>
              </select>
            </label>
            {/* First submit button in the form, so pressing Enter re-reads instead of importing. */}
            <button type="submit" formAction={analyze} className={`${field} font-medium`}>Update preview</button>
          </div>
          {preview.needsMapping && (
            <p role="alert" className="text-sm text-red-600">
              Could not tell which columns hold the date, amount and description. Choose them, then update the preview.
            </p>
          )}
        </fieldset>
      )}

      {preview.errors.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-red-600">
            {preview.errors.length} {preview.errors.length === 1 ? "row" : "rows"} could not be read and will be left out
          </summary>
          <ul className="mt-2 list-disc pl-5 text-ink-2">
            {preview.errors.slice(0, 10).map((e, i) => (
              <li key={i}>{e.line > 0 ? `Line ${e.line}: ` : ""}{e.message}</li>
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
                  <th className="font-medium">Description</th>
                  <th className="pr-3 text-right font-medium">Amount</th>
                  <th className="font-medium">Category</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.index} className="border-b border-hairline align-top">
                    <td className="whitespace-nowrap py-2 pr-3">{r.date}</td>
                    <td className="pr-3">{r.description}</td>
                    <td className={`whitespace-nowrap pr-3 text-right tabular-nums ${r.kind === "income" ? "text-green-600" : ""}`}>
                      {r.kind === "income" ? "+" : "−"}{fmt(r.amountCents)}
                    </td>
                    <td className="py-1.5">
                      {r.status === "new" ? (
                        <select
                          name={`row_${r.index}`}
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
                          {r.status === "exists" ? "Already imported" : "Repeated in this file"}
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
          disabled={committing || fresh === 0 || preview.needsMapping}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {committing ? "Importing…" : "Import selected rows"}
        </button>
        {fresh === 0 && !preview.needsMapping && preview.rows.length > 0 && (
          <span className="text-sm text-muted">Every row is already in the app.</span>
        )}
        {commitError && <p role="alert" className="text-sm text-red-600">{commitError}</p>}
      </div>
    </form>
  );
}
