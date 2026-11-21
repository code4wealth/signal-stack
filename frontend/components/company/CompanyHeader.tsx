"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, ExternalLink, Link2, RefreshCw } from "lucide-react";

import type { CompanyRecord } from "@/lib/types";
import { fadeUp } from "@/lib/motion";
import { CategoryBadge, ConfidenceBadge, StatusPill } from "@/components/ui-shared";

function HeaderFavicon({ name, domain }: { name: string; domain: string }) {
  const [failed, setFailed] = useState(false);
  const initials = (name || "S").trim().slice(0, 2).toUpperCase();

  if (!domain || failed) {
    return (
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#1C1D21] text-base font-semibold text-white shadow-sm">
        {initials}
      </div>
    );
  }

  return (
    <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/85 bg-white shadow-[0_6px_18px_rgba(31,33,37,0.06)]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
        alt=""
        width={28}
        height={28}
        className="h-7 w-7 object-contain"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

export function CompanyHeader({
  company,
  rerunning,
  onRerunResearch,
}: {
  company: CompanyRecord;
  rerunning: boolean;
  onRerunResearch: () => void;
}) {
  const reduced = Boolean(useReducedMotion());
  const isReady = company.researchStatus === "ready";

  const activeCategories = (
    ["customers", "competitors", "market", "internal"] as const
  ).filter((cat) => (company.categoryCounts[cat] ?? 0) > 0);

  return (
    <motion.div
      variants={fadeUp(reduced)}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-4">
        <HeaderFavicon name={company.name} domain={company.domain} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-[-0.025em] text-[#1F2125]">
              {company.name}
            </h1>
            {company.isMock ? <StatusPill tone="warning">MOCK DATA</StatusPill> : null}
          </div>

          <a
            href={company.website}
            target="_blank"
            rel="noreferrer"
            className="focus-ring mt-1 inline-flex items-center gap-1.5 font-mono text-xs text-[#4B5058] no-underline hover:text-[#2563EB]"
          >
            <Link2 size={13} strokeWidth={1.75} aria-hidden="true" />
            <span>{company.domain}</span>
            <ExternalLink size={11} strokeWidth={1.75} aria-hidden="true" />
          </a>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            {company.industry ? (
              <StatusPill tone="neutral">{company.industry}</StatusPill>
            ) : (
              <StatusPill tone="neutral">Industry not yet specified</StatusPill>
            )}
            {activeCategories.map((cat) => (
              <CategoryBadge key={cat} category={cat} />
            ))}
            <ConfidenceBadge level={company.confidence} />
          </div>
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={onRerunResearch}
          disabled={rerunning || company.researchStatus === "running"}
          className="btn-motion focus-ring inline-flex h-10 items-center gap-2 rounded-xl border border-white/80 bg-white/65 px-4 text-xs font-medium text-[#1F2125] shadow-[0_6px_18px_rgba(31,33,37,0.04)] backdrop-blur-md hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw
            size={14}
            strokeWidth={1.75}
            className={rerunning || company.researchStatus === "running" ? "animate-spin" : ""}
            aria-hidden="true"
          />
          {rerunning || company.researchStatus === "running" ? "Researching…" : "Re-run research"}
        </button>

        {isReady ? (
          <Link
            href={`/company/${company.id}/interview`}
            className="btn-motion focus-ring inline-flex h-10 items-center gap-2 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white no-underline shadow-[0_10px_22px_rgba(28,29,33,0.16)] hover:bg-[#2a2c32]"
          >
            Start interview <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />
          </Link>
        ) : (
          <button
            type="button"
            disabled
            title="Available once company research finishes"
            className="inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-xl bg-[#1C1D21]/40 px-4 text-xs font-medium text-white/80"
          >
            Start interview <ArrowRight size={14} strokeWidth={1.75} aria-hidden="true" />
          </button>
        )}
      </div>
    </motion.div>
  );
}
