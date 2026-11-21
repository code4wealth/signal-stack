"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight } from "lucide-react";

const NAV_ITEMS = [
  { label: "How it works", href: "#how-it-works" },
  { label: "Signals", href: "#signals" },
  { label: "Briefs", href: "/sample-brief" },
  { label: "Sources", href: "#sources" },
];

export function Navbar({ onScrollToSetup }: { onScrollToSetup: () => void }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.header
      initial={reduceMotion ? false : { opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="sticky top-6 z-30 mx-auto w-full max-w-[470px] px-4 sm:px-0"
    >
      <nav
        aria-label="Primary navigation"
        className="glass flex items-center justify-between gap-3 rounded-2xl px-3 py-2"
      >
        <Link
          href="/"
          aria-label="Signal Stack home"
          className="focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white/75 text-[#1F2125] no-underline shadow-[0_2px_8px_rgba(31,33,37,0.05)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="3" y="4" width="18" height="4.2" rx="2.1" fill="#0D9488" />
            <rect x="3" y="9.9" width="14" height="4.2" rx="2.1" fill="#EA580C" />
            <rect x="3" y="15.8" width="10" height="4.2" rx="2.1" fill="#2563EB" />
          </svg>
        </Link>

        <div className="hidden items-center gap-4 font-mono text-[12.5px] text-[#4B5058] sm:flex">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="focus-ring rounded-md px-1 py-0.5 text-[#4B5058] no-underline transition-colors hover:text-[#1F2125]"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <button
          type="button"
          onClick={onScrollToSetup}
          aria-label="Jump to company research setup"
          className="btn-motion focus-ring flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/90 bg-white/90 text-[#1F2125] shadow-[0_2px_10px_rgba(31,33,37,0.07)] hover:bg-white"
        >
          <ArrowRight size={15} />
        </button>
      </nav>
    </motion.header>
  );
}
