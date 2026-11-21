"use client";

import { useState } from "react";
import { CalendarOff, Clock, PauseCircle, Plus, SkipForward, Trash2 } from "lucide-react";

import { GlassCard, StatusPill } from "@/components/ui-shared";
import type { Override, Schedule } from "@/lib/types";
import { formatDateTimeInZone } from "./jobMeta";

function overrideMeta(type: Override["type"]) {
  switch (type) {
    case "pause":
      return { label: "Pause", Icon: PauseCircle, tone: "warning" as const };
    case "skip":
      return { label: "Skip run", Icon: SkipForward, tone: "warning" as const };
    case "reschedule":
      return { label: "Reschedule", Icon: Clock, tone: "info" as const };
    case "run_once":
      return { label: "Run once", Icon: Clock, tone: "info" as const };
    default:
      return { label: "Blackout", Icon: CalendarOff, tone: "warning" as const };
  }
}

export function OverridesList({
  overrides,
  schedules,
  timezone,
  showLocalTime,
  isMock,
  onAddOverride,
  onRemoveOverride,
}: {
  overrides: Override[];
  schedules: Schedule[];
  timezone: string;
  showLocalTime: boolean;
  isMock?: boolean;
  onAddOverride: () => void;
  onRemoveOverride: (id: number) => Promise<void>;
}) {
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [removingId, setRemovingId] = useState<number | null>(null);

  const schedName = (sid?: number | null) =>
    sid ? (schedules.find((s) => s.id === sid)?.name ?? `Schedule #${sid}`) : "All jobs";

  const handleRemove = async (id: number) => {
    setRemovingId(id);
    try {
      await onRemoveOverride(id);
    } finally {
      setRemovingId(null);
      setConfirmId(null);
    }
  };

  return (
    <GlassCard className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-[#1F2125]">
            Overrides and blackout dates
          </h2>
          {isMock ? (
            <span className="rounded-full bg-[#EA580C]/10 px-2 py-0.5 font-mono text-[9.5px] font-semibold text-[#C2410C]">
              MOCK DATA
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onAddOverride}
          className="btn-motion focus-ring inline-flex h-8 items-center gap-1.5 rounded-xl border border-white/85 bg-white/80 px-3 text-xs font-medium text-[#1F2125] shadow-sm hover:bg-white"
        >
          <Plus size={13} aria-hidden="true" />
          Add override
        </button>
      </div>

      {overrides.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[#1F2125]/12 bg-white/45 px-4 py-6 text-center text-xs text-[#4B5058]">
          No overrides. Your schedules run as configured.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#1F2125]/8 font-mono text-[10.5px] uppercase text-[#9AA0AA]">
              <tr>
                <th className="py-2 pr-3">Type</th>
                <th className="px-3 py-2">Job</th>
                <th className="px-3 py-2">Date / range</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Created by</th>
                <th className="py-2 pl-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1F2125]/6">
              {overrides.map((ov) => {
                const meta = overrideMeta(ov.type);
                const Icon = meta.Icon;
                const isConfirming = confirmId === ov.id;

                return (
                  <tr key={ov.id} className="hover:bg-white/45">
                    <td className="py-2.5 pr-3">
                      <StatusPill tone={meta.tone} icon={<Icon size={11} />}>
                        {meta.label}
                      </StatusPill>
                    </td>
                    <td className="px-3 py-2.5 font-medium text-[#1F2125]">
                      {schedName(ov.scheduleId)}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-[#4B5058]">
                      {formatDateTimeInZone(ov.startsAt, timezone, showLocalTime)}
                      {ov.endsAt
                        ? ` → ${formatDateTimeInZone(ov.endsAt, timezone, showLocalTime)}`
                        : ""}
                    </td>
                    <td className="px-3 py-2.5 text-[#4B5058]">{ov.reason || "—"}</td>
                    <td className="px-3 py-2.5 text-[#4B5058]">{ov.createdBy || "Founder"}</td>
                    <td className="py-2.5 pl-3 text-right">
                      {isConfirming ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setConfirmId(null)}
                            className="focus-ring rounded px-2 py-0.5 text-[11px] text-[#4B5058] hover:bg-white"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={removingId === ov.id}
                            onClick={() => void handleRemove(ov.id)}
                            className="focus-ring rounded bg-[#DC2626] px-2 py-0.5 text-[11px] font-medium text-white"
                          >
                            {removingId === ov.id ? "Removing…" : "Confirm"}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmId(ov.id)}
                          className="focus-ring inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-[#DC2626] hover:bg-[#DC2626]/10"
                        >
                          <Trash2 size={12} /> Remove
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  );
}
