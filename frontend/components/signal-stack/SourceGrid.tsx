"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, FileText, Globe, Plus, RefreshCw, Target, Users } from "lucide-react";

import { BASE_TRANSITION, FAST_TRANSITION } from "@/lib/motion";
import type {
  Evidence,
  SignalStackSource,
  SourceCategory,
  SourceFrequency,
  UploadedFile,
} from "@/lib/types";
import { EmptyState } from "@/components/ui-shared";
import { SourceCard } from "@/components/signal-stack/SourceCard";
import { AddSourcePromoCard } from "@/components/signal-stack/AddSourcePromoCard";
import { InternalUploadZone } from "@/components/signal-stack/InternalUploadZone";
import { UploadedFileCard } from "@/components/signal-stack/UploadedFileCard";

const CATEGORY_META: {
  key: SourceCategory;
  title: string;
  question: string;
  Icon: typeof Users;
  stripClass: string;
  iconColor: string;
}[] = [
  {
    key: "customers",
    title: "Customers",
    question: "What do customers need?",
    Icon: Users,
    stripClass: "bg-[#0D9488]/[0.05] border-[#0D9488]/15",
    iconColor: "text-[#0D9488]",
  },
  {
    key: "competitors",
    title: "Competitors",
    question: "What are competitors doing?",
    Icon: Target,
    stripClass: "bg-[#EA580C]/[0.05] border-[#EA580C]/15",
    iconColor: "text-[#EA580C]",
  },
  {
    key: "market",
    title: "Market",
    question: "What is changing in the industry?",
    Icon: Globe,
    stripClass: "bg-[#2563EB]/[0.05] border-[#2563EB]/15",
    iconColor: "text-[#2563EB]",
  },
  {
    key: "internal",
    title: "Internal",
    question: "What is happening inside the company?",
    Icon: FileText,
    stripClass: "bg-[#7C3AED]/[0.05] border-[#7C3AED]/15",
    iconColor: "text-[#7C3AED]",
  },
];

