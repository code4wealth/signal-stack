"use client";

import { AlertOctagon, PauseCircle } from "lucide-react";

import type { SchedulerHealth } from "@/lib/types";

export function SchedulerStoppedBanner({ health }: { health: SchedulerHealth }) {
  const hbMs = Date.parse(health.lastHeartbeatAt);
  const isStale = !Number.isNaN(hbMs) && Date.now() - hbMs > 120_000;
  if (health.engine === "running" && !isStale) return null;

  const isDisabled = health.enabled === false || Boolean(health.reason?.includes("ENABLE_SCHEDULER=0"));

  if (isDisabled) {
    return (
      <div
        role="status"
        className="flex flex-wrap items-start gap-3 rounded-2xl border border-[#D97706]/30 bg-[#FEF3C7]/75 px-4 py-3 text-xs text-[#92400E]"
      >
        <PauseCircle size={16} className="mt-0.5 shrink-0 text-[#D97706]" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="font-semibold text-[#78350F]">
            Scheduler is off
          </p>
          <p className="text-[#92400E]/90">
            {health.reason ||
              "Background cron jobs are paused while ENABLE_SCHEDULER=0. Past days are not marked missed; use Run now or pass -EnableScheduler to start_local.ps1."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className="flex flex-wrap items-start gap-3 rounded-2xl border border-[#DC2626]/30 bg-[#DC2626]/10 px-4 py-3 text-xs text-[#991B1B]"
    >
      <AlertOctagon size={16} className="mt-0.5 shrink-0 text-[#DC2626]" aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="font-semibold text-[#7F1D1D]">
          Scheduler is not running. No scheduled jobs will execute.
        </p>
        <p className="text-[#991B1B]/90">
          {health.reason || "Heartbeat stale — check the backend APScheduler process."}
        </p>
      </div>
    </div>
  );
}
