"use client";

import { useState } from "react";
import { AlertCircle, Mail, Send, X } from "lucide-react";

import { emailBrief } from "@/lib/api";

export function EmailBriefPopover({
  companyId,
  briefId,
  emailConfigured,
  open,
  onClose,
  onSuccess,
}: {
  companyId: number;
  briefId: string;
  emailConfigured: boolean;
  open: boolean;
  onClose: () => void;
  onSuccess: (to: string) => void;
}) {
  const [recipient, setRecipient] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = recipient.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email address.");
      return;
    }
    setError(null);
    setSending(true);
    try {
      await emailBrief(companyId, briefId, trimmed);
      onSuccess(trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send email.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Email Monday Morning Brief"
      className="no-print fixed inset-0 z-50 flex items-center justify-center bg-[#1F2125]/25 p-4 backdrop-blur-xs"
    >
      <div className="glass-strong w-full max-w-md rounded-2xl p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-[#1F2125]/10 pb-3">
          <div className="flex items-center gap-2">
            <Mail size={16} className="text-[#4F46E5]" aria-hidden="true" />
            <h3 className="font-serif text-lg font-medium text-[#1F2125]">
              Email Monday Morning Brief
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close email dialog"
            className="focus-ring rounded-lg p-1 text-[#4B5058] hover:text-[#1F2125]"
          >
            <X size={15} />
          </button>
        </div>

        {!emailConfigured ? (
          <div className="mt-4 space-y-3">
            <div className="flex items-start gap-2 rounded-xl border border-[#EA580C]/30 bg-[#EA580C]/10 p-3 text-xs text-[#9A3412]">
              <AlertCircle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              <span>
                Email delivery is not configured on this server (missing{" "}
                <code className="font-mono">SMTP_HOST</code> or{" "}
                <code className="font-mono">RESEND_API_KEY</code>). Use{" "}
                <strong>Copy Markdown</strong> or <strong>Print / Save PDF</strong> instead.
              </span>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="focus-ring rounded-xl bg-[#1C1D21] px-3.5 py-2 text-xs font-medium text-white"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <div>
              <label
                htmlFor="brief-email-to"
                className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-[#4B5058]"
              >
                Recipient email
              </label>
              <input
                id="brief-email-to"
                type="email"
                required
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="founder@company.com"
                className="focus-ring mt-1.5 w-full rounded-xl border border-[#1F2125]/15 bg-white px-3 py-2 text-sm text-[#1F2125]"
              />
            </div>

            {error ? (
              <p role="alert" className="text-xs font-medium text-[#DC2626]">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="focus-ring rounded-xl border border-[#1F2125]/15 bg-white px-3.5 py-2 text-xs font-medium text-[#4B5058]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={sending}
                className="focus-ring inline-flex items-center gap-1.5 rounded-xl bg-[#1C1D21] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                <Send size={13} aria-hidden="true" />
                {sending ? "Sending…" : "Send brief"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
