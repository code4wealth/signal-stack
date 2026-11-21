"use client";

import { useState } from "react";
import { Check, FileSpreadsheet, FileText, Trash2 } from "lucide-react";

import { formatShortDate } from "@/lib/company-adapter";
import type { UploadedFile } from "@/lib/types";
import { CategoryBadge, StatusPill } from "@/components/ui-shared";

const STEPS = ["Uploaded", "Parsing", "Analysed"] as const;

export function UploadedFileCard({
  file,
  onDelete,
}: {
  file: UploadedFile;
  onDelete: (id: number) => Promise<void>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isCsv = file.filename.toLowerCase().endsWith(".csv");
  const activeStep =
    file.status === "analysed" ? 3 : file.status === "parsing" ? 1 : 1;

  const counts = file.summary?.counts ?? {};
  const totalTopics = Object.values(counts).reduce((acc, v) => acc + (v || 0), 0);

  return (
    <article className="glass-strong flex flex-col justify-between gap-4 rounded-2xl border-t-[3px] border-t-[#7C3AED] p-5">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#7C3AED]/12 text-[#7C3AED]">
              {isCsv ? <FileSpreadsheet size={18} /> : <FileText size={18} />}
            </span>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-[#1F2125]">{file.filename}</h3>
              <p className="font-mono text-[11px] text-[#9AA0AA]">
                {file.size.toLocaleString()} chars · {formatShortDate(file.uploadedAt)}
              </p>
            </div>
          </div>
          <StatusPill tone={file.status === "analysed" ? "verified" : "info"}>
            {file.status}
          </StatusPill>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <CategoryBadge category="internal" />
          <span className="rounded-full border border-[#1F2125]/10 bg-white/75 px-2.5 py-0.5 text-[11px] font-medium text-[#4B5058]">
            user-provided
          </span>
          <span className="rounded-full border border-[#1F2125]/10 bg-white/75 px-2.5 py-0.5 font-mono text-[11px] text-[#4B5058]">
            {file.type.replace(/_/g, " ")}
          </span>
        </div>

        {/* Status stepper */}
        <ol className="grid grid-cols-3 gap-1.5 rounded-2xl border border-[#1F2125]/8 bg-[#F4F6FB]/75 p-2.5">
          {STEPS.map((label, idx) => {
            const done = idx < activeStep;
            return (
              <li key={label} className="flex items-center gap-1.5 font-mono text-[10.5px]">
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                    done ? "bg-[#059669] text-white" : "bg-white text-[#9AA0AA]"
                  }`}
                >
                  {done ? <Check size={10} strokeWidth={2.5} /> : idx + 1}
                </span>
                <span className={done ? "font-medium text-[#1F2125]" : "text-[#9AA0AA]"}>
                  {label}
                </span>
              </li>
            );
          })}
        </ol>

        {totalTopics > 0 ? (
          <p className="text-xs text-[#4B5058]">
            Detected <span className="tabular font-semibold text-[#1F2125]">{totalTopics}</span>{" "}
            internal signal item{totalTopics === 1 ? "" : "s"} across support/sales buckets.
          </p>
        ) : null}
      </div>

      <div>
        {confirmDelete ? (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-[#DC2626]/25 bg-[#DC2626]/5 px-3 py-2 text-xs">
            <span className="text-[#B91C1C]">Remove file?</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="font-medium text-[#4B5058]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true);
                  await onDelete(file.id);
                }}
                className="font-semibold text-[#DC2626]"
              >
                {deleting ? "Removing…" : "Confirm"}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="focus-ring inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-white/80 bg-white/75 text-xs font-medium text-[#4B5058] hover:bg-white hover:text-[#DC2626]"
          >
            <Trash2 size={13} strokeWidth={1.75} /> Remove file
          </button>
        )}
      </div>
    </article>
  );
}
