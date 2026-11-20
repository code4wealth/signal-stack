"use client";

import { useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";

import type { CompetitorDecision, CompetitorItem, Evidence } from "@/lib/types";
import { extractDomain } from "@/lib/company-adapter";
import { ConfidenceBadge, EmptyState, EvidenceChip, GlassCard, SectionHeader } from "@/components/ui-shared";

function CompetitorFavicon({ name, domain }: { name: string; domain: string }) {
  const [failed, setFailed] = useState(false);
  const initial = (name || "C").trim().charAt(0).toUpperCase();

  if (!domain || failed) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#EA580C]/12 text-xs font-semibold text-[#C2410C]">
        {initial}
      </span>
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#1F2125]/10 bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
        alt=""
        width={18}
        height={18}
        className="h-4.5 w-4.5 object-contain"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

export function CompetitorsSection({
  competitors,
  evidence,
  searchable = false,
  onDecisionChange,
  onAddCompetitor,
}: {
  competitors: CompetitorItem[];
  evidence: Evidence[];
  searchable?: boolean;
  onDecisionChange: (website: string, decision: CompetitorDecision) => void;
  onAddCompetitor: (item: { name: string; website: string; reason: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWebsite, setNewWebsite] = useState("");
  const [newReason, setNewReason] = useState("");

  const evidenceById = new Map(evidence.map((e) => [e.id, e]));

  const filtered = query.trim()
    ? competitors.filter(
        (c) =>
          c.name.toLowerCase().includes(query.toLowerCase()) ||
          c.domain.toLowerCase().includes(query.toLowerCase()) ||
          c.reason.toLowerCase().includes(query.toLowerCase()),
      )
    : competitors;

  function submitAdd(event: React.FormEvent) {
    event.preventDefault();
    const cleanName = newName.trim();
    const rawSite = newWebsite.trim();
    if (!cleanName || !rawSite) return;
    const normalizedSite = /^https?:\/\//i.test(rawSite) ? rawSite : `https://${rawSite}`;
    onAddCompetitor({
      name: cleanName,
      website: normalizedSite,
      reason: newReason.trim() || `Added manually (${extractDomain(normalizedSite)})`,
    });
    setNewName("");
    setNewWebsite("");
    setNewReason("");
    setAdding(false);
  }

  return (
    <GlassCard className="space-y-4">
      <SectionHeader
        title="Discovered competitors"
        subtitle="Review candidate competitors and keep the ones worth tracking."
        action={
          <button
            type="button"
            onClick={() => setAdding((prev) => !prev)}
            className="focus-ring inline-flex h-8 items-center gap-1 rounded-xl border border-white/80 bg-white/75 px-3 text-xs font-medium text-[#1F2125] hover:bg-white"
          >
            <Plus size={13} strokeWidth={1.75} /> Add competitor
          </button>
        }
      />

      {searchable && competitors.length > 0 ? (
        <div className="relative max-w-xs">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA0AA]"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter competitors…"
            aria-label="Filter competitors"
            className="focus-ring h-9 w-full rounded-xl border border-[#1F2125]/10 bg-white/80 pl-8 pr-3 text-xs text-[#1F2125] outline-none"
          />
        </div>
      ) : null}

      {adding ? (
        <form
          onSubmit={submitAdd}
          className="space-y-2.5 rounded-2xl border border-[#4F46E5]/25 bg-white/80 p-3.5"
        >
          <div className="grid gap-2 sm:grid-cols-3">
            <input
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Competitor name"
              aria-label="Competitor name"
              required
              className="focus-ring rounded-xl border border-[#1F2125]/12 bg-white px-3 py-1.5 text-xs text-[#1F2125] outline-none"
            />
            <input
              type="text"
              value={newWebsite}
              onChange={(event) => setNewWebsite(event.target.value)}
              placeholder="Website, e.g. rival.com"
              aria-label="Competitor website"
              required
              className="focus-ring rounded-xl border border-[#1F2125]/12 bg-white px-3 py-1.5 font-mono text-xs text-[#1F2125] outline-none"
            />
            <input
              type="text"
              value={newReason}
              onChange={(event) => setNewReason(event.target.value)}
              placeholder="Why they compete"
              aria-label="Competitor rationale"
              className="focus-ring rounded-xl border border-[#1F2125]/12 bg-white px-3 py-1.5 text-xs text-[#1F2125] outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setAdding(false)}
              className="focus-ring rounded-xl px-3 py-1 text-xs text-[#4B5058] hover:bg-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="focus-ring rounded-xl bg-[#1C1D21] px-3 py-1 text-xs font-medium text-white"
            >
              Save competitor
            </button>
          </div>
        </form>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          title="Not found on public sources"
          description="No competitors were identified yet. Add competitors manually or run competitor discovery later."
          action={
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="focus-ring inline-flex items-center gap-1 rounded-xl bg-[#1C1D21] px-3 py-1.5 text-xs font-medium text-white"
            >
              <Plus size={12} /> Add manually
            </button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((comp) => {
            const ev = comp.evidenceIds[0] ? evidenceById.get(comp.evidenceIds[0]) : undefined;
            const removed = comp.decision === "remove";
            const kept = comp.decision === "keep";

            return (
              <div
                key={comp.id}
                className={`flex flex-col justify-between gap-3 rounded-2xl border p-4 transition-all ${
                  removed
                    ? "border-[#1F2125]/10 bg-white/35 opacity-65"
                    : kept
                      ? "border-[#059669]/30 bg-white/85"
                      : "border-white/85 bg-white/70"
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <CompetitorFavicon name={comp.name} domain={comp.domain} />
                      <div className="min-w-0">
                        <h3 className="truncate text-xs font-semibold text-[#1F2125]">{comp.name}</h3>
                        <a
                          href={comp.website}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate font-mono text-[11px] text-[#4B5058] no-underline hover:text-[#2563EB]"
                        >
                          {comp.domain}
                        </a>
                      </div>
                    </div>
                    <ConfidenceBadge level={comp.confidence} />
                  </div>

                  <p className="text-xs leading-relaxed text-[#4B5058]">{comp.reason}</p>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#1F2125]/8 pt-2.5">
                  {ev ? <EvidenceChip evidence={ev} compact /> : <span className="text-[11px] text-[#9AA0AA]">No page cited</span>}

                  <div className="flex items-center gap-1 rounded-full border border-[#1F2125]/10 bg-white/80 p-0.5">
                    <button
                      type="button"
                      onClick={() => onDecisionChange(comp.website, kept ? "review" : "keep")}
                      className={`focus-ring inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                        kept ? "bg-[#059669] text-white" : "text-[#4B5058] hover:text-[#1F2125]"
                      }`}
                    >
                      <Check size={11} /> Keep
                    </button>
                    <button
                      type="button"
                      onClick={() => onDecisionChange(comp.website, removed ? "review" : "remove")}
                      className={`focus-ring inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                        removed ? "bg-[#DC2626] text-white" : "text-[#4B5058] hover:text-[#1F2125]"
                      }`}
                    >
                      <X size={11} /> Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
