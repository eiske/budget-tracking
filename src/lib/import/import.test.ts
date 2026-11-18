import { describe, expect, it } from "vitest";
import { buildCandidates, importHash, shortenDescription } from "./candidates";
import { defaultCategoryId, normalizeText, suggestCategory, type CategoryLike, type RuleLike } from "./categorize";
import { csvToRows, detectFormats, detectMapping, parseCsvText, parseDate, parseSignedAmount } from "./csv";
import { resolveDecision } from "./decisions";
import { looksLikeOfx, parseOfx } from "./ofx";

// All data below is synthetic. It mirrors only the STRUCTURE of a real bank export.
const SAMPLE = [
  "Data,Valor,Identificador,Descrição",
  "01/10/2026,-48.90,11111111-aaaa-4aaa-8aaa-000000000001,Transferência enviada pelo Pix - ACME PADARIA LTDA - 00.000.000/0001-00 - BANCO TESTE (0001) Agência: 1 Conta: 123-4",
  "02/10/2026,-200.00,11111111-aaaa-4aaa-8aaa-000000000002,Compra no débito - MERCADO EXEMPLO",
  "06/10/2026,6769.52,11111111-aaaa-4aaa-8aaa-000000000003,Transferência recebida pelo Pix - FULANO DE TAL - 000.000.000-00",
  "16/10/2026,110000.00,11111111-aaaa-4aaa-8aaa-000000000004,Resgate RDB",
  "16/10/2026,-5519.54,11111111-aaaa-4aaa-8aaa-000000000005,Pagamento de fatura",
].join("\n");

describe("parseCsvText", () => {
  it("splits header and rows, ignoring blank lines and a BOM", () => {
    const t = parseCsvText("﻿a,b\n\n1,2\n \n3,4\n");
    expect(t).toEqual({ headers: ["a", "b"], rows: [["1", "2"], ["3", "4"]] });
  });

  it("keeps commas inside quoted fields and detects semicolons", () => {
    expect(parseCsvText('d,t\n1,"Shop, big"\n').rows).toEqual([["1", "Shop, big"]]);
    expect(parseCsvText("d;v\n1;2,5\n").rows).toEqual([["1", "2,5"]]);
  });

  it("returns an empty table for empty input", () => {
    expect(parseCsvText("")).toEqual({ headers: [], rows: [] });
    expect(parseCsvText("\n\n")).toEqual({ headers: [], rows: [] });
  });
});

describe("detectMapping", () => {
  it("finds Portuguese headers regardless of accents and case", () => {
    expect(detectMapping(["Data", "Valor", "Identificador", "Descrição"])).toEqual({ date: 0, amount: 1, id: 2, description: 3 });
    expect(detectMapping(["DATA", "HISTÓRICO", "VALOR"])).toEqual({ date: 0, description: 1, amount: 2, id: null });
  });

  it("finds English headers", () => {
    expect(detectMapping(["Date", "Description", "Amount", "ID"])).toEqual({ date: 0, description: 1, amount: 2, id: 3 });
  });

  it("reports what it could not find instead of guessing", () => {
    expect(detectMapping(["foo", "bar"])).toEqual({ date: null, amount: null, description: null, id: null });
    expect(detectMapping(["Data", "Valor"]).description).toBeNull();
  });

  it("never assigns one column to two roles", () => {
    const m = detectMapping(["Data", "Valor", "Descrição"]);
    const used = Object.values(m).filter((v) => v !== null);
    expect(new Set(used).size).toBe(used.length);
  });
});

