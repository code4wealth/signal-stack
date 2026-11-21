"use client";

import Link from "next/link";
import { FileText, Sparkles } from "lucide-react";

import { EmptyState, GlassCard } from "@/components/ui-shared";
import { Button } from "@/components/ui/button";
import type { BriefPrerequisites } from "@/lib/types";

export function BriefEmptyState({
  companyId,
  prerequisites,
  onGenerate,
  isGenerating,
}: {
  companyId: number;
  prerequisites: BriefPrerequisites;
  onGenerate: () => void;
  isGenerating: boolean;
}) {
  return (
    <div className="mx-auto max-w-[780px] py-8">
      <GlassCard className="p-6 sm:p-8">
        <EmptyState
          icon={<FileText size={22} className="text-[#4F46E5]" />}
          title="No Monday Morning Brief yet"
          description={
            prerequisites.ready
              ? `${prerequisites.signalsCount} analysed signals are ready. Generate your first citation-backed executive brief now.`
              : (prerequisites.reason ??
                "Run a source crawl and analyse signals before generating your Monday Morning Brief.")
          }
          action={
            prerequisites.ready ? (
              <Button onClick={onGenerate} disabled={isGenerating}>
                <Sparkles size={15} aria-hidden="true" />
                {isGenerating ? "Starting…" : "Generate Monday Brief"}
              </Button>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Link
                  href={`/company/${companyId}/crawler`}
                  className="focus-ring inline-flex items-center rounded-xl border border-[#1F2125]/15 bg-white px-4 py-2 text-xs font-semibold text-[#1F2125] no-underline hover:bg-[#F4F6FB]"
                >
                  Open Crawler
                </Link>
                <Link
                  href={`/company/${companyId}/signals`}
                  className="focus-ring inline-flex items-center rounded-xl bg-[#1C1D21] px-4 py-2 text-xs font-semibold text-white no-underline hover:bg-[#1C1D21]/90"
                >
                  Analyse Signals
                </Link>
              </div>
            )
          }
        />
      </GlassCard>
    </div>
  );
}
