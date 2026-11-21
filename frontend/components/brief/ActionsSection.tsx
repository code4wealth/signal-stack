"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Copy,
  Download,
  GripVertical,
  Plus,
  Sparkles,
} from "lucide-react";

import { CountUp } from "@/components/motion/CountUp";
import { Cite, ClaimText } from "@/components/ui-shared";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import { actionsChecklistText, actionsToCsv } from "@/lib/brief-markdown";
import { drawPath, readingReveal } from "@/lib/motion";
import type { BriefActionItem, BriefSourceItem } from "@/lib/types";

const EFFORT_STYLE = {
  low: "border-[#059669]/25 bg-[#059669]/8 text-[#047857]",
  medium: "border-[#2563EB]/25 bg-[#2563EB]/8 text-[#1D4ED8]",
  high: "border-[#EA580C]/25 bg-[#EA580C]/10 text-[#C2410C]",
};

function formatDueLabel(dueDate?: string | null): string {
  if (!dueDate) return "Set due";
  const parsed = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return dueDate;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((parsed.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays > 1 && diffDays < 7) {
    return parsed.toLocaleDateString("en-US", { weekday: "short" });
  }
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ActionRow({
  action,
  index,
  total,
  linkedHeadline,
  sources,
  isDraftEditable,
  isArchived,
  onToggleDone,
  onUpdateFields,
  onMove,
  onDragStart,
  onDropOnRow,
  onInspectSignal,
  onJumpToSource,
}: {
  action: BriefActionItem;
  index: number;
  total: number;
  linkedHeadline?: string | null;
  sources: BriefSourceItem[];
  isDraftEditable: boolean;
  isArchived: boolean;
  onToggleDone: (action: BriefActionItem) => void;
  onUpdateFields: (
    actionId: string,
    patch: { owner?: string; dueDate?: string | null },
  ) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onDragStart: (index: number) => void;
  onDropOnRow: (targetIndex: number) => void;
  onInspectSignal: (signalId: number) => void;
  onJumpToSource: (n: number, originId?: string) => void;
}) {
  const { reduced } = useMotionSafe();
  const [whyOpen, setWhyOpen] = useState(false);
  const [editingMeta, setEditingMeta] = useState(false);
  const [ownerDraft, setOwnerDraft] = useState(action.owner);
  const [dueDraft, setDueDraft] = useState(action.dueDate ?? "");

  const originId = `action-${action.id}`;

  return (
    <div
      id={originId}
      draggable={isDraftEditable}
      onDragStart={() => isDraftEditable && onDragStart(index)}
      onDragOver={(e) => {
        if (isDraftEditable) e.preventDefault();
      }}
      onDrop={() => isDraftEditable && onDropOnRow(index)}
      className={`rounded-2xl border p-4 transition-colors ${
        action.done
          ? "border-[#1F2125]/8 bg-white/55 opacity-80"
          : "border-[#4F46E5]/18 bg-white/95"
      }`}
    >
      <div className="flex items-start gap-3">
        {isDraftEditable ? (
          <span
            className="no-print mt-1 hidden cursor-grab text-[#9AA0AA] sm:inline-flex"
            aria-hidden="true"
            title="Drag to reorder"
          >
            <GripVertical size={15} />
          </span>
        ) : null}

        {/* Accessible real checkbox + animated SVG check */}
        <label className="relative mt-0.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center">
          <input
            type="checkbox"
            checked={action.done}
            disabled={isArchived}
            onChange={() => onToggleDone(action)}
            aria-label={`Mark action "${action.text}" as ${action.done ? "not done" : "done"}`}
            className="focus-ring peer sr-only"
          />
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-md border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-[#4F46E5]/40 ${
              action.done
                ? "border-[#4F46E5] bg-[#4F46E5] text-white"
                : "border-[#1F2125]/25 bg-white hover:border-[#4F46E5]"
            }`}
          >
            {action.done ? (
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 fill-none stroke-current stroke-[2.2]" aria-hidden="true">
                <motion.path
                  d="M3.2 8.4 L6.6 11.6 L12.8 4.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  variants={drawPath(reduced)}
                  initial="hidden"
                  animate="visible"
                />
              </svg>
            ) : null}
          </span>
        </label>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div
              className={`text-[15px] font-medium leading-snug ${
                action.done ? "text-[#9AA0AA] line-through" : "text-[#1F2125]"
              }`}
            >
              {action.text}
              {!action.isCustom ? (
                <Cite
                  ids={action.citations}
                  sources={sources}
                  onJumpToSource={(n) => onJumpToSource(n, originId)}
                />
              ) : null}
            </div>

            {isDraftEditable ? (
              <div className="no-print flex items-center gap-1">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => onMove(index, -1)}
                  aria-label="Move action up"
                  className="focus-ring rounded-lg border border-[#1F2125]/10 bg-white p-1 text-[#4B5058] disabled:opacity-35"
                >
                  <ArrowUp size={12} />
                </button>
                <button
                  type="button"
                  disabled={index === total - 1}
                  onClick={() => onMove(index, 1)}
                  aria-label="Move action down"
                  className="focus-ring rounded-lg border border-[#1F2125]/10 bg-white p-1 text-[#4B5058] disabled:opacity-35"
                >
                  <ArrowDown size={12} />
                </button>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className={`rounded-full border px-2 py-0.5 font-mono text-[10.5px] font-medium uppercase ${EFFORT_STYLE[action.effort]}`}>
              {action.effort} effort
            </span>

            {editingMeta && !isArchived ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onUpdateFields(action.id, {
                    owner: ownerDraft.trim() || "Founder",
                    dueDate: dueDraft || null,
                  });
                  setEditingMeta(false);
                }}
                className="no-print flex flex-wrap items-center gap-1.5"
              >
                <input
                  type="text"
                  value={ownerDraft}
                  onChange={(e) => setOwnerDraft(e.target.value)}
                  aria-label="Action owner"
                  className="focus-ring h-7 w-28 rounded-lg border border-[#1F2125]/15 bg-white px-2 text-xs"
                />
                <input
                  type="date"
                  value={dueDraft}
                  onChange={(e) => setDueDraft(e.target.value)}
                  aria-label="Action due date"
                  className="focus-ring h-7 rounded-lg border border-[#1F2125]/15 bg-white px-2 font-mono text-xs"
                />
                <button
                  type="submit"
                  className="focus-ring rounded-lg bg-[#1C1D21] px-2 py-1 text-[11px] font-medium text-white"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditingMeta(false)}
                  className="focus-ring rounded-lg border border-[#1F2125]/15 bg-white px-2 py-1 text-[11px] text-[#4B5058]"
                >
                  Cancel
                </button>
              </form>
            ) : (
              <button
                type="button"
                disabled={isArchived}
                onClick={() => setEditingMeta(true)}
                className="focus-ring inline-flex items-center gap-1.5 rounded-full border border-[#1F2125]/10 bg-[#F4F6FB] px-2.5 py-0.5 font-mono text-[11px] text-[#4B5058] hover:border-[#4F46E5]/30 hover:text-[#1F2125] disabled:cursor-default"
              >
                <span>Owner: {action.owner}</span>
                <span>· Due: {formatDueLabel(action.dueDate)}</span>
              </button>
            )}

            {action.linkedSignalId ? (
              <button
                type="button"
                onClick={() => onInspectSignal(Number(action.linkedSignalId))}
                className="no-print focus-ring max-w-[260px] truncate rounded-full border border-[#4F46E5]/20 bg-[#4F46E5]/8 px-2.5 py-0.5 font-mono text-[10.5px] font-medium text-[#4F46E5] hover:bg-[#4F46E5]/15"
              >
                From: {linkedHeadline || `Signal #${action.linkedSignalId}`}
              </button>
            ) : null}

            {action.rationale?.text ? (
              <button
                type="button"
                aria-expanded={whyOpen}
                onClick={() => setWhyOpen((v) => !v)}
                className="no-print focus-ring inline-flex items-center gap-1 font-mono text-[11px] font-medium text-[#4B5058] hover:text-[#1F2125]"
              >
                Why this action?
                {whyOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            ) : null}
          </div>

          {whyOpen && action.rationale?.text ? (
            <div className="rounded-xl border border-[#4F46E5]/15 bg-indigo-50/75 px-3 py-2 text-xs leading-relaxed text-[#1F2125]">
              <span className="inline-flex items-center gap-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-[#4F46E5]">
                <Sparkles size={10} aria-hidden="true" />
                AI interpretation
              </span>
              <div className="mt-1">
                <ClaimText
                  text={action.rationale.text}
                  citations={action.rationale.citations}
                  sources={sources}
                  onJumpToSource={(n) => onJumpToSource(n, originId)}
                />
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ActionsSection({
  actions,
  signalHeadlines,
  sources,
  isDraftEditable,
  isArchived,
  isMock,
  onUpdateAction,
  onCreateAction,
  isCreatingAction,
  onInspectSignal,
  onJumpToSource,
  onToast,
}: {
  actions: BriefActionItem[];
  signalHeadlines: Record<string, string>;
  sources: BriefSourceItem[];
  isDraftEditable: boolean;
  isArchived: boolean;
  isMock?: boolean;
  onUpdateAction: (payload: {
    actionId: string;
    patch: { done?: boolean; owner?: string; dueDate?: string | null; order?: number };
  }) => Promise<unknown>;
  onCreateAction: (payload: {
    text: string;
    owner: string;
    dueDate?: string | null;
    effort: "low" | "medium" | "high";
  }) => Promise<unknown>;
  isCreatingAction: boolean;
  onInspectSignal: (signalId: number) => void;
  onJumpToSource: (n: number, originId?: string) => void;
  onToast: (msg: string) => void;
}) {
  const { reduced } = useMotionSafe();
  const [addOpen, setAddOpen] = useState(false);
  const [newText, setNewText] = useState("");
  const [newOwner, setNewOwner] = useState("Founder");
  const [newDue, setNewDue] = useState("");
  const [newEffort, setNewEffort] = useState<"low" | "medium" | "high">("medium");
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [copiedChecklist, setCopiedChecklist] = useState(false);

  const visibleActions = actions.slice(0, 7);
  const doneCount = actions.filter((a) => a.done).length;
  const pct = actions.length > 0 ? doneCount / actions.length : 0;

  const handleMove = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= visibleActions.length) return;
    const current = visibleActions[index];
    const swap = visibleActions[target];
    if (!current || !swap) return;
    await onUpdateAction({ actionId: current.id, patch: { order: swap.order } });
    await onUpdateAction({ actionId: swap.id, patch: { order: current.order } });
  };

  const handleDropOnRow = async (targetIdx: number) => {
    if (dragIdx === null || dragIdx === targetIdx) {
      setDragIdx(null);
      return;
    }
    const dragged = visibleActions[dragIdx];
    const target = visibleActions[targetIdx];
    setDragIdx(null);
    if (!dragged || !target) return;
    await onUpdateAction({ actionId: dragged.id, patch: { order: target.order } });
    await onUpdateAction({ actionId: target.id, patch: { order: dragged.order } });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newText.trim()) return;
    await onCreateAction({
      text: newText.trim(),
      owner: newOwner.trim() || "Founder",
      dueDate: newDue || null,
      effort: newEffort,
    });
    setNewText("");
    setNewDue("");
    setAddOpen(false);
    onToast("Custom action added to brief");
  };

  const handleCopyChecklist = async () => {
    await navigator.clipboard.writeText(actionsChecklistText(actions));
    setCopiedChecklist(true);
    onToast("Action checklist copied");
    window.setTimeout(() => setCopiedChecklist(false), 1800);
  };

  const handleExportCsv = () => {
    const csv = actionsToCsv(actions);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "monday-brief-actions.csv";
    a.click();
    URL.revokeObjectURL(url);
    onToast("Exported actions as CSV");
  };

  return (
    <motion.section
      id="actions"
      aria-labelledby="heading-actions"
      data-brief-section
      variants={readingReveal(reduced)}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
    >
      <div className="glass-strong rounded-[22px] border-[1.5px] border-indigo-300 p-5 shadow-[0_14px_38px_rgba(79,70,229,0.12)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#4F46E5]/15 pb-4">
          <div className="flex items-start gap-3">
            <span
              className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#4F46E5] text-white"
              aria-hidden="true"
            >
              <CheckSquare size={18} strokeWidth={2} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#4F46E5]">
                  Section 09 · Priority Execution
                </span>
                {isMock ? (
                  <span className="rounded-full border border-amber-400/50 bg-amber-100 px-2 py-0.5 font-mono text-[9.5px] font-semibold text-amber-900">
                    MOCK DATA
                  </span>
                ) : null}
              </div>
              <h2
                id="heading-actions"
                className="font-serif text-[23px] font-medium leading-tight tracking-[-0.015em] text-[#1F2125]"
              >
                This week: what to do
              </h2>
              <p className="mt-0.5 text-xs text-[#4B5058]">
                Finish reading and you should know what to do next.
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            <span
              aria-live="polite"
              className="tabular rounded-full border border-[#4F46E5]/25 bg-indigo-50 px-3 py-1 font-mono text-xs font-semibold text-[#4F46E5]"
            >
              <CountUp value={doneCount} /> of {actions.length} done
            </span>
            <div className="h-1.5 w-32 overflow-hidden rounded-full bg-[#4F46E5]/15">
              <div
                className="h-full origin-left rounded-full bg-[#4F46E5] transition-transform"
                style={{ transform: `scaleX(${pct})` }}
              />
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {visibleActions.length === 0 ? (
            <p className="text-sm text-[#4B5058]">
              No actions generated. This usually means there were no high-priority signals this week.
            </p>
          ) : (
            visibleActions.map((act, idx) => (
              <ActionRow
                key={act.id}
                action={act}
                index={idx}
                total={visibleActions.length}
                linkedHeadline={
                  act.linkedSignalId ? signalHeadlines[act.linkedSignalId] : null
                }
                sources={sources}
                isDraftEditable={isDraftEditable}
                isArchived={isArchived}
                onToggleDone={(item) =>
                  onUpdateAction({ actionId: item.id, patch: { done: !item.done } })
                }
                onUpdateFields={(actionId, patch) =>
                  onUpdateAction({ actionId, patch })
                }
                onMove={handleMove}
                onDragStart={setDragIdx}
                onDropOnRow={handleDropOnRow}
                onInspectSignal={onInspectSignal}
                onJumpToSource={onJumpToSource}
              />
            ))
          )}
        </div>

        <div className="no-print mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[#1F2125]/8 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            {!isArchived ? (
              <button
                type="button"
                onClick={() => setAddOpen((v) => !v)}
                className="focus-ring inline-flex items-center gap-1.5 rounded-xl border border-dashed border-[#4F46E5]/35 bg-white/75 px-3.5 py-2 text-xs font-semibold text-[#4F46E5] hover:bg-indigo-50/70"
              >
                <Plus size={14} aria-hidden="true" />
                Add custom action
              </button>
            ) : null}
            <button
              type="button"
              onClick={handleCopyChecklist}
              className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl border border-[#1F2125]/12 bg-white px-3 text-xs font-medium text-[#1F2125] hover:bg-[#F4F6FB]"
            >
              {copiedChecklist ? <Check size={12} /> : <Copy size={12} />}
              Copy checklist
            </button>
          </div>
          <button
            type="button"
            onClick={handleExportCsv}
            className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl border border-[#1F2125]/10 bg-white/80 px-3 text-xs font-medium text-[#4B5058] hover:text-[#1F2125]"
          >
            <Download size={12} />
            Export as tasks (CSV)
          </button>
        </div>

        {addOpen && !isArchived ? (
          <form onSubmit={handleCreate} className="no-print mt-3 space-y-3 rounded-2xl border border-[#4F46E5]/20 bg-white/85 p-4">
            <p className="text-xs font-semibold text-[#1F2125]">Add custom action</p>
            <input
              type="text"
              required
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              placeholder="What should happen this week?"
              className="focus-ring w-full rounded-xl border border-[#1F2125]/15 bg-white px-3 py-2 text-sm text-[#1F2125]"
            />
            <div className="grid gap-2 sm:grid-cols-3">
              <input
                type="text"
                value={newOwner}
                onChange={(e) => setNewOwner(e.target.value)}
                placeholder="Owner"
                aria-label="Owner"
                className="focus-ring rounded-xl border border-[#1F2125]/15 bg-white px-3 py-1.5 text-xs"
              />
              <input
                type="date"
                value={newDue}
                onChange={(e) => setNewDue(e.target.value)}
                aria-label="Due date"
                className="focus-ring rounded-xl border border-[#1F2125]/15 bg-white px-3 py-1.5 font-mono text-xs"
              />
              <select
                value={newEffort}
                onChange={(e) => setNewEffort(e.target.value as "low" | "medium" | "high")}
                aria-label="Effort"
                className="focus-ring rounded-xl border border-[#1F2125]/15 bg-white px-3 py-1.5 text-xs"
              >
                <option value="low">Low effort</option>
                <option value="medium">Medium effort</option>
                <option value="high">High effort</option>
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="focus-ring rounded-xl border border-[#1F2125]/15 bg-white px-3 py-1.5 text-xs font-medium text-[#4B5058]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isCreatingAction}
                className="focus-ring rounded-xl bg-[#1C1D21] px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              >
                Add action
              </button>
            </div>
          </form>
        ) : null}
      </div>
    </motion.section>
  );
}