describe("detectFormats", () => {
  const rows = (...cells: string[][]) => cells;
  it("detects DMY when a day exceeds 12 in the first position", () => {
    expect(detectFormats(rows(["01/10/2026", "1"], ["15/10/2026", "2"]), { date: 0, amount: 1 }).dateFormat).toBe("DMY");
  });
  it("detects MDY when a day exceeds 12 in the second position", () => {
    expect(detectFormats(rows(["10/15/2026", "1"]), { date: 0, amount: 1 }).dateFormat).toBe("MDY");
  });
  it("detects ISO year-first dates", () => {
    expect(detectFormats(rows(["2026-10-01", "1"]), { date: 0, amount: 1 }).dateFormat).toBe("YMD");
  });
  it("defaults to DMY when ambiguous", () => {
    expect(detectFormats(rows(["01/02/2026", "1"]), { date: 0, amount: 1 }).dateFormat).toBe("DMY");
  });
  it("detects the decimal separator from the amounts", () => {
    expect(detectFormats(rows(["01/10/2026", "-4883.90"], ["02/10/2026", "110000.00"]), { date: 0, amount: 1 }).decimal).toBe(".");
    expect(detectFormats(rows(["01/10/2026", "-10,50"], ["02/10/2026", "1.234,56"]), { date: 0, amount: 1 }).decimal).toBe(",");
    expect(detectFormats(rows(["01/10/2026", "5"]), { date: 0, amount: 1 }).decimal).toBe(".");
  });
});

describe("parseDate", () => {
  it.each([
    ["01/10/2026", "DMY", "2026-10-01"],
    ["1/2/2026", "DMY", "2026-02-01"],
    ["10/01/2026", "MDY", "2026-10-01"],
    ["2026-10-01", "YMD", "2026-10-01"],
    ["2026-10-01 12:30:00", "YMD", "2026-10-01"],
    ["29/02/2028", "DMY", "2028-02-29"],
  ] as const)("parses %s as %s", (raw, fmt, expected) => expect(parseDate(raw, fmt)).toBe(expected));

  it.each([
    ["30/02/2026", "DMY"], ["29/02/2027", "DMY"], ["32/01/2026", "DMY"], ["01/13/2026", "DMY"],
    ["1/2/26", "DMY"], ["", "DMY"], ["garbage", "DMY"], ["2026-10-01", "DMY"],
  ] as const)("rejects %s as %s", (raw, fmt) => expect(parseDate(raw, fmt)).toBeNull());
});

describe("parseSignedAmount", () => {
  it.each([
    ["-4883.90", ".", -488390],
    ["110000.00", ".", 11000000],
    ["6769.52", ".", 676952],
    ["-0.05", ".", -5],
    ["5", ".", 500],
    ["0.5", ".", 50],
    ["1,234.56", ".", 123456],
    ["-10,50", ",", -1050],
    ["R$ 1.234,56", ",", 123456],
    ["(10,00)", ",", -1000],
    ["10,00-", ",", -1000],
    ["+7,5", ",", 750],
    ["1.234", ",", 123400], // with "," as decimal, "." groups thousands
    ["0", ".", 0],
  ] as const)("parses %s with %s", (raw, dec, cents) => expect(parseSignedAmount(raw, dec)).toBe(cents));

  it.each([
    ["1.234", "."], // 3 decimals is not a valid amount; never read it as 1234
    ["1,234", ","],
    ["12.345,67", "."],
    ["1..2", "."],
    ["abc", "."],
    ["", "."],
    ["--5", "."],
    ["1,2,3", "."],
    ["9".repeat(30), "."],
  ] as const)("rejects %s with %s", (raw, dec) => expect(parseSignedAmount(raw, dec)).toBeNull());

  it("never drifts through floating point", () => {
    expect(parseSignedAmount("19.99", ".")).toBe(1999);
    expect(parseSignedAmount("0.29", ".")).toBe(29);
    expect(parseSignedAmount("1.15", ".")).toBe(115);
  });
});

