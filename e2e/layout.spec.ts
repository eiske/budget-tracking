import { expect, test } from "@playwright/test";

const ROUTES = ["/", "/transactions", "/transactions/new", "/budgets", "/recurring", "/recurring/new", "/import", "/rules"];

for (const width of [320, 390]) {
  test(`no page scrolls sideways or logs errors at ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 800 } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text().split("\n")[0]));

    for (const route of ROUTES) {
      await page.goto(route);
      await page.waitForLoadState("networkidle");
      const scrollX = await page.evaluate(() => { window.scrollTo(3000, 0); return window.scrollX; });
      expect(scrollX, `${route} scrolls horizontally at ${width}px`).toBe(0);
    }
    expect(errors).toEqual([]);
    await context.close();
  });
}
