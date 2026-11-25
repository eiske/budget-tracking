import { db, sqlite } from "./client";
import { categories } from "./schema";

const defaults = [
  { name: "Groceries", color: "#16a34a", kind: "expense" },
  { name: "Restaurants", color: "#ea580c", kind: "expense" },
  { name: "Transport", color: "#2563eb", kind: "expense" },
  { name: "Housing", color: "#7c3aed", kind: "expense" },
  { name: "Utilities", color: "#0891b2", kind: "expense" },
  { name: "Health", color: "#dc2626", kind: "expense" },
  { name: "Entertainment", color: "#db2777", kind: "expense" },
  { name: "Subscriptions", color: "#4f46e5", kind: "expense" },
  { name: "Shopping", color: "#ca8a04", kind: "expense" },
  { name: "Taxes", color: "#b45309", kind: "expense" },
  { name: "Investments", color: "#0369a1", kind: "expense" },
  { name: "Other", color: "#64748b", kind: "expense" },
  { name: "Salary", color: "#15803d", kind: "income" },
  { name: "Other income", color: "#0d9488", kind: "income" },
] as const;

// Idempotent: existing categories (matched by unique name) are left untouched.
const result = db.insert(categories).values([...defaults]).onConflictDoNothing().run();
console.log(`Seed done. Inserted ${result.changes} new categories.`);
sqlite.close();
