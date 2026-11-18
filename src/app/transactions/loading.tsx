// Implicit <Suspense> boundary for /transactions and its children. Pages read SQLite per
// request (after `await connection()`), which Cache Components requires to be streamed.
export default function Loading() {
  return <p className="text-sm text-neutral-500">Loading…</p>;
}
