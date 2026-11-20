"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, Check, Globe, Loader2, Target, Users, X } from "lucide-react";

import { ApiError, SourceValidationError } from "@/lib/api";
import { fadeUp } from "@/lib/motion";
import type { AddSourceValidation, SourceCategory } from "@/lib/types";

const CATEGORIES: { key: "customers" | "competitors" | "market"; label: string; Icon: typeof Users }[] = [
  { key: "customers", label: "Customers", Icon: Users },
  { key: "competitors", label: "Competitors", Icon: Target },
  { key: "market", label: "Market", Icon: Globe },
];

function ChecklistRow({
  label,
  state,
}: {
  label: string;
  state: "pending" | "ok" | "fail";
}) {
  return (
    <li className="flex items-center justify-between rounded-xl bg-white/75 px-3 py-2 text-xs">
      <span className="font-medium text-[#1F2125]">{label}</span>
      {state === "pending" ? (
        <Loader2 size={14} className="animate-spin text-[#4F46E5]" aria-label="Checking" />
      ) : state === "ok" ? (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#059669]/15 text-[#059669]">
          <Check size={12} strokeWidth={2.5} aria-label="Passed" />
        </span>
      ) : (
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#DC2626]/15 text-[#DC2626]">
          <X size={12} strokeWidth={2.5} aria-label="Failed" />
        </span>
      )}
    </li>
  );
}

