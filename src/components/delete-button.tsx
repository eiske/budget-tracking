"use client";

type Props = {
  /** Value sent in the hidden field. */
  id: number | string;
  action: (formData: FormData) => Promise<void>;
  /** Names the thing being deleted in the confirmation dialog. */
  label: string;
  /** Hidden field name the action reads (default "id"). */
  name?: string;
  /** Button text (default "Delete"). */
  text?: string;
  /** Full confirmation message; defaults to a generic one built from `label`. */
  message?: string;
};

export function DeleteButton({ id, action, label, name = "id", text = "Delete", message }: Props) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm(message ?? `Delete "${label}"? This cannot be undone.`)) e.preventDefault();
      }}
    >
      <input type="hidden" name={name} value={id} />
      <button type="submit" className="text-sm text-red-600 underline">{text}</button>
    </form>
  );
}
