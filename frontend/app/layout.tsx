import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

export const metadata: Metadata = {
  title: "Signal Stack — AI Business Intelligence for Founders",
  description:
    "Signal Stack researches your company, monitors customers, competitors and market changes, and delivers an evidence-backed Monday Morning Brief.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body className="min-h-screen bg-bg font-sans text-ink antialiased">
        <a className="skip-link" href="#main-content">
          Skip to content
        </a>
        <div className="bg-blobs" aria-hidden="true">
          <div className="bg-blob-tl" />
          <div className="bg-blob-tc" />
          <div className="bg-blob-br" />
        </div>
        {children}
      </body>
    </html>
  );
}
