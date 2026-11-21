"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, ExternalLink, ShieldAlert, ShieldCheck, X } from "lucide-react";

import { formatRelativeTime, formatShortDate } from "@/lib/company-adapter";
import { sidePanelSlide } from "@/lib/motion";
import type {
  Evidence,
  SignalStackSource,
  SignalStackSourcePatch,
  SourceCategory,
  SourceFrequency,
} from "@/lib/types";
import { EvidenceChip, StatusPill } from "@/components/ui-shared";

export function ManageSourceDrawer({
  source,
  evidenceMap,
  onClose,
  onSave,
  onReject,
}: {
  source: SignalStackSource | null;
  evidenceMap: Map<string, Evidence>;
  onClose: () => void;
  onSave: (sourceId: number, patch: SignalStackSourcePatch) => Promise<void>;
  onReject: (sourceId: number) => Promise<void>;
}) {
  const reduced = Boolean(useReducedMotion());

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState<SourceCategory>("market");
  const [type, setType] = useState("");
  const [frequency, setFrequency] = useState<SourceFrequency>("daily");
  const [maxPages, setMaxPages] = useState(10);
  const [includePatterns, setIncludePatterns] = useState("");
  const [excludePatterns, setExcludePatterns] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (!source) return;
    setName(source.name);
    setUrl(source.url);
    setCategory(source.category);
    setType(source.type);
    setFrequency(source.frequency);
    setMaxPages(source.maxPages ?? 10);
    setIncludePatterns(source.includePatterns ?? "");
    setExcludePatterns(source.excludePatterns ?? "");
    setConfirmDiscard(false);
  }, [source]);

  if (!source) return null;

  const isDirty =
    name !== source.name ||
    url !== source.url ||
    category !== source.category ||
    type !== source.type ||
    frequency !== source.frequency ||
    maxPages !== (source.maxPages ?? 10) ||
    includePatterns !== (source.includePatterns ?? "") ||
    excludePatterns !== (source.excludePatterns ?? "");

  function attemptClose() {
    if (isDirty && !confirmDiscard) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }

  async function handleSave() {
    if (!source) return;
    setSaving(true);
    try {
      await onSave(source.id, {
        name: name.trim() || source.name,
        url: url.trim() || source.url,
        category,
        type: type.trim() || source.type,
        frequency,
        maxPages,
        includePatterns,
        excludePatterns,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const citedEvidence: Evidence[] = source.evidenceIds.map((idOrUrl, idx) => {
    const found = evidenceMap.get(idOrUrl);
    if (found) return found;
    return {
      id: `drawer-ev-${idx}`,
      url: idOrUrl,
      type: "webpage",
      usedFor: source.name,
      fetchedAt: source.lastCheckedAt ?? new Date().toISOString(),
      verified: true,
    };
  });

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex justify-end">
        <div
          className="fixed inset-0 bg-[#1F2125]/25 backdrop-blur-sm"
          onClick={attemptClose}
          aria-hidden="true"
        />

        <motion.aside
          variants={sidePanelSlide(reduced)}
          initial="hidden"
          animate="visible"
          exit="exit"
          role="dialog"
          aria-modal="true"
          aria-label={`Manage ${source.name}`}
          className="glass-strong relative z-10 flex h-full w-full flex-col justify-between border-l border-white/80 md:w-[400px]"
        >
          {/* Header */}
          <div className="flex items-center justify-between gap-3 border-b border-[#1F2125]/8 px-5 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="truncate text-sm font-semibold text-[#1F2125]">{source.name}</h2>
                <StatusPill tone={source.status === "approved" ? "verified" : "neutral"}>
                  {source.status.replace("_", " ")}
                </StatusPill>
              </div>
              <a
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-[11px] text-[#4B5058] no-underline hover:text-[#2563EB]"
              >
                <span className="truncate">{source.domain}</span>
                <ExternalLink size={10} />
              </a>
            </div>
            <button
              type="button"
              onClick={attemptClose}
              aria-label="Close source drawer"
              className="focus-ring rounded-lg p-1 text-[#9AA0AA] hover:bg-white hover:text-[#1F2125]"
            >
              <X size={16} />
            </button>
          </div>

          {/* Scrollable Body */}
          <div className="flex-1 space-y-5 overflow-y-auto p-5 text-xs">
            {/* Details */}
            <section className="space-y-3">
              <h3 className="font-mono text-[11px] uppercase tracking-wider text-[#9AA0AA]">
                Details
              </h3>
              <div className="space-y-2.5">
                <div>
                  <label className="block font-medium text-[#4B5058]">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="focus-ring mt-1 h-9 w-full rounded-xl border border-[#1F2125]/12 bg-white px-3 text-xs text-[#1F2125] outline-none"
                  />
                </div>
                <div>
                  <label className="block font-medium text-[#4B5058]">URL</label>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="focus-ring mt-1 h-9 w-full rounded-xl border border-[#1F2125]/12 bg-white px-3 font-mono text-xs text-[#1F2125] outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-medium text-[#4B5058]">Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as SourceCategory)}
                      className="focus-ring mt-1 h-9 w-full rounded-xl border border-[#1F2125]/12 bg-white px-2.5 text-xs text-[#1F2125] outline-none"
                    >
                      <option value="customers">Customers</option>
                      <option value="competitors">Competitors</option>
                      <option value="market">Market</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-[#4B5058]">Type</label>
                    <input
                      type="text"
                      value={type}
                      onChange={(e) => setType(e.target.value)}
                      className="focus-ring mt-1 h-9 w-full rounded-xl border border-[#1F2125]/12 bg-white px-3 text-xs text-[#1F2125] outline-none"
                    />
                  </div>
                </div>
              </div>
            </section>

            {/* Why recommended */}
            <section className="space-y-2 border-t border-[#1F2125]/8 pt-4">
              <h3 className="font-mono text-[11px] uppercase tracking-wider text-[#9AA0AA]">
                Why recommended
              </h3>
              <p className="leading-relaxed text-[#4B5058]">{source.whyRecommended}</p>
              {citedEvidence.length > 0 ? (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {citedEvidence.map((ev) => (
                    <EvidenceChip key={ev.id} evidence={ev} />
                  ))}
                </div>
              ) : null}
            </section>

            {/* Relevance breakdown */}
            <section className="space-y-2.5 border-t border-[#1F2125]/8 pt-4">
              <div className="flex items-center justify-between">
                <h3 className="font-mono text-[11px] uppercase tracking-wider text-[#9AA0AA]">
                  Relevance breakdown
                </h3>
                <span className="tabular font-mono font-semibold text-[#1F2125]">
                  {source.relevanceScore}/100
                </span>
              </div>
              {source.scoreReasons && source.scoreReasons.length > 0 ? (
                <div className="space-y-2">
                  {source.scoreReasons.map((r) => (
                    <div key={r.label} className="space-y-1">
                      <div className="flex justify-between gap-2 text-[11px]">
                        <span className="text-[#4B5058]">{r.label}</span>
                        <span className="tabular font-mono text-[#1F2125]">{r.weight}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/80">
                        <div
                          className="h-full rounded-full bg-[#4F46E5]"
                          style={{ width: `${Math.min(100, Math.max(0, r.weight))}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[#9AA0AA]">No breakdown returned for this source.</p>
              )}
            </section>

            {/* Crawl settings */}
            <section className="space-y-2.5 border-t border-[#1F2125]/8 pt-4">
              <h3 className="font-mono text-[11px] uppercase tracking-wider text-[#9AA0AA]">
                Crawl settings
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-[#4B5058]">Frequency</label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as SourceFrequency)}
                    className="focus-ring mt-1 h-9 w-full rounded-xl border border-[#1F2125]/12 bg-white px-2.5 text-xs text-[#1F2125] outline-none"
                  >
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-[#4B5058]">Max pages</label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={maxPages}
                    onChange={(e) => setMaxPages(Number(e.target.value) || 10)}
                    className="focus-ring mt-1 h-9 w-full rounded-xl border border-[#1F2125]/12 bg-white px-3 font-mono text-xs text-[#1F2125] outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block font-medium text-[#4B5058]">Include path patterns</label>
                <input
                  type="text"
                  value={includePatterns}
                  onChange={(e) => setIncludePatterns(e.target.value)}
                  placeholder="/blog/*, /changelog/*"
                  className="focus-ring mt-1 h-9 w-full rounded-xl border border-[#1F2125]/12 bg-white px-3 font-mono text-xs text-[#1F2125] outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-[#4B5058]">Exclude path patterns</label>
                <input
                  type="text"
                  value={excludePatterns}
                  onChange={(e) => setExcludePatterns(e.target.value)}
                  placeholder="/careers/*, /legal/*"
                  className="focus-ring mt-1 h-9 w-full rounded-xl border border-[#1F2125]/12 bg-white px-3 font-mono text-xs text-[#1F2125] outline-none"
                />
              </div>
            </section>

            {/* Access check */}
            <section className="space-y-2 border-t border-[#1F2125]/8 pt-4">
              <h3 className="font-mono text-[11px] uppercase tracking-wider text-[#9AA0AA]">
                Access check
              </h3>
              <div className="space-y-1.5 rounded-2xl bg-white/70 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[#4B5058]">robots.txt</span>
                  {source.robotsAllowed ? (
                    <span className="inline-flex items-center gap-1 font-medium text-[#059669]">
                      <ShieldCheck size={13} /> Allowed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 font-medium text-[#DC2626]">
                      <ShieldAlert size={13} /> Disallowed
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#4B5058]">Last HTTP status</span>
                  <span className="font-mono text-[#1F2125]">
                    {source.lastHttpStatus ?? (source.status === "failing" ? "Error" : "200")}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#4B5058]">Last checked</span>
                  <span className="font-mono text-[#1F2125]">
                    {source.lastCheckedAt ? formatRelativeTime(source.lastCheckedAt) : "Not yet"}
                  </span>
                </div>
              </div>
            </section>

            {/* Recent crawl results */}
            <section className="space-y-2 border-t border-[#1F2125]/8 pt-4">
              <h3 className="font-mono text-[11px] uppercase tracking-wider text-[#9AA0AA]">
                Recent crawl results
              </h3>
              {source.recentCrawls && source.recentCrawls.length > 0 ? (
                <ul className="space-y-1.5">
                  {source.recentCrawls.slice(0, 5).map((run, idx) => (
                    <li
                      key={idx}
                      className="flex items-center justify-between rounded-xl bg-white/70 px-3 py-2"
                    >
                      <span className="font-mono text-[11px] text-[#4B5058]">
                        {formatShortDate(run.at)}
                      </span>
                      <StatusPill tone={run.status === "ok" ? "verified" : "threat"}>
                        {run.status}
                      </StatusPill>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[#9AA0AA]">No crawl runs recorded for this source yet.</p>
              )}
            </section>
          </div>

          {/* Unsaved guard banner + Footer */}
          <div className="space-y-2.5 border-t border-[#1F2125]/8 bg-white/70 p-4">
            {confirmDiscard ? (
              <div className="flex items-center justify-between gap-2 rounded-xl bg-[#EEF2FF] px-3 py-2 text-xs text-[#4338CA]">
                <span>Discard unsaved changes?</span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirmDiscard(false)}
                    className="font-medium hover:underline"
                  >
                    Keep editing
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="font-semibold text-[#DC2626] hover:underline"
                  >
                    Discard
                  </button>
                </div>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={async () => {
                  await onReject(source.id);
                  onClose();
                }}
                className="focus-ring rounded-xl px-3 py-2 text-xs font-medium text-[#DC2626] hover:bg-[#DC2626]/10"
              >
                Reject source
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={() => void handleSave()}
                className="btn-motion focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white hover:bg-[#2a2c32] disabled:opacity-50"
              >
                <Check size={13} /> {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </motion.aside>
      </div>
    </AnimatePresence>
  );
}
