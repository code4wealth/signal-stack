"use client";

import { Briefcase, ShieldCheck, Sparkles, Swords } from "lucide-react";

import type { CompanyRecord } from "@/lib/types";
import { SkeletonBlock, StatCard } from "@/components/ui-shared";

export function StatCards({
  company,
  loading = false,
}: {
  company: CompanyRecord | null;
  loading?: boolean;
}) {
  if (loading || !company) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="surface-card space-y-3 p-4">
            <SkeletonBlock className="h-7 w-28" />
            <SkeletonBlock className="h-7 w-16" />
            <SkeletonBlock className="h-3 w-24" />
          </div>
        ))}
      </div>
    );
  }

  const needReviewCount = company.competitors.filter((c) => c.decision === "review").length;
  const verifiedEvidenceCount = company.evidence.filter((e) => e.verified).length;
  const confidenceLabel =
    company.confidence === "high"
      ? "High"
      : company.confidence === "medium"
        ? "Medium"
        : "Low";

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      <StatCard
        icon={<Briefcase size={16} strokeWidth={1.75} className="text-[#4F46E5]" />}
        iconBg="bg-[#4F46E5]/12"
        label="Services identified"
        value={company.services.length}
        footer={`from ${company.pagesFetchedCount} page${company.pagesFetchedCount === 1 ? "" : "s"}`}
      />
      <StatCard
        icon={<Swords size={16} strokeWidth={1.75} className="text-[#EA580C]" />}
        iconBg="bg-[#EA580C]/12"
        label="Competitors found"
        value={company.competitors.length}
        footer={`${needReviewCount} need review`}
      />
      <StatCard
        icon={<ShieldCheck size={16} strokeWidth={1.75} className="text-[#059669]" />}
        iconBg="bg-[#059669]/12"
        label="Evidence sources"
        value={company.evidence.length}
        footer={`${verifiedEvidenceCount} verified`}
      />
      <StatCard
        icon={<Sparkles size={16} strokeWidth={1.75} className="text-[#4F46E5]" />}
        iconBg="bg-[#4F46E5]/12"
        label="Profile confidence"
        value={confidenceLabel}
        footer="Based on evidence coverage"
      />
    </div>
  );
}