export function AddSourceDialog({
  open,
  defaultCategory,
  onClose,
  onSubmitSource,
}: {
  open: boolean;
  defaultCategory: SourceCategory;
  onClose: () => void;
  onSubmitSource: (body: {
    url: string;
    name?: string;
    category: SourceCategory;
    reason?: string;
    forceAdd?: boolean;
  }) => Promise<unknown>;
}) {
  const reduced = Boolean(useReducedMotion());
  const initialCat: "customers" | "competitors" | "market" =
    defaultCategory === "internal" ? "market" : defaultCategory;

  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState<"customers" | "competitors" | "market">(initialCat);
  const [reason, setReason] = useState("");
  const [checking, setChecking] = useState(false);
  const [validation, setValidation] = useState<AddSourceValidation | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function normalizeUrl(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) return "";
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }

  async function submit(forceAdd = false) {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      setError("Enter a website or RSS feed URL.");
      return;
    }
    setError(null);
    setChecking(true);
    if (!forceAdd) setValidation(null);

    try {
      await onSubmitSource({
        url: normalized,
        name: name.trim() || undefined,
        category,
        reason: reason.trim() || undefined,
        forceAdd,
      });
      setUrl("");
      setName("");
      setReason("");
      setValidation(null);
      onClose();
    } catch (caught) {
      if (caught instanceof SourceValidationError) {
        setError(caught.message);
        setValidation(caught.validation);
      } else if (caught instanceof ApiError) {
        setError(caught.message);
      } else {
        setError("Could not verify source.");
      }
    } finally {
      setChecking(false);
    }
  }

  const canForceAdd = Boolean(validation && !validation.reachable && validation.robotsAllowed);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-source-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#1F2125]/25 p-0 backdrop-blur-sm md:items-center md:p-4"
    >
      <motion.div
        variants={fadeUp(reduced)}
        initial="hidden"
        animate="visible"
        className="glass-strong flex h-full w-full flex-col justify-between overflow-y-auto p-5 sm:p-6 md:h-auto md:max-w-lg md:rounded-2xl"
      >
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 id="add-source-title" className="text-base font-semibold text-[#1F2125]">
                Add monitoring source
              </h2>
              <p className="mt-0.5 text-xs text-[#4B5058]">
                We verify reachability, robots.txt permissions, and RSS/text before saving.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close add source dialog"
              className="focus-ring rounded-lg p-1 text-[#9AA0AA] hover:bg-white hover:text-[#1F2125]"
            >
              <X size={16} />
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit(false);
            }}
            className="space-y-3.5"
          >
            <div>
              <label htmlFor="add-source-url" className="block text-xs font-medium text-[#1F2125]">
                Source URL <span className="text-[#DC2626]">*</span>
              </label>
              <input
                id="add-source-url"
                type="text"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://news.example.com/feed"
                className="focus-ring mt-1 h-10 w-full rounded-xl border border-[#1F2125]/12 bg-white px-3 font-mono text-xs text-[#1F2125] outline-none"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="add-source-name" className="block text-xs font-medium text-[#1F2125]">
                  Display name <span className="text-[#9AA0AA]">(optional)</span>
                </label>
                <input
                  id="add-source-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Defaults to domain"
                  className="focus-ring mt-1 h-10 w-full rounded-xl border border-[#1F2125]/12 bg-white px-3 text-xs text-[#1F2125] outline-none"
                />
              </div>

              <div>
                <span className="block text-xs font-medium text-[#1F2125]">Category</span>
                <div className="mt-1 grid grid-cols-3 gap-1">
                  {CATEGORIES.map((c) => {
                    const Icon = c.Icon;
                    const active = category === c.key;
                    return (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setCategory(c.key)}
                        className={`focus-ring inline-flex h-10 items-center justify-center gap-1 rounded-xl border text-[11px] font-medium transition-colors ${
                          active
                            ? "border-[#1C1D21] bg-[#1C1D21] text-white"
                            : "border-[#1F2125]/12 bg-white/80 text-[#4B5058] hover:bg-white"
                        }`}
                      >
                        <Icon size={12} />
                        <span className="truncate">{c.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div>
              <label htmlFor="add-source-reason" className="block text-xs font-medium text-[#1F2125]">
                Why do you want to monitor this? <span className="text-[#9AA0AA]">(optional)</span>
              </label>
              <textarea
                id="add-source-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Competitor release notes or regulator updates"
                className="focus-ring mt-1 w-full rounded-xl border border-[#1F2125]/12 bg-white px-3 py-2 text-xs text-[#1F2125] outline-none"
              />
            </div>

            {(checking || validation) ? (
              <div className="rounded-2xl border border-white/80 bg-white/55 p-3">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-[#9AA0AA]">
                  Live source validation
                </p>
                <ul className="space-y-1.5">
                  <ChecklistRow
                    label="Reachable"
                    state={checking ? "pending" : validation?.reachable ? "ok" : "fail"}
                  />
                  <ChecklistRow
                    label="Allowed by robots.txt"
                    state={checking ? "pending" : validation?.robotsAllowed ? "ok" : "fail"}
                  />
                  <ChecklistRow
                    label="Feed or sitemap found"
                    state={checking ? "pending" : validation?.feedFound ? "ok" : "fail"}
                  />
                  <ChecklistRow
                    label="Readable text found"
                    state={checking ? "pending" : validation?.readableText ? "ok" : "fail"}
                  />
                </ul>
              </div>
            ) : null}

            {error ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-[#DC2626]/25 bg-[#DC2626]/5 px-3 py-2.5 text-xs text-[#B91C1C]"
              >
                <AlertCircle size={14} className="mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="focus-ring h-9 rounded-xl border border-[#1F2125]/12 bg-white px-3.5 text-xs font-medium text-[#1F2125]"
              >
                Cancel
              </button>

              {canForceAdd ? (
                <button
                  type="button"
                  disabled={checking}
                  onClick={() => void submit(true)}
                  className="focus-ring h-9 rounded-xl border border-[#EA580C]/40 bg-[#EA580C]/10 px-3.5 text-xs font-medium text-[#C2410C] hover:bg-[#EA580C]/15"
                >
                  Add anyway
                </button>
              ) : null}

              <button
                type="submit"
                disabled={checking}
                className="btn-motion focus-ring h-9 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white hover:bg-[#2a2c32] disabled:opacity-50"
              >
                {checking ? "Checking URL…" : "Check & add source"}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
