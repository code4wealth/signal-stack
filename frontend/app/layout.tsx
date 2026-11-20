import type { Metadata } from "next";
import Link from "next/link";
import { BackendStatus } from "@/components/backend-status";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signal Stack",
  description: "Evidence-backed company intelligence: research, interview, sources, crawl, rank, brief.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg text-slate-200 antialiased">
        <header className="border-b border-white/5 bg-secondary/70 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-4">
            <Link href="/" className="flex items-center gap-2 text-slate-100 no-underline">
              <span className="h-2.5 w-2.5 rounded-full bg-accent" aria-hidden />
              <span className="text-lg font-semibold tracking-tight">Signal Stack</span>
            </Link>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs text-slate-400">
                Evidence-backed company intelligence · every claim cites a stored record
              </span>
              <BackendStatus />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-6 pb-10 pt-4 text-xs text-slate-500">
          No fabricated sources. Every signal links to a crawled document with a verbatim snippet.
        </footer>
      </body>
    </html>
  );
}