describe("csvToRows", () => {
  const formats = { dateFormat: "DMY", decimal: "." } as const;
  const mapping = { date: 0, amount: 1, id: 2, description: 3 };

  it("converts good rows and reports bad ones with their line number", () => {
    const table = {
      headers: ["Data", "Valor", "Id", "Descricao"],
      rows: [
        ["01/10/2026", "-5.00", "x1", "Coffee"],
        ["30/02/2026", "-5.00", "x2", "Bad date"],
        ["02/10/2026", "abc", "x3", "Bad amount"],
        ["03/10/2026", "0.00", "x4", "Zero"],
        ["04/10/2026", "-1.00", "x5", ""],
        ["05/10/2026", "9.00", "", "No id"],
      ],
    };
    const { rows, errors } = csvToRows(table, mapping, formats);
    expect(rows.map((r) => [r.line, r.description, r.externalId])).toEqual([[2, "Coffee", "x1"], [7, "No id", null]]);
    expect(errors.map((e) => e.line)).toEqual([3, 4, 5, 6]);
    expect(errors[0].message).toMatch(/Invalid date/);
    expect(errors[1].message).toMatch(/Invalid amount/);
    expect(errors[2].message).toMatch(/zero/i);
    expect(errors[3].message).toMatch(/description/i);
  });

  it("tolerates short rows (missing cells) without throwing", () => {
    const { rows, errors } = csvToRows({ headers: ["a"], rows: [["01/10/2026"]] }, mapping, formats);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });
});

describe("end to end on a bank-shaped export", () => {
  const table = parseCsvText(SAMPLE);
  const m = detectMapping(table.headers);
  const mapping = { date: m.date!, amount: m.amount!, description: m.description!, id: m.id };
  const formats = detectFormats(table.rows, mapping);
  const { rows, errors } = csvToRows(table, mapping, formats);
  const candidates = buildCandidates(rows);

  it("auto-detects columns and formats", () => {
    expect(mapping).toEqual({ date: 0, amount: 1, id: 2, description: 3 });
    expect(formats).toEqual({ dateFormat: "DMY", decimal: "." });
    expect(errors).toEqual([]);
  });

  it("keeps signs, dates and exact cents", () => {
    expect(candidates.map((c) => [c.date, c.amountCents])).toEqual([
      ["2026-10-01", -4890], ["2026-10-02", -20000], ["2026-10-06", 676952], ["2026-10-16", 11000000], ["2026-10-16", -551954],
    ]);
  });

  it("shortens long descriptions to type + name and keeps the full text for rules", () => {
    expect(candidates[0].description).toBe("Transferência enviada pelo Pix - ACME PADARIA LTDA");
    expect(candidates[0].rawDescription).toContain("BANCO TESTE");
    expect(candidates[4].description).toBe("Pagamento de fatura");
  });

  it("uses the bank's identifier for the hash: unique and independent of other fields", () => {
    expect(new Set(candidates.map((c) => c.hash)).size).toBe(5);
    expect(candidates.every((c) => !c.duplicateInFile)).toBe(true);
    expect(candidates[0].hash).toBe(importHash({ externalId: "11111111-aaaa-4aaa-8aaa-000000000001", date: "x", amountCents: 1, description: "y", occurrence: 9 }));
  });

  it("is deterministic: the same file yields the same hashes and indexes", () => {
    const again = buildCandidates(csvToRows(table, mapping, formats).rows);
    expect(again.map((c) => [c.index, c.hash])).toEqual(candidates.map((c) => [c.index, c.hash]));
  });
});

