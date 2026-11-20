"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Search, Trash2, X } from "lucide-react";

import type { Evidence, ServiceItem } from "@/lib/types";
import { EmptyState, EvidenceChip, GlassCard, SectionHeader } from "@/components/ui-shared";

export function ServicesSection({
  companyName,
  services,
  evidence,
  searchable = false,
  onSaveServices,
}: {
  companyName: string;
  services: ServiceItem[];
  evidence: Evidence[];
  searchable?: boolean;
  onSaveServices: (nextServices: ServiceItem[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftDesc, setDraftDesc] = useState("");
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");

  const evidenceById = new Map(evidence.map((e) => [e.id, e]));

  const filtered = query.trim()
    ? services.filter(
        (s) =>
          s.name.toLowerCase().includes(query.toLowerCase()) ||
          s.description.toLowerCase().includes(query.toLowerCase()),
      )
    : services;

  function startEdit(item: ServiceItem) {
    setEditingId(item.id);
    setDraftName(item.name);
    setDraftDesc(item.description);
  }

  function saveEdit(id: string) {
    const cleanName = draftName.trim();
    const cleanDesc = draftDesc.trim();
    if (!cleanName) return;
    onSaveServices(
      services.map((item) =>
        item.id === id ? { ...item, name: cleanName, description: cleanDesc || cleanName } : item,
      ),
    );
    setEditingId(null);
  }

  function removeItem(id: string) {
    onSaveServices(services.filter((item) => item.id !== id));
  }

  function addNew(event: React.FormEvent) {
    event.preventDefault();
    const cleanName = newName.trim();
    if (!cleanName) return;
    const item: ServiceItem = {
      id: `svc-manual-${Date.now()}`,
      name: cleanName,
      description: newDesc.trim() || cleanName,
      evidenceIds: [],
      verified: false,
    };
    onSaveServices([...services, item]);
    setNewName("");
    setNewDesc("");
    setAdding(false);
  }

  return (
    <GlassCard className="space-y-4">
      <SectionHeader
        title={`What ${companyName} does`}
        subtitle="Products and services identified from fetched public pages."
        action={
          <button
            type="button"
            onClick={() => setAdding((prev) => !prev)}
            className="focus-ring inline-flex h-8 items-center gap-1 rounded-xl border border-white/80 bg-white/75 px-3 text-xs font-medium text-[#1F2125] hover:bg-white"
          >
            <Plus size={13} strokeWidth={1.75} /> Add service
          </button>
        }
      />

      {searchable && services.length > 0 ? (
        <div className="relative max-w-xs">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#9AA0AA]"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter services…"
            aria-label="Filter services"
            className="focus-ring h-9 w-full rounded-xl border border-[#1F2125]/10 bg-white/80 pl-8 pr-3 text-xs text-[#1F2125] outline-none"
          />
        </div>
      ) : null}

      {adding ? (
        <form
          onSubmit={addNew}
          className="space-y-2.5 rounded-2xl border border-[#4F46E5]/25 bg-white/80 p-3.5"
        >
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Service name"
              aria-label="New service name"
              required
              className="focus-ring rounded-xl border border-[#1F2125]/12 bg-white px-3 py-1.5 text-xs text-[#1F2125] outline-none"
            />
            <input
              type="text"
              value={newDesc}
              onChange={(event) => setNewDesc(event.target.value)}
              placeholder="One-line description"
              aria-label="New service description"
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
              Save service
            </button>
          </div>
        </form>
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState
          title="Not found on public sources"
          description="No services were verified from public pages yet. Add one manually if needed."
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
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((item) => {
            const ev = item.evidenceIds[0] ? evidenceById.get(item.evidenceIds[0]) : undefined;
            const isEditing = editingId === item.id;
            return (
              <div
                key={item.id}
                className={`rounded-2xl border bg-white/65 p-3.5 transition-colors hover:bg-white/85 ${
                  item.verified ? "border-white/85" : "border-dashed border-[#94A3B8]"
                }`}
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setEditingId(null);
                        if (event.key === "Enter") saveEdit(item.id);
                      }}
                      aria-label="Service name"
                      className="focus-ring w-full rounded-lg border border-[#4F46E5]/35 bg-white px-2.5 py-1 text-xs font-semibold text-[#1F2125] outline-none"
                    />
                    <input
                      type="text"
                      value={draftDesc}
                      onChange={(event) => setDraftDesc(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setEditingId(null);
                        if (event.key === "Enter") saveEdit(item.id);
                      }}
                      aria-label="Service description"
                      className="focus-ring w-full rounded-lg border border-[#4F46E5]/35 bg-white px-2.5 py-1 text-xs text-[#4B5058] outline-none"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        aria-label="Cancel service edit"
                        className="rounded-lg p-1 text-[#4B5058] hover:bg-white"
                      >
                        <X size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(item.id)}
                        aria-label="Save service edit"
                        className="rounded-lg bg-[#1C1D21] px-2 py-1 text-[11px] font-medium text-white"
                      >
                        <Check size={12} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex h-full flex-col justify-between gap-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-semibold text-[#1F2125]">{item.name}</h3>
                        <p className="mt-1 text-xs leading-relaxed text-[#4B5058]">
                          {item.description}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          aria-label={`Edit ${item.name}`}
                          className="focus-ring rounded-lg p-1 text-[#9AA0AA] hover:bg-white hover:text-[#1F2125]"
                        >
                          <Pencil size={13} strokeWidth={1.75} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          aria-label={`Remove ${item.name}`}
                          className="focus-ring rounded-lg p-1 text-[#9AA0AA] hover:bg-white hover:text-[#DC2626]"
                        >
                          <Trash2 size={13} strokeWidth={1.75} />
                        </button>
                      </div>
                    </div>
                    {ev ? (
                      <div>
                        <EvidenceChip evidence={ev} compact />
                      </div>
                    ) : (
                      <span className="font-mono text-[10px] italic text-[#9AA0AA]">
                        Added manually
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
