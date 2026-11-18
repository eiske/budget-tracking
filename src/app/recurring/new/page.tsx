import { connection } from "next/server";
import { Suspense } from "react";
import { RecurringForm } from "@/components/recurring-form";
import { todayString } from "@/lib/domain/dates";
import { listCategories } from "@/lib/queries";
import { saveRecurring } from "../actions";

export default function NewRecurringPage() {
  // Request-time data (SQLite, today's date) must sit under Suspense with Cache Components.
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Add recurring rule</h1>
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <NewRuleForm />
      </Suspense>
    </div>
  );
}

async function NewRuleForm() {
  await connection();
  const today = todayString();
  return (
    <RecurringForm
      action={saveRecurring.bind(null, null)}
      categories={listCategories()}
      defaults={{
        description: "",
        amount: "",
        categoryId: "",
        dayOfMonth: String(Number(today.slice(8))),
        startDate: today,
        endDate: "",
      }}
      submitLabel="Add rule"
    />
  );
}
