import type { Metadata } from "next";
import localFont from "next/font/local";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

const sourceSerif = localFont({
  src: "../node_modules/@fontsource-variable/source-serif-4/files/source-serif-4-latin-wght-normal.woff2",
  weight: "400 600",
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Signal Stack — AI Business Intelligence for Founders",
  description:
    "Signal Stack researches your company, monitors customers, competitors and market changes, and delivers an evidence-backed Monday Morning Brief.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} ${sourceSerif.variable}`}
    >
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
