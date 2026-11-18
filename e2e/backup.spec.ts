import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { expect, test } from "@playwright/test";
import { query } from "./helpers";

const PORT = 3100;

/** A request with an arbitrary Host header (browsers and fetch will not let a page set one). */
function rawRequest(method: string, urlPath: string, host: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port: PORT, path: urlPath, method, headers: { Host: host } }, (res) => {
      let body = "";
      res.on("data", (c) => (body += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
    });
    req.on("error", reject);
    req.end();
  });
}

test.describe("backup", () => {
  test("downloads a complete, valid copy of the database", async ({ request }) => {
    const res = await request.post("/api/backup");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-disposition"]).toMatch(/^attachment; filename="budget-tracking-\d{4}-\d{2}-\d{2}-\d{6}\.db"$/);
    expect(res.headers()["cache-control"]).toBe("no-store");

    const bytes = await res.body();
    expect(bytes.subarray(0, 15).toString()).toBe("SQLite format 3");

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-backup-"));
    const file = path.join(dir, "copy.db");
    try {
      fs.writeFileSync(file, bytes);
      const copy = new Database(file, { readonly: true });
      expect(copy.pragma("integrity_check", { simple: true })).toBe("ok");
      for (const table of ["transactions", "categories", "budgets", "recurring_rules", "category_rules"]) {
        const live = query<{ n: number }>(`select count(*) n from ${table}`)[0].n;
        expect((copy.prepare(`select count(*) n from ${table}`).get() as { n: number }).n).toBe(live);
      }
      copy.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("the footer button downloads it", async ({ page }) => {
    await page.goto("/");
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download backup" }).click();
    expect((await download).suggestedFilename()).toMatch(/^budget-tracking-.*\.db$/);
  });

  test("refuses cross-origin and non-POST requests", async ({ request }) => {
    expect((await request.post("/api/backup", { headers: { Origin: "https://evil.example" } })).status()).toBe(403);
    expect((await request.get("/api/backup")).status()).toBe(405);
  });

  test("answers nothing to a Host that is not localhost (DNS rebinding)", async () => {
    for (const [method, urlPath] of [["GET", "/"], ["GET", "/transactions"], ["POST", "/api/backup"]] as const) {
      const res = await rawRequest(method, urlPath, "evil.example");
      expect(res.status).toBe(403);
      expect(res.body).not.toContain("SQLite");
      expect(res.body).not.toContain("Budget tracking");
    }
    expect((await rawRequest("GET", "/", "localhost:3100")).status).toBe(200); // localhost by name still works
  });
});
