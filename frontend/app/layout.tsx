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
      <body className="min-h-screen bg-bg text-ink antialiased">
        <header className="sticky top-0 z-20 border-b border-[rgba(233,237,243,0.09)] bg-bg">
          <div className="mx-auto flex h-[68px] max-w-[1280px] items-center justify-between gap-4 px-6">
            <a className="skip-link" href="#top">
              Skip to content
            </a>
            <div className="flex items-center gap-6">
              <Link href="/" className="flex items-center gap-2.5 text-ink no-underline hover:text-ink">
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                  className="shrink-0"
                >
                  <rect x="3" y="4" width="18" height="4" rx="1.5" fill="#5ab9fc" />
                  <rect x="3" y="10" width="13" height="4" rx="1.5" fill="#e9edf3" fillOpacity="0.88" />
                  <rect x="3" y="16" width="8" height="4" rx="1.5" fill="#e9edf3" fillOpacity="0.45" />
                </svg>
                <span className="text-[17px] font-semibold tracking-[-0.02em]">Signal Stack</span>
              </Link>
              <nav className="hidden items-center gap-5 text-sm sm:flex">
                <Link href="/" className="font-medium text-muted no-underline hover:text-ink">
                  Companies
                </Link>
              </nav>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-muted md:inline">
                Every signal cites a crawled record
              </span>
              <BackendStatus />
            </div>
          </div>
        </header>
        <main id="top" className="mx-auto max-w-[1280px] px-6 py-8 sm:py-10">
          {children}
        </main>
        <footer className="mx-auto max-w-[1280px] border-t border-[rgba(233,237,243,0.08)] px-6 py-8 text-xs text-muted">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>Signal Stack — Evidence-backed company intelligence</span>
            <span>No fabricated sources · Every claim links to a stored record with verbatim snippet</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
