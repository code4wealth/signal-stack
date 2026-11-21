import type { Brief, SourceCategory } from "@/lib/types";

export const BRIEF_SECTION_DEFS = [
  { id: "executive-summary", num: "01", label: "Executive Summary", category: null },
  { id: "customers", num: "02", label: "Customer Signals", category: "customers" as SourceCategory },
  { id: "competitors", num: "03", label: "Competitor Intelligence", category: "competitors" as SourceCategory },
  { id: "market", num: "04", label: "Market Intelligence", category: "market" as SourceCategory },
  { id: "internal", num: "05", label: "Internal Intelligence", category: "internal" as SourceCategory },
  { id: "opportunities", num: "06", label: "Opportunities", category: null },
  { id: "risks", num: "07", label: "Risks & Threats", category: null },
  { id: "actions", num: "08", label: "Recommended Actions", category: null },
  { id: "watch", num: "09", label: "What We Should Watch", category: null },
  { id: "sources", num: "10", label: "Source Appendix", category: null },
] as const;

export const CATEGORY_ACCENTS: Record<
  SourceCategory,
  {
    label: string;
    lineBg: string;
    tintBg: string;
    iconBg: string;
    iconText: string;
    dotBg: string;
  }
> = {
  customers: {
    label: "Customer Signals",
    lineBg: "bg-[#0D9488]",
    tintBg: "bg-[#0D9488]/[0.05]",
    iconBg: "bg-[#0D9488]/12",
    iconText: "text-[#0F766E]",
    dotBg: "bg-[#0D9488]",
  },
  competitors: {
    label: "Competitor Intelligence",
    lineBg: "bg-[#EA580C]",
    tintBg: "bg-[#EA580C]/[0.05]",
    iconBg: "bg-[#EA580C]/12",
    iconText: "text-[#C2410C]",
    dotBg: "bg-[#EA580C]",
  },
  market: {
    label: "Market Intelligence",
    lineBg: "bg-[#2563EB]",
    tintBg: "bg-[#2563EB]/[0.05]",
    iconBg: "bg-[#2563EB]/12",
    iconText: "text-[#1D4ED8]",
    dotBg: "bg-[#2563EB]",
  },
  internal: {
    label: "Internal Intelligence",
    lineBg: "bg-[#7C3AED]",
    tintBg: "bg-[#7C3AED]/[0.05]",
    iconBg: "bg-[#7C3AED]/12",
    iconText: "text-[#6D28D9]",
    dotBg: "bg-[#7C3AED]",
  },
};

export function getSectionCount(brief: Brief, sectionId: string): number {
  switch (sectionId) {
    case "executive-summary":
      return brief.executiveSummary.length;
    case "customers":
    case "competitors":
    case "market":
    case "internal":
      return brief.sections.find((s) => s.key === sectionId)?.items.length ?? 0;
    case "opportunities":
      return brief.opportunities.length;
    case "risks":
      return brief.risks.length;
    case "actions":
      return brief.actions.length;
    case "watch":
      return brief.watch.length;
    case "sources":
      return brief.sources.length;
    default:
      return 0;
  }
}

export function formatBriefDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.includes("T") ? iso : `${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function estimateReadingMinutes(brief: Brief): number {
  const chunks: string[] = [];
  brief.executiveSummary.forEach((i) => chunks.push(i.headline, i.fact.text, i.whyItMatters.text));
  brief.sections.forEach((s) => {
    if (s.summary) chunks.push(s.summary.text);
    s.items.forEach((i) => chunks.push(i.headline, i.fact.text, i.whyItMatters.text));
  });
  brief.opportunities.forEach((o) => chunks.push(o.headline, o.explanation.text));
  brief.risks.forEach((r) => chunks.push(r.headline, r.explanation.text));
  brief.actions.forEach((a) => chunks.push(a.text, a.rationale?.text ?? ""));
  brief.watch.forEach((w) => chunks.push(w.title, w.why.text));
  const words = chunks.join(" ").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(2, Math.ceil(words / 210));
}
