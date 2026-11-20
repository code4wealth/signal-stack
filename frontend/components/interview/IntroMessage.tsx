"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { formatShortDate } from "@/lib/company-adapter";
import type { CompanyRecord } from "@/lib/types";

export function IntroMessage({ company }: { company: CompanyRecord }) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <div className="flex items-start gap-3">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#4F46E5]/12"
        aria-hidden="true"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="4" width="18" height="4.2" rx="2.1" fill="#0D9488" />
          <rect x="3" y="9.9" width="14" height="4.2" rx="2.1" fill="#EA580C" />
          <rect x="3" y="15.8" width="10" height="4.2" rx="2.1" fill="#2563EB" />
        </svg>
      </div>

      <div className="min-w-0 flex-1 space-y-2.5">
        <div className="glass rounded-2xl px-4 py-3 text-sm leading-relaxed text-[#1F2125]">
          I researched <span className="font-semibold">{company.name}</span> and found{" "}
          <span className="tabular font-semibold">{company.services.length}</span> service
          {company.services.length === 1 ? "" : "s"} and{" "}
          <span className="tabular font-semibold">{company.competitors.length}</span> competitor
          {company.competitors.length === 1 ? "" : "s"}. I&apos;ll ask 10 questions to understand
          your goals. You can skip anything confidential.
        </div>

        <Link
          href={`/company/${company.id}`}
          className="focus-ring inline-flex max-w-full items-center gap-2.5 rounded-2xl border border-white/85 bg-white/75 px-3 py-2 text-xs text-[#1F2125] no-underline shadow-[0_6px_16px_rgba(31,33,37,0.04)] transition-colors hover:bg-white"
        >
          {company.domain && !imgFailed ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(company.domain)}&sz=64`}
              alt=""
              width={16}
              height={16}
              className="h-4 w-4 shrink-0 rounded-sm object-contain"
              onError={() => setImgFailed(true)}
            />
          ) : (
            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-[#1C1D21] text-[9px] font-semibold text-white">
              {company.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="truncate font-medium">{company.name}</span>
          <span className="truncate font-mono text-[11px] text-[#4B5058]">{company.domain}</span>
          <span className="hidden font-mono text-[11px] text-[#9AA0AA] sm:inline">
            · Researched {formatShortDate(company.summaryUpdatedAt)}
          </span>
          <ArrowUpRight size={13} className="shrink-0 text-[#9AA0AA]" aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}
