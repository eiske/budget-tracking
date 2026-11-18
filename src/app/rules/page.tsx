import { connection } from "next/server";
import { Suspense } from "react";
import { DeleteButton } from "@/components/delete-button";
import { RuleForm } from "@/components/rule-form";
import { listCategories, listCategoryRules } from "@/lib/queries";
import { deleteRule, saveRule } from "./actions";

export default function RulesPage() {
  // Request-time data (SQLite) must sit under Suspense with Cache Components.
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Category rules</h1>
      <p className="text-sm text-muted">
        When you import a statement, a row whose description contains a keyword is pre-assigned that category.
        Matching ignores case and accents; if several keywords match, the longest one wins. You can still
        change any row before importing.
      </p>
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <Rules />
      </Suspense>
    </div>
  );
}

async function Rules() {
  await connection();
  const rules = listCategoryRules();

  return (
    <>
      <section className="rounded-xl border border-hairline bg-surface p-5">
        <RuleForm action={saveRule} categories={listCategories()} />
      </section>

      {rules.length === 0 ? (
        <p className="text-sm text-muted">No rules yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-muted">
                <th className="py-2 font-medium">Keyword</th>
                <th className="font-medium">Category</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id} className="border-b border-hairline">
                  <td className="py-2">{r.pattern}</td>
                  <td>{r.categoryName}</td>
                  <td className="flex justify-end py-2">
                    <DeleteButton id={r.id} action={deleteRule} label={`${r.pattern} → ${r.categoryName}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
