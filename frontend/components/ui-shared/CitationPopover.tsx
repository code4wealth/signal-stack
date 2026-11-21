"use client";

import { useEffect, useRef } from "react";
import {
  ArrowDownRight,
  CheckCircle2,
  ExternalLink,
  FileText,
  Globe,
  X,
} from "lucide-react";

import type { BriefSourceItem } from "@/lib/types";

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function CitationPopover({
  source,
  onClose,
  onJumpToSource,
}: {
  source: BriefSourceItem;
  onClose: () => void;
  onJumpToSource?: (n: number) => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    const onClickOutside = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClickOutside);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClickOutside);
    };
  }, [onClose]);

  const isInternalFile =
    source.url.startsWith("upload://") || source.type === "Internal file";

  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label={`Source ${source.n}: ${source.title}`}
      className="glass-strong no-print absolute left-0 top-full z-50 mt-2 w-[310px] rounded-2xl p-3.5 text-left shadow-[0_20px_48px_rgba(31,33,37,0.16)] sm:w-[340px]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-5 min-w-[24px] items-center justify-center rounded-md bg-[#4F46E5]/10 px-1.5 font-mono text-[11px] font-semibold text-[#4F46E5]">
            [{source.n}]
          </span>
          <span className="inline-flex items-center gap-1 rounded-full border border-[#1F2125]/10 bg-white/80 px-2 py-0.5 font-mono text-[10px] text-[#4B5058]">
            {isInternalFile ? <FileText size={10} aria-hidden="true" /> : <Globe size={10} aria-hidden="true" />}
            {source.type}
          </span>
          {source.verified ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-[#059669]/30 bg-white/85 px-2 py-0.5 font-mono text-[10px] font-medium text-[#047857]">
              <CheckCircle2 size={10} aria-hidden="true" />
              Verified
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close source preview"
          className="focus-ring rounded-lg p-1 text-[#9AA0AA] hover:bg-white/70 hover:text-[#1F2125]"
        >
          <X size={13} />
        </button>
      </div>

      <p className="mt-2 text-[13px] font-semibold leading-snug text-[#1F2125]">
        {source.title}
      </p>
      <p className="mt-0.5 truncate font-mono text-[11px] text-[#4B5058]">
        {source.domain}
      </p>

      <div className="mt-2.5 grid grid-cols-2 gap-2 rounded-xl border border-[#1F2125]/8 bg-white/60 px-2.5 py-2 font-mono text-[10.5px] text-[#4B5058]">
        <div>
          <span className="block text-[9.5px] uppercase tracking-wider text-[#9AA0AA]">Published</span>
          <span>{fmtDate(source.publishedAt)}</span>
        </div>
        <div>
          <span className="block text-[9.5px] uppercase tracking-wider text-[#9AA0AA]">Fetched</span>
          <span>{fmtDate(source.fetchedAt)}</span>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {onJumpToSource ? (
          <button
            type="button"
            onClick={() => {
              onJumpToSource(source.n);
              onClose();
            }}
            className="focus-ring inline-flex items-center gap-1 rounded-lg border border-[#4F46E5]/25 bg-[#4F46E5]/8 px-2.5 py-1 text-xs font-medium text-[#4F46E5] hover:bg-[#4F46E5]/15"
          >
            <ArrowDownRight size={13} aria-hidden="true" />
            Appendix [{source.n}]
          </button>
        ) : <span />}

        {!isInternalFile && source.url.startsWith("http") ? (
          <a
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="focus-ring inline-flex items-center gap-1 rounded-lg border border-[#1F2125]/12 bg-white px-2.5 py-1 text-xs font-medium text-[#1F2125] no-underline hover:bg-[#F4F6FB]"
          >
            Open URL <ExternalLink size={11} aria-hidden="true" />
          </a>
        ) : (
          <span className="font-mono text-[10.5px] text-[#4B5058]">Uploaded internal doc</span>
        )}
      </div>
    </div>
  );
}
