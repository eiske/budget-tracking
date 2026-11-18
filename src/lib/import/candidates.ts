import { createHash } from "node:crypto";
import { normalizeText } from "./categorize";
import type { Candidate, RawRow } from "./types";

/**
 * Long bank descriptions carry counterparty ids and account numbers
 * ("Pix - NAME - 12.345.678/0001-90 - BANK (0001) Agência: 1 Conta: 123-4").
 * Keep the first two " - " parts (type + name), which is what a person recognizes.
 */
export function shortenDescription(raw: string, max = 200): string {
  const cleaned = raw.replace(/\s+/g, " ").trim();
  const parts = cleaned.split(" - ");
  const short = parts.length > 2 ? parts.slice(0, 2).join(" - ") : cleaned;
  return short.length > max ? `${short.slice(0, max - 1).trimEnd()}…` : short;
}

/**
 * Dedupe key. With the bank's own id it is just that id. Without one it is the row's content plus
 * its occurrence number, so two genuinely identical purchases on one day stay distinct while
 * re-importing the same file still matches row for row.
 */
export function importHash(input: {
  externalId: string | null;
  date: string;
  amountCents: number;
  description: string;
  occurrence: number;
}): string {
  const basis = input.externalId
    ? `id:${input.externalId}`
    : `row:${input.date}|${input.amountCents}|${normalizeText(input.description)}|${input.occurrence}`;
  return createHash("sha256").update(basis).digest("hex");
}

/** Turns parsed rows into import candidates (hash, short description, in-file duplicate flag). */
export function buildCandidates(rows: RawRow[]): Candidate[] {
  const occurrences = new Map<string, number>();
  const seen = new Set<string>();

  return rows.map((row, index) => {
    const key = `${row.date}|${row.amountCents}|${normalizeText(row.description)}`;
    const occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);

    const hash = importHash({ ...row, occurrence });
    const duplicateInFile = seen.has(hash);
    seen.add(hash);

    return {
      index,
      line: row.line,
      date: row.date,
      amountCents: row.amountCents,
      description: shortenDescription(row.description),
      rawDescription: row.description,
      hash,
      duplicateInFile,
    };
  });
}
