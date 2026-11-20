"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  Clock,
  ExternalLink,
  MoreHorizontal,
  RefreshCw,
  RotateCcw,
  Settings,
  ShieldAlert,
  Trash2,
  X,
} from "lucide-react";

import { formatRelativeTime } from "@/lib/company-adapter";
import { cardHoverMotion } from "@/lib/motion";
import type { Evidence, SignalStackSource, SourceFrequency } from "@/lib/types";
import {
  CategoryBadge,
  ConfidenceBadge,
  EvidenceChip,
  StatusPill,
} from "@/components/ui-shared";
import { RelevanceRing } from "@/components/signal-stack/RelevanceRing";

const CATEGORY_TOP_BORDER: Record<SignalStackSource["category"], string> = {
  customers: "border-t-[3px] border-t-[#0D9488]",
  competitors: "border-t-[3px] border-t-[#EA580C]",
  market: "border-t-[3px] border-t-[#2563EB]",
  internal: "border-t-[3px] border-t-[#7C3AED]",
};

function SourceFavicon({ name, domain }: { name: string; domain: string }) {
  const [failed, setFailed] = useState(false);
  const initial = (name || "S").trim().slice(0, 2).toUpperCase();

  if (!domain || failed) {
    return (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#1C1D21] text-xs font-semibold text-white">
        {initial}
      </span>
    );
  }
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#1F2125]/10 bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
        alt=""
        width={22}
        height={22}
        className="h-5 w-5 object-contain"
        onError={() => setFailed(true)}
      />
    </span>
  );
}

function SourceStatusPill({ status }: { status: SignalStackSource["status"] }) {
  if (status === "approved") {
    return (
      <StatusPill tone="verified" icon={<Check size={11} strokeWidth={2.5} aria-hidden="true" />}>
        Approved
      </StatusPill>
    );
  }
  if (status === "rejected") {
    return (
      <StatusPill tone="neutral" icon={<X size={11} strokeWidth={2} aria-hidden="true" />}>
        Rejected
      </StatusPill>
    );
  }
  if (status === "failing") {
    return (
      <StatusPill tone="threat" icon={<AlertTriangle size={11} strokeWidth={2} aria-hidden="true" />}>
        Failing
      </StatusPill>
    );
  }
  if (status === "blocked") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-[#DC2626]/45 bg-white/80 px-2.5 py-0.5 text-xs font-medium text-[#B91C1C]">
        <ShieldAlert size={11} strokeWidth={2} aria-hidden="true" />
        Blocked
      </span>
    );
  }
  return (
    <StatusPill tone="warning" icon={<Clock size={11} strokeWidth={2} aria-hidden="true" />}>
      Needs review
    </StatusPill>
  );
}

