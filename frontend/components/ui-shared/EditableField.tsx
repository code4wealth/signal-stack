"use client";

import { useEffect, useState } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";

import type { Evidence } from "@/lib/types";
import { formatDomainPath, formatShortDate } from "@/lib/company-adapter";

export function EditableField({
  label,
  value,
  evidence,
  placeholder = "Enter value…",
  multiline = false,
  mono = false,
  onSave,
}: {
  label: string;
  value?: string | null;
  evidence?: Evidence | null;
  placeholder?: string;
  multiline?: boolean;
  mono?: boolean;
  onSave: (nextValue: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  useEffect(() => {
    setDraft(value ?? "");
  }, [value]);

  function commit() {
    const cleaned = draft.trim();
    setEditing(false);
    if (cleaned !== (value ?? "")) {
      onSave(cleaned);
    }
  }

  function cancel() {
    setDraft(value ?? "");
    setEditing(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    } else if (event.key === "Enter" && !multiline) {
      event.preventDefault();
      commit();
    } else if (event.key === "Enter" && multiline && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      commit();
    }
  }

  const isEmpty = !value || value.trim() === "" || value.trim().toLowerCase() === "unclear";

  return (
    <div className="group rounded-xl px-2 py-1.5 transition-colors hover:bg-white/55">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-[#4B5058]">{label}</span>
        {evidence ? (
          <a
            href={evidence.url}
            target="_blank"
            rel="noreferrer"
            title={`Source: ${formatDomainPath(evidence.url)} (${formatShortDate(evidence.fetchedAt)})`}
            className="max-w-[130px] truncate font-mono text-[10px] text-[#9AA0AA] no-underline hover:text-[#2563EB]"
          >
            {formatDomainPath(evidence.url)}
          </a>
        ) : null}
      </div>

      {editing ? (
        <div className="mt-1 space-y-1.5">
          {multiline ? (
            <textarea
              autoFocus
              rows={3}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              aria-label={label}
              className="focus-ring w-full rounded-lg border border-[#4F46E5]/35 bg-white px-2.5 py-1.5 text-xs text-[#1F2125] outline-none"
            />
          ) : (
            <input
              autoFocus
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              aria-label={label}
              className={`focus-ring w-full rounded-lg border border-[#4F46E5]/35 bg-white px-2.5 py-1 text-xs text-[#1F2125] outline-none ${
                mono ? "font-mono" : ""
              }`}
            />
          )}
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={cancel}
              aria-label={`Cancel editing ${label}`}
              className="focus-ring inline-flex h-6 items-center gap-1 rounded-md px-2 text-[11px] text-[#4B5058] hover:bg-white"
            >
              <X size={12} /> Cancel
            </button>
            <button
              type="button"
              onClick={commit}
              aria-label={`Save ${label}`}
              className="focus-ring inline-flex h-6 items-center gap-1 rounded-md bg-[#1C1D21] px-2 text-[11px] font-medium text-white hover:bg-[#2a2c32]"
            >
              <Check size={12} /> Save
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-0.5 flex items-center justify-between gap-2">
          {isEmpty ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="focus-ring inline-flex items-center gap-1 rounded-md text-xs italic text-[#9AA0AA] hover:text-[#4F46E5]"
            >
              <span>Not found</span>
              <span className="inline-flex items-center gap-0.5 font-medium not-italic text-[#4F46E5]">
                <Plus size={11} /> Add
              </span>
            </button>
          ) : (
            <span className={`text-xs font-medium text-[#1F2125] ${mono ? "font-mono" : ""}`}>
              {value}
            </span>
          )}
          {!isEmpty ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`Edit ${label}`}
              className="focus-ring rounded-md p-1 text-[#9AA0AA] opacity-0 transition-opacity hover:bg-white hover:text-[#1F2125] group-hover:opacity-100 focus-visible:opacity-100"
            >
              <Pencil size={12} strokeWidth={1.75} />
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
