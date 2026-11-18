import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { RecurringForm } from "@/components/recurring-form";
import { centsToInputValue } from "@/lib/domain/money";
import { getRecurringRule, listCategories } from "@/lib/queries";
import { saveRecurring } from "../../actions";

export default function EditRecurringPage({ params }: { params: Promise<{ id: string }> }) {
  // Request-time data (SQLite) must sit under Suspense with Cache Components.
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Edit recurring rule</h1>
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <EditRuleForm params={params} />
      </Suspense>
    </div>
  );
}

async function EditRuleForm({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const rule = getRecurringRule(id);
  if (!rule) notFound();

  return (
    <RecurringForm
      action={saveRecurring.bind(null, id)}
      categories={listCategories()}
      defaults={{
        description: rule.description,
        amount: centsToInputValue(rule.amountCents),
        categoryId: String(rule.categoryId),
        dayOfMonth: String(rule.dayOfMonth),
        startDate: rule.startDate,
        endDate: rule.endDate ?? "",
      }}
      submitLabel="Save changes"
    />
  );
}
