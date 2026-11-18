# Budget tracking

A personal expense tracker that runs on your own computer. One user, no account, no cloud: your data
lives in a single SQLite file.

Built with Next.js (App Router), TypeScript, Tailwind, SQLite (better-sqlite3) and Drizzle ORM.

## Features

- **Transactions**: add, edit, delete; filter by month, category and text; amounts kept as exact integer cents.
- **Dashboard**: spending this month vs last month, spending by category, and a 6-month trend.
- **Budgets**: a monthly limit per expense category, with a meter that warns at 80% and flags the limit.
- **Installments**: a purchase split into monthly installments that add up to the exact total.
- **Recurring entries**: rules (rent, subscriptions, salary) that create this month's entry when you open the app.
- **Statement import**: CSV or OFX, with column detection, keyword-based categories and duplicate detection.
- **Backup**: download a copy of the whole database in one click, or from the terminal.

## Quick start

Requires Node.js 20.9 or newer (developed and tested on Node 26) and npm.

```bash
npm install
npm run db:setup   # creates data/app.db, applies migrations, adds the default categories
npm run dev        # http://127.0.0.1:3000
```

`npm run dev` and `npm run start` only listen on `127.0.0.1`, on purpose (see [Privacy](#your-data-and-privacy)).

## Using it

**Transactions.** Enter the amount as you would write it: `12.50`, `12,50` or `1.234,56`. The amount is always
positive; whether it counts as spending or income comes from the category.

**Installments.** In *Add transaction*, set *Installments* to 2 or more. The amount is the **total**; it is split
across monthly installments starting on the date you chose (100.00 in 3x becomes 33.34 + 33.33 + 33.33, so no cent
is lost). The day of the month is kept where the month allows it: a purchase on the 31st falls on the 28th in
February and on the 31st again in March. Editing an installment changes only that one; *Delete all* removes the
whole purchase.

**Budgets.** Pick a month, an expense category and a limit. The meter turns amber from 80% used and red at the
limit; the text says the same thing, so colour is never the only signal. *Copy missing from…* fills a month from the
previous one without overwriting anything you already set.

**Recurring.** A rule has an amount, a category, a day of the month and a start (and optional end) date. When you open
the app, each active rule creates **one entry for the current month**, once. It never fills in past months. A day
that does not exist in a short month uses the last day (31 becomes 30 or 28). Things to know:

- Changing a rule affects entries that were not created yet; this month's entry is an ordinary transaction, edited
  under *Transactions*.
- Deleting a generated entry is remembered, so it is not created again. *Add back* undoes that.
- Deleting a rule keeps the entries it already created.

**Importing a statement.** Open *Import*, choose a CSV or OFX file and review the rows before anything is saved.

- Columns, date format and decimal separator are detected from the file; you can correct them and update the preview.
- Each row has a category, suggested from your keyword rules (page *Rules*; matching ignores case and accents and
  the longest keyword wins), or *Other* / *Other income* when none match. Choose **Skip** for rows that are not
  real spending or income: transfers between your own accounts, investments, credit-card bill payments.
- Long bank descriptions are shortened to the first two ` - ` parts (for example `Pix - Name`), so counterparty
  ids and account numbers are not stored.
- Importing the same statement again is safe: rows already in the app are recognised (by the bank's own id when the
  file has one, otherwise by date, amount and description) and ignored.
- Limits: 1.5 MB and 5,000 rows per file; UTF-8 text only.

## Your data and privacy

- Everything is in `data/app.db` (SQLite). It is git-ignored; nothing is sent anywhere.
- The app has **no login**. It is meant to run only on your own computer, so it refuses any request whose `Host`
  header is not `localhost`, `127.0.0.1` or `[::1]`. That blocks DNS-rebinding attacks, where a hostile website points
  its own name at your machine to read your data through your browser. Do not expose the port to a network.
  If you really need another name, set `ALLOWED_HOSTS` (see below) and accept the risk.
- Statements you import contain personal data. Imported descriptions are shortened, but keep your own files safe.

## Backup and restore

- **Browser:** the *Download backup* button in the footer downloads a consistent copy of the database.
- **Terminal:** `npm run db:backup` writes `backups/budget-tracking-<date>-<time>.db` (pass a folder to use another
  location). Both are safe while the app is running. Keep backups somewhere private: they contain all your data.

To restore: stop the app, copy the backup over `data/app.db`, delete `data/app.db-wal` and `data/app.db-shm` if
they exist (a leftover write-ahead log from the old database must not be applied to the restored one), then start
the app again.

## Configuration

Set these in `.env.local` (see `.env.example`) or the environment. Restart the server after changing them.

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_PATH` | `data/app.db` | Where the SQLite file lives. |
| `NEXT_PUBLIC_CURRENCY` | `BRL` | Currency code used to display amounts (`USD`, `EUR`, …). |
| `NEXT_PUBLIC_LOCALE` | `en-US` | Number and date formatting locale (`pt-BR`, …). |
| `ALLOWED_HOSTS` | *(empty)* | Extra hostnames the app may answer to, comma-separated. |

`NEXT_PUBLIC_*` values are baked in at build time: rebuild (`npm run build`) after changing them for `npm run start`.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Development server / production build / production server (localhost only). |
| `npm run db:setup` | Apply migrations and add default categories (safe to repeat). |
| `npm run db:generate` | Create a migration after editing `src/db/schema.ts`. |
| `npm run db:migrate` | Apply pending migrations. **Run it after pulling a change that adds one.** |
| `npm run db:seed` | Add the default categories if missing. |
| `npm run db:backup` | Write a timestamped backup of the database. |
| `npm test` | Unit tests (Vitest). |
| `npm run test:e2e` | End-to-end tests (Playwright). |
| `npm run lint` | ESLint. |

## Tests

```bash
npm test            # unit tests: money, dates, installments, recurrence, budgets, import parsing, host guard
npm run test:e2e    # browser tests of the real app
```

The end-to-end suite builds the app into its own directory (`.next-e2e`), starts it on port 3100 with a throwaway
database in `e2e/.tmp`, and runs the specs in a real browser. It does not touch your data, and it can run while
`npm run dev` is running. First time only: `npx playwright install chromium` (or set `PLAYWRIGHT_CHROMIUM_PATH` to a
Chromium you already have).

## Project layout

```
src/app/            pages and server actions (/, transactions, budgets, recurring, import, rules, api/backup)
src/proxy.ts        refuses requests that are not addressed to localhost
src/components/     UI pieces (forms, budget meter, charts, import wizard)
src/lib/domain/     pure, tested rules: money, dates, installments, recurrence, budgets, form validation
src/lib/import/     CSV/OFX parsing, column detection, dedupe hashes, keyword categorization
src/lib/            database queries, recurring generation, backup
src/db/             schema, client, migrations runner, seed, backup script
drizzle/            generated SQL migrations (commit these)
e2e/                Playwright specs and synthetic fixtures
```

## Design decisions and limits

- **Money is integer cents** everywhere; amounts are parsed strictly, never through floating point.
- **Amount sign comes from the category** (expense or income), so an imported row can only be saved into a category
  of the matching kind; the server checks this, not just the form.
- **Recurring entries are created for the current month only**, by design, so closed months never change on their own.
  If you do not open the app during a month, that month gets no entry from the rule.
- **Not included:** multiple users, multiple accounts or cards, bank sync (Open Finance), receipt OCR, translations
  (the interface is in English).
- The import reads UTF-8. A file in another encoding may show broken accents; re-save it as UTF-8.

## Troubleshooting

- **Styles look missing or stale after a change:** stop the server, delete `.next`, start again.
- **`no such table` after updating the code:** run `npm run db:migrate`.
- **`403 Forbidden: this app only answers requests addressed to localhost`:** you opened it by an address other than
  `localhost` or `127.0.0.1`. Use one of those, or set `ALLOWED_HOSTS`.
- **Port already in use:** `npm run dev -- -p 3001`.
- **Next.js version:** this project uses Next.js 16, which differs from older versions. See `AGENTS.md` and the docs
  bundled in `node_modules/next/dist/docs/` before changing framework-level code.
