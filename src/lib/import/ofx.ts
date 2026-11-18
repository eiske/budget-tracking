import { parseSync } from "ofx-js";
import { isValidDate } from "../domain/dates";
import { parseSignedAmount } from "./csv";
import type { RawRow, RowError } from "./types";

type Node = Record<string, unknown>;

/** Every STMTTRN (statement transaction) anywhere in the tree, as an array even when there is only one. */
function collectTransactions(node: unknown, out: Node[] = []): Node[] {
  if (Array.isArray(node)) {
    node.forEach((n) => collectTransactions(n, out));
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node as Node)) {
      if (key === "STMTTRN") {
        // ofx-js returns a lone transaction as an object, several as an array.
        (Array.isArray(value) ? value : [value]).forEach((t) => t && typeof t === "object" && out.push(t as Node));
      } else {
        collectTransactions(value, out);
      }
    }
  }
  return out;
}

const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** OFX amounts use "." per the spec, but some banks write ",": decide per file line by what it looks like. */
function parseOfxAmount(raw: string): number | null {
  return parseSignedAmount(raw, /,\d{1,2}$/.test(raw.trim()) ? "," : ".");
}

/** Parses an OFX/QFX statement (SGML or XML). Never throws: a broken file yields an error row instead. */
export function parseOfx(source: string): { rows: RawRow[]; errors: RowError[] } {
  const rows: RawRow[] = [];
  const errors: RowError[] = [];

  let tree: unknown;
  try {
    tree = parseSync(source).OFX;
  } catch {
    return { rows, errors: [{ line: 0, message: "Could not read this OFX file" }] };
  }

  collectTransactions(tree).forEach((t, i) => {
    const line = i + 1; // OFX has no lines; use the transaction's position
    const posted = text(t.DTPOSTED).slice(0, 8); // YYYYMMDD, ignoring time and timezone
    const date = /^\d{8}$/.test(posted) ? `${posted.slice(0, 4)}-${posted.slice(4, 6)}-${posted.slice(6, 8)}` : "";
    if (!isValidDate(date)) return void errors.push({ line, message: `Invalid date "${text(t.DTPOSTED)}"` });

    const amountCents = parseOfxAmount(text(t.TRNAMT));
    if (amountCents === null) return void errors.push({ line, message: `Invalid amount "${text(t.TRNAMT)}"` });
    if (amountCents === 0) return void errors.push({ line, message: "Amount is zero" });

    const name = text(t.NAME);
    const memo = text(t.MEMO);
    const description = name && memo && name !== memo ? `${name} - ${memo}` : name || memo;
    if (!description) return void errors.push({ line, message: "Missing description" });

    // Some banks reuse FITIDs, so date and amount are part of the identity.
    const fitid = text(t.FITID);
    rows.push({ line, date, amountCents, description, externalId: fitid ? `${fitid}|${date}|${amountCents}` : null });
  });

  return { rows, errors };
}

/** True for OFX/QFX content (SGML header or an <OFX> element). */
export function looksLikeOfx(source: string): boolean {
  return /^\s*OFXHEADER/i.test(source) || /<OFX[\s>]/i.test(source);
}
