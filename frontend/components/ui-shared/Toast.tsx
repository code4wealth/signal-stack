"use client";

import { AlertCircle, CheckCircle2, X } from "lucide-react";

export function Toast({
  message,
  tone = "ok",
  onDismiss,
}: {
  message: string | null;
  tone?: "ok" | "error";
  onDismiss: () => void;
}) {
  if (!message) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-5 right-5 z-50 flex max-w-sm items-center gap-2.5 rounded-2xl border px-4 py-3 text-xs font-medium shadow-[0_16px_40px_rgba(31,33,37,0.12)] backdrop-blur-xl ${
        tone === "error"
          ? "border-[#DC2626]/30 bg-white/90 text-[#B91C1C]"
          : "border-[#059669]/25 bg-white/90 text-[#1F2125]"
      }`}
    >
      {tone === "error" ? (
        <AlertCircle size={15} className="shrink-0 text-[#DC2626]" />
      ) : (
        <CheckCircle2 size={15} className="shrink-0 text-[#059669]" />
      )}
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss notification"
        className="rounded-md p-0.5 text-[#9AA0AA] hover:text-[#1F2125]"
      >
        <X size={13} />
      </button>
    </div>
  );
}
