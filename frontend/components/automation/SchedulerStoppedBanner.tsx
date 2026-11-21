"use client";

import { AlertOctagon } from "lucide-react";

import type { SchedulerHealth } from "@/lib/types";

export function SchedulerStoppedBanner({ health }: { health: SchedulerHealth }) {
  const hbMs = Date.parse(health.lastHeartbeatAt);
  const isStale = !Number.isNaN(hbMs) && Date.now() - hbMs > 120_000;
  if (health.engine === "running" && !isStale) return null;

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
