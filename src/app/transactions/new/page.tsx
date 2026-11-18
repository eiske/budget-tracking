import { connection } from "next/server";
import { Suspense } from "react";
import { TransactionForm } from "@/components/transaction-form";
import { todayString } from "@/lib/domain/dates";
import { listCategories } from "@/lib/queries";
import { saveTransaction } from "../actions";

export default function NewTransactionPage() {
  // Request-time data (SQLite, today's date) must sit under Suspense with Cache Components.
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Add transaction</h1>
      <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
        <NewTransactionForm />
      </Suspense>
    </div>
  );
}

async function NewTransactionForm() {
  await connection();
  return (
    <TransactionForm
      action={saveTransaction.bind(null, null)}
      categories={listCategories()}
      defaults={{ date: todayString(), amount: "", description: "", categoryId: "" }}
      submitLabel="Add transaction"
    />
  );
}
