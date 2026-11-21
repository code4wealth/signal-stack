"use client";

import { FileSpreadsheet, Globe, Sparkles, Swords, Users } from "lucide-react";

import type { AnswerCard, SourceCategory } from "@/lib/types";

const CAT_ICON: Record<SourceCategory, { Icon: typeof Users; color: string }> = {
  customers: { Icon: Users, color: "text-[#0D9488]" },
  competitors: { Icon: Swords, color: "text-[#EA580C]" },
  market: { Icon: Globe, color: "text-[#2563EB]" },
  internal: { Icon: FileSpreadsheet, color: "text-[#7C3AED]" },
};

export function AnswerCardView({
  answerCard,
  recommendation,
}: {
  answerCard?: AnswerCard | null;
  recommendation?: string | null;
}) {
  if (!answerCard && !recommendation) return null;

  return (
    <div className="mt-2.5 space-y-2">
      {answerCard && answerCard.rows.length > 0 ? (
        <div className="rounded-xl border border-[#1F2125]/10 bg-[#F8FAFC] p-3">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-wider text-[#4B5058]">
            {answerCard.title}
          </p>
          <ul className="mt-2 space-y-1.5">
            {answerCard.rows.map((row, idx) => {
              const cat = row.category ? CAT_ICON[row.category] : null;
              const Icon = cat?.Icon;
              return (
                <li
                  key={`${row.label}-${idx}`}
                  className="flex items-center justify-between gap-2 text-[11.5px]"
                >
                  <span className="flex min-w-0 items-center gap-1.5 text-[#1F2125]">
                    {Icon ? (
                      <Icon size={12} className={`shrink-0 ${cat.color}`} aria-hidden="true" />
                    ) : null}
                    <span className="truncate">{row.label}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[11px] font-semibold text-[#4B5058]">
                    {row.value}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {recommendation ? (
        <div className="rounded-xl border border-[#4F46E5]/15 bg-indigo-50/80 px-3 py-2.5">
          <p className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#4F46E5]">
            <Sparkles size={10} aria-hidden="true" />
            AI interpretation
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-[#1F2125]">{recommendation}</p>
        </div>
      ) : null}
    </div>
  );
}