export function SourceCard({
  source,
  evidenceMap,
  isHighlighted,
  isChecking,
  onApprove,
  onReject,
  onRestore,
  onRecheck,
  onManage,
  onChangeFrequency,
  onDelete,
}: {
  source: SignalStackSource;
  evidenceMap: Map<string, Evidence>;
  isHighlighted: boolean;
  isChecking: boolean;
  onApprove: () => void;
  onReject: () => void;
  onRestore: () => void;
  onRecheck: () => void;
  onManage: () => void;
  onChangeFrequency: (freq: SourceFrequency) => void;
  onDelete: () => void;
}) {
  const reduced = Boolean(useReducedMotion());
  const [menuOpen, setMenuOpen] = useState(false);
  const [expandedWhy, setExpandedWhy] = useState(false);
  const [subOpen, setSubOpen] = useState(false);

  const extraTags: string[] = [
    source.type,
    source.crawlMethod.toUpperCase(),
    ...(source.language ? [source.language] : []),
    ...(source.isCustom ? ["Custom"] : []),
  ];
  // First tag slot is CategoryBadge, up to 3 more tags => max 4 total before "+N"
  const visibleExtraTags = extraTags.slice(0, 3);
  const hiddenTagCount = Math.max(0, extraTags.length - 3);

  const citedEvidence: Evidence[] = source.evidenceIds.slice(0, 2).map((idOrUrl, idx) => {
    const found = evidenceMap.get(idOrUrl);
    if (found) return found;
    return {
      id: `src-${source.id}-ev-${idx}`,
      url: idOrUrl,
      type: "webpage",
      usedFor: source.name,
      fetchedAt: source.lastCheckedAt ?? new Date().toISOString(),
      verified: true,
    };
  });

  const subSources = source.subSources ?? [];

  return (
    <motion.article
      layout={!reduced}
      whileHover={cardHoverMotion(reduced)}
      className={`glass-strong relative flex flex-col justify-between gap-4 rounded-2xl p-5 transition-colors duration-300 ${
        CATEGORY_TOP_BORDER[source.category]
      } ${isHighlighted ? "bg-[#ECFDF5]/95 ring-2 ring-[#059669]/35" : ""}`}
    >
      {/* Top section: Header + Body */}
      <div className="space-y-3.5">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex min-w-0 items-start gap-3">
            <SourceFavicon name={source.name} domain={source.domain} />
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-sm font-semibold text-[#1F2125]">{source.name}</h3>
                <SourceStatusPill status={source.status} />
              </div>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="focus-ring inline-flex max-w-full items-center gap-1 font-mono text-[11.5px] text-[#4B5058] no-underline hover:text-[#2563EB]"
              >
                <span className="truncate">{source.domain}</span>
                <ExternalLink size={11} className="shrink-0" aria-hidden="true" />
              </a>
            </div>
          </div>

          {/* Three-dot menu */}
          <div className="relative shrink-0">
            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              aria-label={`More actions for ${source.name}`}
              aria-expanded={menuOpen}
              className="focus-ring flex h-8 w-8 items-center justify-center rounded-xl text-[#9AA0AA] transition-colors hover:bg-white hover:text-[#1F2125]"
            >
              <MoreHorizontal size={16} strokeWidth={1.75} />
            </button>
            {menuOpen ? (
              <div className="glass-strong absolute right-0 top-full z-30 mt-1 w-48 space-y-0.5 rounded-2xl p-1.5 text-xs">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center justify-between rounded-xl px-2.5 py-1.5 font-medium text-[#1F2125] no-underline hover:bg-white"
                >
                  <span>Open source</span>
                  <ExternalLink size={12} />
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onManage();
                  }}
                  className="flex w-full items-center rounded-xl px-2.5 py-1.5 text-left font-medium text-[#1F2125] hover:bg-white"
                >
                  Edit details
                </button>
                <div className="border-y border-[#1F2125]/8 py-1">
                  <p className="px-2.5 py-0.5 font-mono text-[10px] uppercase text-[#9AA0AA]">
                    Frequency
                  </p>
                  {(["hourly", "daily", "weekly"] as const).map((freq) => (
                    <button
                      key={freq}
                      type="button"
                      onClick={() => {
                        setMenuOpen(false);
                        onChangeFrequency(freq);
                      }}
                      className={`flex w-full items-center justify-between rounded-xl px-2.5 py-1 text-left capitalize hover:bg-white ${
                        source.frequency === freq
                          ? "font-semibold text-[#4F46E5]"
                          : "text-[#4B5058]"
                      }`}
                    >
                      <span>{freq}</span>
                      {source.frequency === freq ? <Check size={11} /> : null}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onManage();
                  }}
                  className="flex w-full items-center rounded-xl px-2.5 py-1.5 text-left font-medium text-[#1F2125] hover:bg-white"
                >
                  View evidence
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onDelete();
                  }}
                  className="flex w-full items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-left font-medium text-[#DC2626] hover:bg-[#DC2626]/10"
                >
                  <Trash2 size={12} /> Remove
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Why this source */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setExpandedWhy((prev) => !prev)}
            className="focus-ring w-full rounded-lg text-left"
          >
            <p
              className={`text-xs leading-relaxed text-[#4B5058] ${
                expandedWhy ? "" : "line-clamp-2"
              }`}
            >
              {source.whyRecommended}
            </p>
          </button>

          {citedEvidence.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {citedEvidence.map((ev) => (
                <EvidenceChip key={ev.id} evidence={ev} compact />
              ))}
            </div>
          ) : null}
        </div>

        {/* Tag chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryBadge category={source.category} />
          {visibleExtraTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-[#1F2125]/10 bg-white/70 px-2.5 py-0.5 text-[11px] font-medium text-[#4B5058]"
            >
              {tag}
            </span>
          ))}
          {hiddenTagCount > 0 ? (
            <span className="rounded-full bg-[#F4F6FB] px-2 py-0.5 font-mono text-[10px] text-[#4B5058]">
              +{hiddenTagCount}
            </span>
          ) : null}
        </div>

        {/* Info block (like sync info block in reference) */}
        <div className="relative rounded-2xl border border-[#1F2125]/8 bg-[#F4F6FB]/75 p-3">
          <div className="flex items-center justify-between gap-3">
            <RelevanceRing score={source.relevanceScore} reasons={source.scoreReasons} />

            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-mono text-[11px] font-medium text-[#1F2125] capitalize">
                Check frequency: {source.frequency}
              </p>
              <p className="font-mono text-[11px] text-[#9AA0AA]">
                {source.lastCheckedAt
                  ? `Last checked ${formatRelativeTime(source.lastCheckedAt)}`
                  : "Not checked yet"}
              </p>
              <div className="pt-0.5">
                <ConfidenceBadge level={source.discoveryConfidence} />
              </div>
            </div>

            {subSources.length > 0 ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setSubOpen((prev) => !prev)}
                  aria-label={`View ${subSources.length} discovered sub-feeds`}
                  className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl border border-white/90 bg-white font-mono text-xs font-semibold text-[#1F2125] shadow-sm hover:bg-[#EEF2FF]"
                >
                  +{subSources.length}
                </button>
                {subOpen ? (
                  <div className="glass-strong absolute bottom-full right-0 z-20 mb-2 w-56 space-y-1.5 rounded-2xl p-3 text-xs">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-[#9AA0AA]">
                      Extra feeds / sections
                    </p>
                    <ul className="space-y-1">
                      {subSources.map((sub) => (
                        <li key={sub.url}>
                          <a
                            href={sub.url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between gap-1 font-mono text-[11px] text-[#2563EB] no-underline hover:underline"
                          >
                            <span className="truncate">{sub.name}</span>
                            <ExternalLink size={10} className="shrink-0" />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Syncing / Checking indicator if backend reports checking */}
      {isChecking || source.isChecking ? (
        <div className="flex items-center gap-2 rounded-xl bg-white/80 px-3 py-2">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
            className={`text-[#4F46E5] ${reduced ? "" : "animate-spin"}`}
          >
            <circle
              cx="12"
              cy="12"
              r="9"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeDasharray="3 5"
            />
          </svg>
          <span className={`text-xs font-medium ${reduced ? "text-[#4B5058]" : "text-shimmer"}`}>
            Checking source...
          </span>
        </div>
      ) : null}

      {/* Footer actions */}
      <div className="space-y-2 pt-0.5">
        {!source.robotsAllowed || source.status === "blocked" ? (
          <div className="space-y-2">
            <div className="flex items-start gap-2 rounded-xl border border-[#DC2626]/25 bg-[#DC2626]/5 px-3 py-2 text-xs text-[#B91C1C]">
              <ShieldAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>robots.txt does not allow crawling</span>
            </div>
            <button
              type="button"
              disabled
              title="Cannot approve because robots.txt disallows crawling"
              className="inline-flex h-9 w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-xl bg-[#CBD5E1]/60 text-xs font-medium text-[#64748B]"
            >
              Approve disabled
            </button>
          </div>
        ) : source.status === "failing" ? (
          <div className="space-y-2">
            <div className="flex items-start gap-2 rounded-xl border border-[#DC2626]/25 bg-[#DC2626]/5 px-3 py-2 text-xs text-[#B91C1C]">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="font-medium">Source unreachable</p>
                {source.lastError ? (
                  <p className="truncate font-mono text-[11px] text-[#991B1B]/80">
                    {source.lastError}
                  </p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              disabled={isChecking}
              onClick={onRecheck}
              className="btn-motion focus-ring inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-white/80 bg-white/80 text-xs font-medium text-[#1F2125] hover:bg-white disabled:opacity-50"
            >
              <RefreshCw size={13} className={isChecking ? "animate-spin" : ""} /> Re-check
            </button>
          </div>
        ) : source.status === "approved" ? (
          <button
            type="button"
            onClick={onManage}
            className="btn-motion focus-ring inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-white/80 bg-white/80 text-xs font-medium text-[#1F2125] hover:bg-white"
          >
            <Settings size={13} strokeWidth={1.75} aria-hidden="true" /> Manage
          </button>
        ) : source.status === "rejected" ? (
          <button
            type="button"
            onClick={onRestore}
            className="btn-motion focus-ring inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-white/80 bg-white/80 text-xs font-medium text-[#1F2125] hover:bg-white"
          >
            <RotateCcw size={13} strokeWidth={1.75} aria-hidden="true" /> Restore
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onApprove}
              className="btn-motion focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#1C1D21] text-xs font-medium text-white shadow-[0_6px_14px_rgba(28,29,33,0.14)] hover:bg-[#2a2c32]"
            >
              <Check size={13} strokeWidth={2} aria-hidden="true" /> Approve
            </button>
            <button
              type="button"
              onClick={onReject}
              className="btn-motion focus-ring inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-white/80 bg-white/75 text-xs font-medium text-[#1F2125] hover:bg-white"
            >
              <X size={13} strokeWidth={2} aria-hidden="true" /> Reject
            </button>
          </div>
        )}
      </div>
    </motion.article>
  );
}