describe("shortenDescription", () => {
  it("keeps the first two ' - ' parts when there are more", () => {
    expect(shortenDescription("Pix enviado - NOME - 12.345.678/0001-90 - BANCO (0001) Conta: 1")).toBe("Pix enviado - NOME");
  });
  it("leaves one or two parts alone and collapses whitespace", () => {
    expect(shortenDescription("Resgate RDB")).toBe("Resgate RDB");
    expect(shortenDescription("Compra  no   débito - PISTA 4")).toBe("Compra no débito - PISTA 4");
    expect(shortenDescription("Pix - Ana (Transferência enviada)")).toBe("Pix - Ana (Transferência enviada)");
  });
  it("truncates over-long text with an ellipsis, within the limit", () => {
    const out = shortenDescription("x".repeat(500), 50);
    expect(out.length).toBeLessThanOrEqual(50);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("dedupe hashes without a bank id", () => {
  const row = (description: string, amountCents = -500, date = "2026-10-01") => ({ line: 2, date, amountCents, description, externalId: null });

  it("keeps two identical purchases distinct, flagged by occurrence not as duplicates", () => {
    const c = buildCandidates([row("Coffee"), row("Coffee")]);
    expect(c[0].hash).not.toBe(c[1].hash);
    expect(c.map((x) => x.duplicateInFile)).toEqual([false, false]);
  });

  it("re-importing the same rows reproduces the same hashes", () => {
    const a = buildCandidates([row("Coffee"), row("Coffee"), row("Lunch", -2000)]);
    const b = buildCandidates([row("Coffee"), row("Coffee"), row("Lunch", -2000)]);
    expect(a.map((x) => x.hash)).toEqual(b.map((x) => x.hash));
  });

  it("is insensitive to case, accents and spacing in the description", () => {
    expect(buildCandidates([row("Café  Central")])[0].hash).toBe(buildCandidates([row("cafe central")])[0].hash);
  });

  it("differs when date or amount differ", () => {
    const hashes = new Set([row("A"), row("A", -501), row("A", -500, "2026-10-02")].map((r) => buildCandidates([r])[0].hash));
    expect(hashes.size).toBe(3);
  });

  it("flags a repeated bank id inside one file as a duplicate", () => {
    const withId = (id: string) => ({ ...row("X"), externalId: id });
    expect(buildCandidates([withId("A"), withId("B"), withId("A")]).map((c) => c.duplicateInFile)).toEqual([false, false, true]);
  });
});

describe("categorization", () => {
  const rules: RuleLike[] = [
    { pattern: "pix", categoryId: 1, categoryKind: "expense" },
    { pattern: "mercado livre", categoryId: 2, categoryKind: "expense" },
    { pattern: "salario", categoryId: 3, categoryKind: "income" },
    { pattern: "  ", categoryId: 9, categoryKind: "expense" },
  ];

  it("normalizes text", () => {
    expect(normalizeText("  Transferência  ENVIADA ")).toBe("transferencia enviada");
  });

  it("matches case- and accent-insensitively", () => {
    expect(suggestCategory("Pagamento SALÁRIO outubro", "income", rules)).toBe(3);
  });

  it("prefers the longest (most specific) keyword", () => {
    expect(suggestCategory("Pix - MERCADO LIVRE LTDA", "expense", rules)).toBe(2);
    expect(suggestCategory("Pix - Padaria", "expense", rules)).toBe(1);
  });

  it("never suggests a category of the wrong kind", () => {
    expect(suggestCategory("Pix recebido salario", "expense", rules)).toBe(1); // income rule ignored
    expect(suggestCategory("salario", "expense", rules)).toBeNull();
  });

  it("ignores blank patterns and returns null when nothing matches", () => {
    expect(suggestCategory("anything", "expense", rules)).toBeNull();
  });

  it("falls back to the seeded Other / Other income categories", () => {
    const cats: CategoryLike[] = [
      { id: 10, name: "Other", kind: "expense" },
      { id: 11, name: "Other income", kind: "income" },
      { id: 12, name: "Other", kind: "income" }, // same name, wrong kind
    ];
    expect(defaultCategoryId(cats, "expense")).toBe(10);
    expect(defaultCategoryId(cats, "income")).toBe(11);
    expect(defaultCategoryId([], "expense")).toBeNull();
  });
});

describe("resolveDecision", () => {
  const cats: CategoryLike[] = [
    { id: 1, name: "Groceries", kind: "expense" },
    { id: 2, name: "Salary", kind: "income" },
  ];
  it("skips on 'skip', blank or missing", () => {
    for (const c of ["skip", "", null, undefined]) expect(resolveDecision(-100, c, cats)).toEqual({ type: "skip" });
  });
  it("accepts a category whose kind matches the direction", () => {
    expect(resolveDecision(-100, "1", cats)).toEqual({ type: "import", categoryId: 1 });
    expect(resolveDecision(100, "2", cats)).toEqual({ type: "import", categoryId: 2 });
  });
  it("rejects a kind mismatch in both directions", () => {
    expect(resolveDecision(-100, "2", cats)).toMatchObject({ type: "error" });
    expect(resolveDecision(100, "1", cats)).toMatchObject({ type: "error" });
  });
  it("rejects unknown and malformed ids", () => {
    for (const c of ["99", "abc", "1.5", "-1", "1; DROP TABLE"]) expect(resolveDecision(-100, c, cats)).toMatchObject({ type: "error" });
  });
});

describe("parseOfx", () => {
  const sgml = `OFXHEADER:100
DATA:OFXSGML
VERSION:102

<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261001120000[-3:BRT]<TRNAMT>-48.90<FITID>F-1<MEMO>PADARIA TESTE
</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261006<TRNAMT>1500.00<FITID>F-2<NAME>SALARIO TESTE<MEMO>Credito
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

  it("parses SGML with several transactions", () => {
    const { rows, errors } = parseOfx(sgml);
    expect(errors).toEqual([]);
    expect(rows.map((r) => [r.date, r.amountCents, r.description])).toEqual([
      ["2026-10-01", -4890, "PADARIA TESTE"],
      ["2026-10-06", 150000, "SALARIO TESTE - Credito"],
    ]);
  });

  it("handles a statement with exactly ONE transaction (a lone object, not an array)", () => {
    const xml = `<?xml version="1.0"?><OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
      <STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261001</DTPOSTED><TRNAMT>-10.00</TRNAMT><FITID>X1</FITID><MEMO>Single</MEMO></STMTTRN>
      </BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    expect(parseOfx(xml).rows).toHaveLength(1);
  });

  it("finds transactions in a credit-card statement too", () => {
    const cc = `<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS><BANKTRANLIST>
      <STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261002</DTPOSTED><TRNAMT>-30.00</TRNAMT><FITID>C1</FITID><NAME>Shop</NAME></STMTTRN>
      </BANKTRANLIST></CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;
    expect(parseOfx(cc).rows.map((r) => r.description)).toEqual(["Shop"]);
  });

  it("builds the external id from FITID + date + amount (banks reuse FITIDs)", () => {
    expect(parseOfx(sgml).rows[0].externalId).toBe("F-1|2026-10-01|-4890");
  });

  it("accepts a comma decimal", () => {
    const x = `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST><STMTTRN><DTPOSTED>20261001</DTPOSTED><TRNAMT>-12,34</TRNAMT><FITID>1</FITID><MEMO>m</MEMO></STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    expect(parseOfx(x).rows[0].amountCents).toBe(-1234);
  });

  it("reports bad rows as errors and never throws on garbage", () => {
    const bad = `<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
      <STMTTRN><DTPOSTED>2026</DTPOSTED><TRNAMT>-1.00</TRNAMT><MEMO>a</MEMO></STMTTRN>
      <STMTTRN><DTPOSTED>20261001</DTPOSTED><TRNAMT>zzz</TRNAMT><MEMO>b</MEMO></STMTTRN>
      <STMTTRN><DTPOSTED>20261001</DTPOSTED><TRNAMT>-1.00</TRNAMT></STMTTRN>
      </BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
    const r = parseOfx(bad);
    expect(r.rows).toHaveLength(0);
    expect(r.errors).toHaveLength(3);
    expect(() => parseOfx("not an ofx file at all <<<")).not.toThrow();
    expect(() => parseOfx("")).not.toThrow();
  });

  it("recognizes OFX content", () => {
    expect(looksLikeOfx(sgml)).toBe(true);
    expect(looksLikeOfx("<OFX></OFX>")).toBe(true);
    expect(looksLikeOfx("Data,Valor\n1,2")).toBe(false);
  });
});
