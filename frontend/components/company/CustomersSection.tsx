"use client";

import { useState } from "react";
import { Plus, Search, Trash2, Users } from "lucide-react";

import type { Evidence, SegmentItem } from "@/lib/types";
import { EmptyState, EvidenceChip, GlassCard, SectionHeader } from "@/components/ui-shared";

export function CustomersSection({
  segments,
  evidence,
  searchable = false,
  onSaveSegments,
}: {
  segments: SegmentItem[];
  evidence: Evidence[];
  searchable?: boolean;
  onSaveSegments: (nextSegments: SegmentItem[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRationale, setNewRationale] = useState("");

  const evidenceById = new Map(evidence.map((e) => [e.id, e]));

  const filtered = query.trim()
    ? segments.filter(
        (s) =>
          s.name.toLowerCase().includes(query.toLowerCase()) ||
          s.rationale.toLowerCase().includes(query.toLowerCase()),
      )
    : segments;

  function addSegment(event: React.FormEvent) {
    event.preventDefault();
    const clean = newName.trim();
    if (!clean) return;
    onSaveSegments([
      ...segments,
      {
        id: `seg-manual-${Date.now()}`,
        name: clean,
        rationale: newRationale.trim() || clean,
        evidenceIds: [],
        verified: false,
      },
    ]);
    setNewName("");
    setNewRationale("");
    setAdding(false);
  }

  return (
    <GlassCard className="space-y-4">
      <SectionHeader
        title="Target customers"
        subtitle="Customer segments and buyer profiles grounded in fetched pages."
        action={
          <button
            type="button"
            onClick={() => setAdding((prev) => !prev)}
            className="focus-ring inline-flex h-8 items-center gap-1 rounded-xl border border-white/80 bg-white/75 px-3 text-xs font-medium text-[#1F2125] hover:bg-white"
          >
            <Plus size={13} strokeWidth={1.75} /> Add segment
          </button>
        }
      />

      {searchable && segments.length > 0 ? (
        <div className="relative max-w-xs">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA0AA]"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter customer segments…"
            aria-label="Filter customer segments"
            className="focus-ring h-9 w-full rounded-xl border border-[#1F2125]/10 bg-white/80 pl-8 pr-3 text-xs text-[#1F2125] outline-none"
          />
        </div>
      ) : null}

      {adding ? (
        <form
          onSubmit={addSegment}
          className="space-y-2.5 rounded-2xl border border-[#4F46E5]/25 bg-white/80 p-3.5"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Segment name"
              aria-label="Customer segment name"
              required
              className="focus-ring rounded-xl border border-[#1F2125]/12 bg-white px-3 py-1.5 text-xs text-[#1F2125] outline-none"
            />
            <input
              type="text"
              value={newRationale}
              onChange={(event) => setNewRationale(event.target.value)}
              placeholder="Why this segment is targeted"
              aria-label="Customer segment rationale"
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
              Save segment
            </button>
          </div>
        </form>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          title="Not found on public sources"
          description="No target customer segments were explicitly stated on the fetched pages."
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
        <ul className="divide-y divide-[#1F2125]/8">
          {filtered.map((seg) => {
            const ev = seg.evidenceIds[0] ? evidenceById.get(seg.evidenceIds[0]) : undefined;
            return (
              <li key={seg.id} className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-1 last:pb-1">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span
                    className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-[#0D9488]/12 text-[#0D9488]"
                    aria-hidden="true"
                  >
                    <Users size={14} strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <p className="text-xs font-semibold text-[#1F2125]">{seg.name}</p>
                    <p className="text-xs leading-relaxed text-[#4B5058]">{seg.rationale}</p>
                    {ev ? <EvidenceChip evidence={ev} compact /> : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onSaveSegments(segments.filter((item) => item.id !== seg.id))}
                  aria-label={`Remove ${seg.name}`}
                  className="focus-ring rounded-lg p-1 text-[#9AA0AA] hover:bg-white hover:text-[#DC2626]"
                >
                  <Trash2 size={13} strokeWidth={1.75} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </GlassCard>
  );
}
