"use client";

import { Activity, CheckCircle2, XCircle } from "lucide-react";

import { MiniBarSparkline } from "@/components/dashboard/MiniBarSparkline";
import { GlassCard, StatusPill } from "@/components/ui-shared";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import type { SchedulerHealth } from "@/lib/types";
import { formatRelativeAge } from "./jobMeta";

export function SchedulerHealthCard({
  health,
  isMock,
}: {
  health: SchedulerHealth;
  isMock?: boolean;
}) {
  const { reduced, isDocumentHidden } = useMotionSafe();
  const isRunning = health.engine === "running";

  const sparkValues = health.successByDay.slice(-7).map((d) => d.success + d.failed);
  const hasFailures = health.successByDay.some((d) => d.failed > 0);

  return (
    <GlassCard spotlight className="space-y-4 p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Activity size={15} className="text-[#4F46E5]" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-[#1F2125]">Scheduler health</h2>
        </div>
        {isMock ? (
          <span className="rounded-full bg-[#EA580C]/10 px-2 py-0.5 font-mono text-[9.5px] font-semibold text-[#C2410C]">
            MOCK DATA
          </span>
        ) : null}
      </div>

      {/* Engine status + heartbeat */}
      <div className="flex items-center justify-between gap-2 rounded-xl border border-white/85 bg-white/75 px-3 py-2.5">
        <div className="space-y-0.5">
          <p className="text-xs font-medium text-[#1F2125]">Engine</p>
          <p className="font-mono text-[10.5px] text-[#4B5058]">
            last tick {formatRelativeAge(health.lastHeartbeatAt)}
          </p>
        </div>
        <StatusPill
          tone={isRunning ? "verified" : "threat"}
          icon={
            isRunning ? (
              <span
                className={`h-2 w-2 rounded-full bg-[#059669] ${
                  reduced || isDocumentHidden ? "" : "animate-pulse"
                }`}
              />
            ) : (
              <XCircle size={12} />
            )
          }
        >
          {isRunning ? "Running" : "Stopped"}
        </StatusPill>
      </div>

      {/* Metadata metrics */}
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl border border-white/80 bg-white/60 px-3 py-2">
          <dt className="font-mono text-[10px] uppercase text-[#9AA0AA]">Job store</dt>
          <dd className="mt-0.5 truncate font-medium text-[#1F2125]">{health.jobStore}</dd>
        </div>
        <div className="rounded-xl border border-white/80 bg-white/60 px-3 py-2">
          <dt className="font-mono text-[10px] uppercase text-[#9AA0AA]">Jobs registered</dt>
          <dd className="tabular mt-0.5 font-mono font-semibold text-[#1F2125]">
            {health.jobsRegistered}
          </dd>
        </div>
        <div className="rounded-xl border border-white/80 bg-white/60 px-3 py-2">
          <dt className="font-mono text-[10px] uppercase text-[#9AA0AA]">Timezone</dt>
          <dd className="mt-0.5 truncate font-mono text-[11px] text-[#1F2125]">
            {health.timezone}
          </dd>
        </div>
        <div className="rounded-xl border border-white/80 bg-white/60 px-3 py-2">
          <dt className="font-mono text-[10px] uppercase text-[#9AA0AA]">Missed (30d)</dt>
          <dd
            className={`tabular mt-0.5 font-mono font-semibold ${
              health.missedRuns30d > 0 ? "text-[#DC2626]" : "text-[#1F2125]"
            }`}
          >
            {health.missedRuns30d}
          </dd>
        </div>
      </dl>

      <div className="space-y-1 rounded-xl border border-white/80 bg-white/60 px-3 py-2.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-[#4B5058]">Avg start delay</span>
          <span className="tabular font-mono font-medium text-[#1F2125]">
            {health.avgStartDelayMs}ms
          </span>
        </div>
        <p className="text-[11px] text-[#4B5058]">{health.misfireSummary}</p>
      </div>

      {/* 14-day success-rate bar sparkline */}
      <div className="space-y-2 border-t border-[#1F2125]/8 pt-3">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-medium text-[#1F2125]">14-day execution health</span>
          <span className="inline-flex items-center gap-1 font-mono text-[10.5px] text-[#4B5058]">
            {hasFailures ? (
              <span className="text-[#DC2626]">Failures hatched</span>
            ) : (
              <>
                <CheckCircle2 size={11} className="text-[#059669]" /> Healthy
              </>
            )}
          </span>
        </div>

        <div className="flex items-end justify-between gap-2">
          <MiniBarSparkline values={sparkValues} color="#4F46E5" />
          <div className="flex h-10 flex-1 items-end gap-1" aria-hidden="true">
            {health.successByDay.map((d) => {
              const total = d.success + d.failed;
              const hPct = total === 0 ? 12 : Math.min(100, Math.max(24, total * 24));
              return (
                <div
                  key={d.date}
                  title={`${d.date}: ${d.success} ok, ${d.failed} failed`}
                  style={{ height: `${hPct}%` }}
                  className="relative flex-1 overflow-hidden rounded-t bg-[#4F46E5]/30"
                >
                  {d.failed > 0 ? (
                    <span className="pattern-hatch absolute inset-x-0 top-0 h-2 bg-[#DC2626]/65" />
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
