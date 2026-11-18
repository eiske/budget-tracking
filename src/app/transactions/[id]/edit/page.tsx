import { notFound } from "next/navigation";
import { connection } from "next/server";
import { TransactionForm } from "@/components/transaction-form";
import { centsToInputValue } from "@/lib/domain/money";
import { getTransaction, listCategories } from "@/lib/queries";
import { saveTransaction } from "../../actions";

export default async function EditTransactionPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const tx = getTransaction(id);
  if (!tx) notFound();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold">Edit transaction</h1>
      <TransactionForm
        action={saveTransaction.bind(null, id)}
        categories={listCategories()}
        defaults={{
          date: tx.date,
          amount: centsToInputValue(tx.amountCents),
          description: tx.description,
          categoryId: tx.categoryId ? String(tx.categoryId) : "",
        }}
        submitLabel="Save changes"
      />
    </div>
  );
}
