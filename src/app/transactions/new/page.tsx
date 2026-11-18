import { connection } from "next/server";
import { TransactionForm } from "@/components/transaction-form";
import { todayString } from "@/lib/domain/dates";
import { listCategories } from "@/lib/queries";
import { saveTransaction } from "../actions";

export default async function NewTransactionPage() {
  await connection(); // today's date and categories must be read per request
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Add transaction</h1>
      <TransactionForm
        action={saveTransaction.bind(null, null)}
        categories={listCategories()}
        defaults={{ date: todayString(), amount: "", description: "", categoryId: "" }}
        submitLabel="Add transaction"
      />
    </div>
  );
}
