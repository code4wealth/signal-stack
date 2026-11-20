"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, FileText } from "lucide-react";

import { api } from "@/lib/api";
import type { Company } from "@/lib/types";

const BRIEF_SECTIONS = [
  { heading: "1. Executive Summary", desc: "Three-sentence synthesis citing the highest-scoring crawled records." },
  { heading: "2. Top 5 Signals", desc: "Deterministically selected by score (100 × weighted relevance, impact, urgency, credibility, recency, novelty)." },
  { heading: "3. Customer & Buyer Signals", desc: "Verified customer reviews, procurement notices, and buyer shifts." },
  { heading: "4. Competitor Moves", desc: "Positioning, pricing, and product changes from monitored competitor domains." },
  { heading: "5. Market & Regulatory Trends", desc: "Verified regulatory, association, and funding updates." },
  { heading: "6. Internal Intelligence", desc: "User-uploaded tickets, sales objections, and lost-deal notes (labelled user-provided)." },
  { heading: "7. Strategic Implications", desc: "Structured opportunities with priority badges, impact, and cited record IDs." },
  { heading: "8. Risks & Watchlist", desc: "Identified threats with concrete mitigations and source citations." },
  { heading: "9. Recommended Actions", desc: "Trackable founder actions — every action without a valid record citation is dropped in code." },
  { heading: "10. Source Health & Coverage", desc: "Active approved sources, crawl errors, and duplicate counts." },
  { heading: "11. Record Citation Index", desc: "Complete list of every cited record ID with direct URLs and verbatim snippets." },
];

export default function SampleBriefPage() {
  const [companies, setCompanies] = useState<Company[]>([]);

  useEffect(() => {
    api
      .listCompanies()
      .then((res) => setCompanies(res.items))
      .catch(() => {
        /* backend optional on structure preview */
      });
  }, []);

  return (
    <div className="mx-auto min-h-screen max-w-4xl px-4 py-10 sm:px-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/"
          className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-white/80 bg-white/70 px-3.5 py-1.5 text-xs font-medium text-[#1F2125] no-underline backdrop-blur-md hover:bg-white"
        >
          <ArrowLeft size={13} /> Back to Signal Stack
        </Link>
        <span className="font-mono text-xs text-[#4B5058]">11 fixed sections · Zero fabricated claims</span>
      </div>

      <div className="glass-strong rounded-[28px] p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#1F2125]/8 pb-6">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-[#2563EB]/10 px-3 py-1 text-xs font-medium text-[#2563EB]">
              <FileText size={13} /> Monday Morning Brief Structure
            </div>
            <h1 className="mt-3 text-2xl font-semibold tracking-[-0.025em] text-[#1F2125] sm:text-3xl">
              How every Monday Morning Brief is built
            </h1>
            <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-[#4B5058]">
              Signal Stack never invents intelligence for sample previews. Every brief in your workspace follows this
              exact 11-section contract, where headings, top-5 selection, and every record citation are validated in
              code.
            </p>
          </div>
        </div>

        <ol className="mt-6 grid gap-3 sm:grid-cols-2">
          {BRIEF_SECTIONS.map((section) => (
            <li
              key={section.heading}
              className="rounded-2xl border border-white/80 bg-white/65 p-4 shadow-[0_6px_18px_rgba(31,33,37,0.03)]"
            >
              <div className="flex items-start gap-2.5">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#0D9488]" />
                <div>
                  <h2 className="text-sm font-semibold text-[#1F2125]">{section.heading}</h2>
                  <p className="mt-1 text-xs leading-relaxed text-[#4B5058]">{section.desc}</p>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[#1F2125]/8 pt-6">
          {companies.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-[#4B5058]">Open live briefs:</span>
              {companies.slice(0, 3).map((company) => (
                <Link
                  key={company.id}
                  href={`/company/${company.id}/briefs`}
                  className="inline-flex items-center gap-1 rounded-xl border border-white/80 bg-white/80 px-3 py-1.5 text-xs font-medium text-[#1F2125] no-underline hover:bg-white"
                >
                  {company.name} <ArrowRight size={12} />
                </Link>
              ))}
            </div>
          ) : (
            <span className="text-xs text-[#4B5058]">
              Start company research on the home page to generate a live, citation-backed brief.
            </span>
          )}

          <Link
            href="/"
            className="btn-motion inline-flex h-10 items-center gap-2 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white no-underline shadow-sm hover:bg-[#2a2c32]"
          >
            Research my company <ArrowRight size={13} />
          </Link>
        </div>
      </div>
    </div>
  );
}
