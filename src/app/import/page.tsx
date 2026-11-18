import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ImportWizard } from "@/components/import-wizard";
import { listCategories } from "@/lib/queries";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const count = (v: string | string[] | undefined) => {
  const s = Array.isArray(v) ? v[0] : v;
  return s && /^\d{1,6}$/.test(s) ? Number(s) : null;
};

export default function ImportPage({ searchParams }: { searchParams: SearchParams }) {
  // Request-time data (SQLite) must sit under Suspense with Cache Components.
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Import a statement</h1>
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <ImportContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ImportContent({ searchParams }: { searchParams: SearchParams }) {
  await connection();
  const sp = await searchParams;
  const imported = count(sp.imported);
  const duplicates = count(sp.duplicates) ?? 0;
  const skipped = count(sp.skipped) ?? 0;

  return (
    <>
      {imported !== null && (
        <p role="status" className="rounded-xl border border-hairline bg-surface p-4 text-sm">
          Imported {imported} {imported === 1 ? "transaction" : "transactions"}
          {duplicates > 0 && `, ${duplicates} already in the app were ignored`}
          {skipped > 0 && `, ${skipped} skipped`}.{" "}
          <Link href="/transactions?month=" className="underline">View transactions</Link>
        </p>
      )}
      <p className="text-sm text-muted">
        Importing the same statement again is safe: rows that are already in the app are detected and ignored.
        Nothing is saved until you review the rows and confirm.
      </p>
      <ImportWizard categories={listCategories()} />
    </>
  );
}
