import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Budget tracking",
  description: "Personal expense tracker",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-neutral-200 dark:border-neutral-800">
          <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 text-sm">
            <Link href="/" className="font-semibold">Budget tracking</Link>
            <Link href="/" className="hover:underline">Dashboard</Link>
            <Link href="/transactions" className="hover:underline">Transactions</Link>
            <Link href="/budgets" className="hover:underline">Budgets</Link>
            <Link href="/recurring" className="hover:underline">Recurring</Link>
            <Link href="/import" className="hover:underline">Import</Link>
          </nav>
        </header>
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
        <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-6 gap-y-1 px-4 pb-6 text-xs text-muted">
          <form method="post" action="/api/backup">
            <button type="submit" className="underline">Download backup</button>
          </form>
          <span>Your data stays in a local file on this computer.</span>
        </footer>
      </body>
    </html>
  );
}
