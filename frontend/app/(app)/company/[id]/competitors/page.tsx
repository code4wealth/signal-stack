"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Bot,
  Check,
  ExternalLink,
  Layers,
  Plus,
  Radar,
  RotateCcw,
  Swords,
} from "lucide-react";

import { api, ApiError } from "@/lib/api";
import { extractDomain } from "@/lib/company-adapter";
import type { CompetitorProfile } from "@/lib/types";
import {
  EmptyState,
  GlassCard,
  PageContainer,
  SkeletonBlock,
  StatusPill,
  Toast,
} from "@/components/ui-shared";

export default function CompetitorsPage() {
  const params = useParams<{ id: string }>();
  const companyId = Number(params?.id);
  const queryClient = useQueryClient();

  const [toast, setToast] = useState<{ id: number; tone: "ok" | "error"; message: string } | null>(
    null,
  );
  const [trackingUrl, setTrackingUrl] = useState<string | null>(null);

  const queryKey = ["competitors", companyId] as const;

  const competitorsQuery = useQuery({
    queryKey,
    queryFn: () => api.listCompetitors(companyId),
    enabled: Number.isFinite(companyId) && companyId > 0,
    staleTime: 60_000,
    retry: 1,
  });

  const discoverMutation = useMutation({
    mutationFn: () => api.discoverCompetitors(companyId),
    onSuccess: (res) => {
      setToast({
        id: Date.now(),
        tone: "ok",
        message: `Researched ${res.competitors.length} verified competitor profile(s) from ${res.fetched_count} fetched sites (${res.failed.length} skipped).`,
      });
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["company", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", companyId] });
    },
    onError: (err) => {
      setToast({
        id: Date.now(),
        tone: "error",
        message: err instanceof ApiError ? err.message : "Competitor discovery failed.",
      });
    },
  });

  const trackMutation = useMutation({
    mutationFn: async (comp: CompetitorProfile) => {
      setTrackingUrl(comp.website);
      return api.addSource(companyId, {
        name: `${comp.name} (Competitor)`,
        url: comp.website,
        category: "competitors",
        description: comp.positioning || comp.differentiation,
        reason: `Tracked from researched competitor profile (${comp.evidence_url})`,
        update_frequency: "weekly",
        reliability: 0.7,
      });
    },
    onSuccess: (_res, comp) => {
      setToast({
        id: Date.now(),
        tone: "ok",
        message: `Added ${comp.name} to Signal Stack competitor sources.`,
      });
      void queryClient.invalidateQueries({ queryKey });
      void queryClient.invalidateQueries({ queryKey: ["signal-stack", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["company", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", companyId] });
    },
    onError: (err) => {
      setToast({
        id: Date.now(),
        tone: "error",
        message: err instanceof ApiError ? err.message : "Could not add competitor source.",
      });
    },
    onSettled: () => {
      setTrackingUrl(null);
    },
  });

  const data = competitorsQuery.data;
  const competitors = data?.competitors ?? [];
  const hints = data?.hints ?? [];
  const monitored = useMemo(() => data?.monitored_sources ?? [], [data?.monitored_sources]);
  const failed = data?.meta?.failed ?? [];

  const trackedDomains = useMemo(() => {
    const set = new Set<string>();
    for (const s of monitored) {
      const dom = extractDomain(s.url);
      if (dom) set.add(dom.toLowerCase());
    }
    return set;
  }, [monitored]);

  const busy = discoverMutation.isPending || trackMutation.isPending;

  return (
    <PageContainer className="mx-auto max-w-[1320px] space-y-6 p-4 sm:p-6">
      {/* Header + Cross-segment links */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#EA580C]/12 text-[#EA580C]">
              <Swords size={16} aria-hidden="true" />
            </span>
            <h1 className="text-2xl font-semibold tracking-[-0.025em] text-[#1F2125]">
              Competitor landscape
            </h1>
          </div>
          <p className="mt-1 text-xs text-[#4B5058]">
            Verified competitor profiles researched directly from fetched public homepages. Unreachable sites are dropped.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/company/${companyId}/signal-stack?category=competitors`}
            className="btn-motion focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/85 bg-white/75 px-3.5 text-xs font-medium text-[#1F2125] no-underline hover:bg-white"
          >
            <Layers size={13} className="text-[#EA580C]" aria-hidden="true" />
            Competitor sources
          </Link>
          <Link
            href={`/company/${companyId}/signals?tab=feed&category=competitors`}
            className="btn-motion focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/85 bg-white/75 px-3.5 text-xs font-medium text-[#1F2125] no-underline hover:bg-white"
          >
            <Radar size={13} className="text-[#EA580C]" aria-hidden="true" />
            Competitor signals
          </Link>
          <Link
            href={`/company/${companyId}/crawler`}
            className="btn-motion focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl border border-white/85 bg-white/75 px-3.5 text-xs font-medium text-[#1F2125] no-underline hover:bg-white"
          >
            <Bot size={13} aria-hidden="true" />
            Crawler
          </Link>
          <button
            type="button"
            onClick={() => discoverMutation.mutate()}
            disabled={busy}
            className="btn-motion focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white shadow-[0_8px_18px_rgba(28,29,33,0.16)] hover:bg-[#2a2c32] disabled:cursor-not-allowed disabled:opacity-55"
          >
            <Radar size={14} className={discoverMutation.isPending ? "animate-spin" : ""} aria-hidden="true" />
            {discoverMutation.isPending ? "Researching competitors…" : "Discover & research"}
          </button>
        </div>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <GlassCard className="p-4">
          <p className="font-mono text-[10.5px] uppercase tracking-wider text-[#9AA0AA]">
            Researched profiles
          </p>
          <p className="tabular mt-1 text-2xl font-semibold text-[#1F2125]">{competitors.length}</p>
        </GlassCard>
        <GlassCard className="p-4">
          <p className="font-mono text-[10.5px] uppercase tracking-wider text-[#9AA0AA]">
            Monitored competitor sources
          </p>
          <p className="tabular mt-1 text-2xl font-semibold text-[#1F2125]">{monitored.length}</p>
        </GlassCard>
        <GlassCard className="p-4">
          <p className="font-mono text-[10.5px] uppercase tracking-wider text-[#9AA0AA]">
            Initial research hints
          </p>
          <p className="tabular mt-1 text-2xl font-semibold text-[#1F2125]">{hints.length}</p>
        </GlassCard>
      </div>

      {competitorsQuery.isError ? (
        <GlassCard className="flex flex-wrap items-center justify-between gap-3 border-[#DC2626]/25 bg-[#DC2626]/5 p-5">
          <p className="text-xs font-medium text-[#991B1B]">
            {competitorsQuery.error instanceof Error
              ? competitorsQuery.error.message
              : "Could not load competitors."}
          </p>
          <button
            type="button"
            onClick={() => void competitorsQuery.refetch()}
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl bg-[#1C1D21] px-3 text-xs font-medium text-white"
          >
            <RotateCcw size={12} /> Retry
          </button>
        </GlassCard>
      ) : null}

      {competitorsQuery.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : competitors.length === 0 ? (
        <EmptyState
          icon={<Swords size={22} className="text-[#EA580C]" />}
          title="No researched competitor profiles yet"
          description="Run competitor discovery after company research to fetch and verify 5–10 real competitors from their public homepages."
          action={
            <button
              type="button"
              onClick={() => discoverMutation.mutate()}
              disabled={busy}
              className="btn-motion focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white hover:bg-[#2a2c32]"
            >
              <Radar size={14} /> Discover competitors
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {competitors.map((comp) => {
            const domain = extractDomain(comp.website).toLowerCase();
            const isTracked = trackedDomains.has(domain);
            const isAddingThis = trackingUrl === comp.website;

            return (
              <GlassCard key={comp.website} spotlight className="flex flex-col justify-between gap-4 p-5">
                <div>
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#1F2125]/8 pb-3">
                    <div className="min-w-0">
                      <h2 className="text-base font-semibold text-[#1F2125]">{comp.name}</h2>
                      <a
                        href={comp.website}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-0.5 inline-flex items-center gap-1 font-mono text-xs text-[#4F46E5] no-underline hover:underline"
                      >
                        {comp.website} <ExternalLink size={11} aria-hidden="true" />
                      </a>
                    </div>

                    {isTracked ? (
                      <Link
                        href={`/company/${companyId}/signal-stack?category=competitors`}
                        className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-[#059669]/25 bg-[#059669]/10 px-3 text-xs font-medium text-[#047857] no-underline hover:bg-[#059669]/15"
                      >
                        <Check size={13} aria-hidden="true" /> Tracked
                      </Link>
                    ) : (
                      <button
                        type="button"
                        onClick={() => trackMutation.mutate(comp)}
                        disabled={busy}
                        className="btn-motion focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl border border-[#1F2125]/12 bg-white/85 px-3 text-xs font-medium text-[#1F2125] hover:bg-white disabled:opacity-50"
                      >
                        <Plus size={13} aria-hidden="true" />
                        {isAddingThis ? "Adding…" : "Track source"}
                      </button>
                    )}
                  </div>

                  <div className="mt-3 space-y-2 text-xs leading-relaxed">
                    {comp.positioning ? (
                      <p className="text-[#1F2125]">
                        <span className="font-semibold">Positioning:</span> {comp.positioning}
                      </p>
                    ) : null}
                    {comp.pricing_or_offer ? (
                      <p className="text-[#4B5058]">
                        <span className="font-semibold text-[#1F2125]">Offer / pricing:</span>{" "}
                        {comp.pricing_or_offer}
                      </p>
                    ) : null}
                    {comp.differentiation ? (
                      <p className="text-[#4B5058]">
                        <span className="font-semibold text-[#1F2125]">Differentiation:</span>{" "}
                        {comp.differentiation}
                      </p>
                    ) : null}
                  </div>

                  {comp.strengths.length > 0 || comp.weaknesses.length > 0 ? (
                    <div className="mt-3.5 grid gap-3 md:grid-cols-2">
                      {comp.strengths.length > 0 ? (
                        <div className="rounded-xl border border-[#059669]/20 bg-[#059669]/5 p-3">
                          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#047857]">
                            Strengths
                          </p>
                          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed text-[#1F2125]/85">
                            {comp.strengths.map((s) => (
                              <li key={s}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                      {comp.weaknesses.length > 0 ? (
                        <div className="rounded-xl border border-[#EA580C]/20 bg-[#EA580C]/5 p-3">
                          <p className="font-mono text-[10.5px] font-semibold uppercase tracking-wider text-[#C2410C]">
                            Weaknesses / gaps
                          </p>
                          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed text-[#1F2125]/85">
                            {comp.weaknesses.map((w) => (
                              <li key={w}>{w}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <p className="border-t border-[#1F2125]/8 pt-2.5 font-mono text-[11px] text-[#4B5058]">
                  Verified page:{" "}
                  <a
                    href={comp.evidence_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#4F46E5] no-underline hover:underline"
                  >
                    {comp.evidence_url}
                  </a>
                </p>
              </GlassCard>
            );
          })}
        </div>
      )}

      {failed.length > 0 ? (
        <GlassCard className="p-5">
          <h2 className="text-sm font-semibold text-[#1F2125]">
            Unreachable or skipped candidate sites ({failed.length})
          </h2>
          <ul className="mt-2.5 space-y-1.5 text-xs text-[#4B5058]">
            {failed.map((f) => (
              <li key={f.url}>
                <span className="font-medium text-[#1F2125]">{f.name}</span> ({f.url}) — {f.reason}
              </li>
            ))}
          </ul>
        </GlassCard>
      ) : null}

      {monitored.length > 0 ? (
        <GlassCard className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[#1F2125]">
              Active competitor monitoring sources ({monitored.length})
            </h2>
            <Link
              href={`/company/${companyId}/signal-stack?category=competitors`}
              className="inline-flex items-center gap-1 font-mono text-xs font-medium text-[#4F46E5] no-underline hover:underline"
            >
              Manage in Signal Stack <ArrowRight size={12} aria-hidden="true" />
            </Link>
          </div>
          <ul className="mt-3 divide-y divide-[#1F2125]/8 text-xs">
            {monitored.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <span className="font-medium text-[#1F2125]">{s.name}</span>
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 font-mono text-[11px] text-[#4F46E5] no-underline hover:underline"
                  >
                    {s.url}
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <StatusPill tone="neutral">{s.status}</StatusPill>
                  <StatusPill tone={s.health === "ok" ? "verified" : "threat"}>
                    {s.health}
                  </StatusPill>
                </div>
              </li>
            ))}
          </ul>
        </GlassCard>
      ) : null}

      {toast ? (
        <Toast
          key={toast.id}
          tone={toast.tone}
          message={toast.message}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </PageContainer>
  );
}
