"use client";

import { useEffect, useState } from "react";
import { Check, Minus, Plus, X } from "lucide-react";

import type { AuditProposal, Evidence } from "@/lib/types";
import { CategoryBadge, EvidenceChip } from "@/components/ui-shared";

export function AuditReviewDialog({
  open,
  proposals,
  evidenceMap,
  isApplying,
  onClose,
  onApply,
}: {
  open: boolean;
  proposals: AuditProposal[];
  evidenceMap: Map<string, Evidence>;
  isApplying: boolean;
  onClose: () => void;
  onApply: (decisions: { proposalId: string; accepted: boolean }[]) => Promise<void>;
}) {
  const [choices, setChoices] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const initial: Record<string, boolean> = {};
    for (const p of proposals) initial[p.id] = true;
    setChoices(initial);
  }, [proposals]);

  if (!open) return null;

  const groups: { action: "add" | "keep" | "remove"; title: string }[] = [
    { action: "add", title: "Proposed additions" },
    { action: "keep", title: "Keep monitoring" },
    { action: "remove", title: "Proposed removals" },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-review-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#1F2125]/25 p-0 backdrop-blur-sm md:items-center md:p-4"
    >
      <div className="glass-strong flex h-full w-full max-w-3xl flex-col justify-between overflow-hidden md:h-auto md:max-h-[85vh] md:rounded-2xl">
        <div className="flex items-center justify-between border-b border-[#1F2125]/8 px-6 py-4">
          <div>
            <h2 id="audit-review-title" className="text-base font-semibold text-[#1F2125]">
              Monthly source audit proposals
            </h2>
            <p className="text-xs text-[#4B5058]">
              Accept or decline each proposed change before updating your Signal Stack.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close audit review"
            className="focus-ring rounded-lg p-1 text-[#9AA0AA] hover:bg-white hover:text-[#1F2125]"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          {groups.map((grp) => {
            const rows = proposals.filter((p) => p.action === grp.action);
            if (rows.length === 0) return null;
            return (
              <section key={grp.action} className="space-y-2.5">
                <h3 className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-[#4B5058]">
                  {grp.action === "add" ? (
                    <Plus size={13} className="text-[#16A34A]" />
                  ) : grp.action === "remove" ? (
                    <Minus size={13} className="text-[#DC2626]" />
                  ) : (
                    <Check size={13} className="text-[#64748B]" />
                  )}
                  {grp.title} ({rows.length})
                </h3>

                <ul className="space-y-2.5">
                  {rows.map((p) => {
                    const accepted = choices[p.id] ?? true;
                    return (
                      <li
                        key={p.id}
                        className="flex flex-col justify-between gap-3 rounded-2xl border border-white/85 bg-white/75 p-4 sm:flex-row sm:items-center"
                      >
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-semibold text-[#1F2125]">
                              {p.source.name}
                            </span>
                            <CategoryBadge category={p.source.category} />
                          </div>
                          <p className="text-xs text-[#4B5058]">{p.reasoning}</p>
                          {p.evidenceIds.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {p.evidenceIds.slice(0, 2).map((evId, i) => {
                                const ev = evidenceMap.get(evId) ?? {
                                  id: `aud-ev-${i}`,
                                  url: evId,
                                  type: "webpage" as const,
                                  usedFor: p.source.name,
                                  fetchedAt: new Date().toISOString(),
                                  verified: true,
                                };
                                return <EvidenceChip key={ev.id} evidence={ev} compact />;
                              })}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 items-center gap-1 rounded-full border border-[#1F2125]/10 bg-white p-0.5">
                          <button
                            type="button"
                            onClick={() => setChoices((prev) => ({ ...prev, [p.id]: true }))}
                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                              accepted ? "bg-[#1C1D21] text-white" : "text-[#4B5058]"
                            }`}
                          >
                            Accept
                          </button>
                          <button
                            type="button"
                            onClick={() => setChoices((prev) => ({ ...prev, [p.id]: false }))}
                            className={`rounded-full px-3 py-1 text-xs font-medium ${
                              !accepted ? "bg-[#DC2626] text-white" : "text-[#4B5058]"
                            }`}
                          >
                            Decline
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#1F2125]/8 bg-white/70 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="focus-ring h-9 rounded-xl border border-[#1F2125]/12 bg-white px-4 text-xs font-medium text-[#1F2125]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isApplying}
            onClick={async () => {
              await onApply(
                proposals.map((p) => ({
                  proposalId: p.id,
                  accepted: choices[p.id] ?? true,
                })),
              );
              onClose();
            }}
            className="btn-motion focus-ring h-9 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white hover:bg-[#2a2c32] disabled:opacity-50"
          >
            {isApplying ? "Applying…" : "Apply accepted changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
