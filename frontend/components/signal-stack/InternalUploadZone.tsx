"use client";

import { useRef, useState } from "react";
import { AlertCircle, FileSpreadsheet, FileText, Lock, UploadCloud } from "lucide-react";

export function InternalUploadZone({
  allowedExtensions,
  maxUploadBytes,
  isUploading,
  onUploadFile,
}: {
  allowedExtensions: string[];
  maxUploadBytes: number;
  isUploading: boolean;
  onUploadFile: (file: File, documentType: string) => Promise<unknown>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [documentType, setDocumentType] = useState("general");
  const [localError, setLocalError] = useState<string | null>(null);

  const maxMb = Math.max(1, Math.round(maxUploadBytes / (1024 * 1024)));
  const extLabels = allowedExtensions.map((e) => e.replace(".", "").toUpperCase());

  async function processFile(file: File | undefined) {
    if (!file) return;
    setLocalError(null);
    const lower = file.name.toLowerCase();
    if (!allowedExtensions.some((ext) => lower.endsWith(ext.toLowerCase()))) {
      setLocalError(`Unsupported file type. Accepted formats: ${extLabels.join(", ")}.`);
      return;
    }
    if (file.size > maxUploadBytes) {
      setLocalError(`File exceeds the ${maxMb} MB limit.`);
      return;
    }
    try {
      await onUploadFile(file, documentType);
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : "Upload failed.");
    }
  }

  return (
    <article
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void processFile(e.dataTransfer.files?.[0]);
      }}
      className={`flex flex-col justify-between gap-4 rounded-2xl border-2 border-dashed p-5 transition-colors ${
        dragging
          ? "border-[#7C3AED] bg-[#7C3AED]/10"
          : "border-[#7C3AED]/35 bg-[#7C3AED]/[0.04] hover:border-[#7C3AED]/55"
      }`}
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {extLabels.map((label) => (
            <span
              key={label}
              className="inline-flex items-center gap-1 rounded-full border border-[#7C3AED]/20 bg-white/80 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-[#6D28D9]"
            >
              {label === "CSV" || label === "XLSX" ? <FileSpreadsheet size={11} /> : <FileText size={11} />}
              {label}
            </span>
          ))}
          <span className="font-mono text-[10px] text-[#9AA0AA]">max {maxMb} MB</span>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-[#1F2125]">
            Drop files here or browse
          </h3>
          <p className="mt-1 flex items-center gap-1.5 text-xs text-[#4B5058]">
            <Lock size={12} className="shrink-0 text-[#7C3AED]" aria-hidden="true" />
            <span>Files stay private to your workspace.</span>
          </p>
        </div>

        <div>
          <label htmlFor="internal-doc-type" className="block font-mono text-[10px] uppercase text-[#9AA0AA]">
            Document category
          </label>
          <select
            id="internal-doc-type"
            value={documentType}
            onChange={(e) => setDocumentType(e.target.value)}
            className="focus-ring mt-1 h-8 w-full rounded-xl border border-white/80 bg-white/85 px-2.5 text-xs text-[#1F2125] outline-none"
          >
            <option value="general">General internal notes</option>
            <option value="support_tickets">Support tickets</option>
            <option value="sales_objections">Sales objections</option>
            <option value="lost_deals">Lost deal reasons</option>
            <option value="product_requests">Product requests</option>
          </select>
        </div>

        {localError ? (
          <p role="alert" className="flex items-start gap-1.5 text-xs text-[#B91C1C]">
            <AlertCircle size={13} className="mt-0.5 shrink-0" />
            <span>{localError}</span>
          </p>
        ) : null}
      </div>

      <div>
        <input
          ref={inputRef}
          type="file"
          accept={allowedExtensions.join(",")}
          onChange={(e) => {
            void processFile(e.target.files?.[0]);
            e.target.value = "";
          }}
          className="hidden"
          aria-label="Upload internal file"
        />
        <button
          type="button"
          disabled={isUploading}
          onClick={() => inputRef.current?.click()}
          className="btn-motion focus-ring inline-flex h-9 w-full items-center justify-center gap-2 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white hover:bg-[#2a2c32] disabled:opacity-55"
        >
          <UploadCloud size={14} strokeWidth={1.75} aria-hidden="true" />
          {isUploading ? "Uploading…" : "Browse files"}
        </button>
      </div>
    </article>
  );
}