export function SourceGrid({
  sources,
  internalFiles,
  activeCategory,
  recommendedThreshold,
  allowedExtensions,
  maxUploadBytes,
  evidenceMap,
  justApprovedId,
  checkingIds,
  isUploadingFile,
  isBulkUpdating,
  onApprove,
  onReject,
  onRestore,
  onRecheck,
  onManage,
  onChangeFrequency,
  onDelete,
  onBulkApprove,
  onUploadFile,
  onDeleteFile,
  onOpenAddSource,
  onRerunDiscovery,
}: {
  sources: SignalStackSource[];
  internalFiles: UploadedFile[];
  activeCategory: SourceCategory | "all";
  recommendedThreshold: number;
  allowedExtensions: string[];
  maxUploadBytes: number;
  evidenceMap: Map<string, Evidence>;
  justApprovedId: number | null;
  checkingIds: Set<number>;
  isUploadingFile: boolean;
  isBulkUpdating: boolean;
  onApprove: (id: number) => void;
  onReject: (id: number) => void;
  onRestore: (id: number) => void;
  onRecheck: (id: number) => void;
  onManage: (source: SignalStackSource) => void;
  onChangeFrequency: (id: number, freq: SourceFrequency) => void;
  onDelete: (id: number) => void;
  onBulkApprove: (ids: number[]) => Promise<unknown>;
  onUploadFile: (file: File, docType: string) => Promise<unknown>;
  onDeleteFile: (id: number) => Promise<void>;
  onOpenAddSource: (cat?: SourceCategory) => void;
  onRerunDiscovery: () => void;
}) {
  const reduced = Boolean(useReducedMotion());
  const [confirmBulkCat, setConfirmBulkCat] = useState<SourceCategory | null>(null);

  if (activeCategory === "internal") {
    return (
      <motion.div
        key="cat-internal"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={FAST_TRANSITION}
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
      >
        <InternalUploadZone
          allowedExtensions={allowedExtensions}
          maxUploadBytes={maxUploadBytes}
          isUploading={isUploadingFile}
          onUploadFile={onUploadFile}
        />
        {internalFiles.map((file) => (
          <UploadedFileCard key={file.id} file={file} onDelete={onDeleteFile} />
        ))}
      </motion.div>
    );
  }

  if (activeCategory !== "all") {
    const catMeta = CATEGORY_META.find((c) => c.key === activeCategory);
    if (sources.length === 0) {
      return (
        <EmptyState
          title={`No ${catMeta?.title.toLowerCase() ?? activeCategory} sources found yet`}
          description="Re-run discovery or add a trusted website or RSS feed manually."
          action={
            <>
              <button
                type="button"
                onClick={onRerunDiscovery}
                className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#1F2125]/12 bg-white px-3.5 text-xs font-medium text-[#1F2125]"
              >
                <RefreshCw size={13} /> Re-run discovery
              </button>
              <button
                type="button"
                onClick={() => onOpenAddSource(activeCategory)}
                className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1C1D21] px-3.5 text-xs font-medium text-white"
              >
                <Plus size={13} /> Add source
              </button>
            </>
          }
        />
      );
    }

    return (
      <AnimatePresence mode="wait">
        <motion.div
          key={`cat-${activeCategory}`}
          initial={reduced ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={reduced ? undefined : { opacity: 0 }}
          transition={FAST_TRANSITION}
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {sources.map((src, idx) => (
            <motion.div
              key={src.id}
              initial={reduced ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                ...BASE_TRANSITION,
                delay: reduced ? 0 : Math.min(idx, 12) * 0.06,
              }}
            >
              <SourceCard
                source={src}
                evidenceMap={evidenceMap}
                isHighlighted={justApprovedId === src.id}
                isChecking={checkingIds.has(src.id)}
                onApprove={() => onApprove(src.id)}
                onReject={() => onReject(src.id)}
                onRestore={() => onRestore(src.id)}
                onRecheck={() => onRecheck(src.id)}
                onManage={() => onManage(src)}
                onChangeFrequency={(freq) => onChangeFrequency(src.id, freq)}
                onDelete={() => onDelete(src.id)}
              />
            </motion.div>
          ))}
          <AddSourcePromoCard onOpenAddSource={() => onOpenAddSource(activeCategory)} />
        </motion.div>
      </AnimatePresence>
    );
  }

  // "All" view: grouped by category headers
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key="cat-all"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={reduced ? undefined : { opacity: 0 }}
        transition={FAST_TRANSITION}
        className="space-y-8"
      >
        {CATEGORY_META.map((cat) => {
          const Icon = cat.Icon;
          const catSources = sources.filter((s) => s.category === cat.key);
          const recommendedPendingIds = catSources
            .filter(
              (s) =>
                s.status === "needs_review" &&
                s.robotsAllowed &&
                s.relevanceScore >= recommendedThreshold,
            )
            .map((s) => s.id);

          return (
            <section key={cat.key} className="space-y-4">
              <div
                className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-3 ${cat.stripClass}`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon size={17} strokeWidth={1.75} className={cat.iconColor} aria-hidden="true" />
                  <div>
                    <h2 className="text-sm font-semibold text-[#1F2125]">{cat.title}</h2>
                    <p className="text-xs text-[#4B5058]">{cat.question}</p>
                  </div>
                </div>

                {cat.key !== "internal" && recommendedPendingIds.length > 0 ? (
                  confirmBulkCat === cat.key ? (
                    <div className="flex items-center gap-2 rounded-xl bg-white px-3 py-1.5 text-xs shadow-sm">
                      <span className="text-[#4B5058]">
                        Approve {recommendedPendingIds.length} recommended?
                      </span>
                      <button
                        type="button"
                        disabled={isBulkUpdating}
                        onClick={async () => {
                          setConfirmBulkCat(null);
                          await onBulkApprove(recommendedPendingIds);
                        }}
                        className="font-semibold text-[#059669] hover:underline"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmBulkCat(null)}
                        className="text-[#9AA0AA] hover:text-[#1F2125]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmBulkCat(cat.key)}
                      className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl bg-white/80 px-3 text-xs font-medium text-[#1F2125] hover:bg-white"
                    >
                      <Check size={13} className="text-[#059669]" />
                      Approve all recommended ({recommendedPendingIds.length})
                    </button>
                  )
                ) : null}
              </div>

              {cat.key === "internal" ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <InternalUploadZone
                    allowedExtensions={allowedExtensions}
                    maxUploadBytes={maxUploadBytes}
                    isUploading={isUploadingFile}
                    onUploadFile={onUploadFile}
                  />
                  {internalFiles.map((file) => (
                    <UploadedFileCard key={file.id} file={file} onDelete={onDeleteFile} />
                  ))}
                </div>
              ) : catSources.length === 0 ? (
                <EmptyState
                  title={`No ${cat.title.toLowerCase()} sources found yet`}
                  description="Re-run discovery or add a trusted source manually."
                  action={
                    <>
                      <button
                        type="button"
                        onClick={onRerunDiscovery}
                        className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl border border-[#1F2125]/12 bg-white px-3 text-xs font-medium text-[#1F2125]"
                      >
                        <RefreshCw size={12} /> Re-run discovery
                      </button>
                      <button
                        type="button"
                        onClick={() => onOpenAddSource(cat.key)}
                        className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl bg-[#1C1D21] px-3 text-xs font-medium text-white"
                      >
                        <Plus size={12} /> Add source
                      </button>
                    </>
                  }
                />
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {catSources.map((src, idx) => (
                    <motion.div
                      key={src.id}
                      initial={reduced ? false : { opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        ...BASE_TRANSITION,
                        delay: reduced ? 0 : Math.min(idx, 12) * 0.06,
                      }}
                    >
                      <SourceCard
                        source={src}
                        evidenceMap={evidenceMap}
                        isHighlighted={justApprovedId === src.id}
                        isChecking={checkingIds.has(src.id)}
                        onApprove={() => onApprove(src.id)}
                        onReject={() => onReject(src.id)}
                        onRestore={() => onRestore(src.id)}
                        onRecheck={() => onRecheck(src.id)}
                        onManage={() => onManage(src)}
                        onChangeFrequency={(freq) => onChangeFrequency(src.id, freq)}
                        onDelete={() => onDelete(src.id)}
                      />
                    </motion.div>
                  ))}
                  {cat.key === "market" ? (
                    <AddSourcePromoCard onOpenAddSource={() => onOpenAddSource("market")} />
                  ) : null}
                </div>
              )}
            </section>
          );
        })}
      </motion.div>
    </AnimatePresence>
  );
}
