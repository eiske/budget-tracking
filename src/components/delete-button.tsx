"use client";

export function DeleteButton({
  id,
  action,
  label,
}: {
  id: number;
  action: (formData: FormData) => Promise<void>;
  label: string;
}) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(`Delete "${label}"? This cannot be undone.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-sm text-red-600 underline">Delete</button>
    </form>
  );
}
