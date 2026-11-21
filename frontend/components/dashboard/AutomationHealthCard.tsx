"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, CalendarClock } from "lucide-react";

import { EmptyState, GlassCard, StatusPill } from "@/components/ui-shared";
import { useCountdown } from "@/hooks/useCountdown";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import { MOTION_EASE } from "@/lib/motion";
import type { DashboardJob } from "@/lib/types";

function JobRow({ job }: { job: DashboardJob }) {
  const countdown = useCountdown(job.enabled ? job.nextRunAt : null);

  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-white/85 bg-white/75 px-3 py-2 text-xs">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate font-medium text-[#1F2125]">{job.name}</p>
          <StatusPill tone={job.enabled ? "verified" : "neutral"}>
            {job.enabled ? "On" : "Paused"}
          </StatusPill>
        </div>
        <p className="mt-0.5 font-mono text-[10.5px] text-[#4B5058]">
          {job.enabled ? `Next run ${countdown}` : "Scheduler off"}
        </p>
      </div>

      {job.lastRun ? (
        <StatusPill
          tone={
            job.lastRun.status === "ok" || job.lastRun.status === "completed"
              ? "verified"
              : job.lastRun.status === "partial"
                ? "warning"
                : "threat"
          }
        >
          {job.lastRun.status}
        </StatusPill>
      ) : (
        <span className="font-mono text-[10.5px] text-[#9AA0AA]">No runs</span>
      )}
    </div>
  );
}

export function AutomationHealthCard({
  companyId,
  jobs,
  health,
}: {
  companyId: number;
  jobs: DashboardJob[];
  health: {
    healthyPct: number;
    failing: number;
    stale: number;
  };
}) {
  const { reduced } = useMotionSafe();
  const target = Math.max(0, Math.min(100, Math.round(health.healthyPct)));
  const radius = 44;
  const halfCirc = Math.PI * radius;
  const dashOffset = halfCirc - (target / 100) * halfCirc;

  return (
    <GlassCard spotlight className="flex h-full flex-col justify-between gap-4 p-5">
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <CalendarClock size={14} className="text-[#4F46E5]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-[#1F2125]">Automation &amp; health</h2>
          </div>
          <Link
            href={`/company/${companyId}/automation`}
            className="focus-ring font-mono text-[11px] font-medium text-[#4F46E5] no-underline hover:underline"
          >
            Automation →
          </Link>
        </div>

        {jobs.length === 0 ? (
          <EmptyState
            title="No scheduled jobs"
            description="Configure weekly brief and monthly source audit schedules in Automation."
          />
        ) : (
          <div className="space-y-2">
            {jobs.slice(0, 2).map((job) => (
              <JobRow key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>

      {/* Mini Health Gauge reusing Crawler HealthGauge styling */}
      <div className="flex items-center justify-between gap-3 border-t border-[#1F2125]/8 pt-3">
        <div className="flex items-center gap-3">
          <svg
            width="108"
            height="62"
            viewBox="0 0 108 62"
            aria-label={`${target}% of approved sources healthy`}
          >
            <defs>
              <linearGradient id="dash-health-grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#A5B4FC" />
                <stop offset="100%" stopColor="#4F46E5" />
              </linearGradient>
            </defs>
            <path
              d="M 10 54 A 44 44 0 0 1 98 54"
              fill="none"
              stroke="rgba(31, 33, 37, 0.08)"
              strokeWidth="9"
              strokeLinecap="round"
            />
            <motion.path
              d="M 10 54 A 44 44 0 0 1 98 54"
              fill="none"
              stroke="url(#dash-health-grad)"
              strokeWidth="9"
              strokeLinecap="round"
              strokeDasharray={halfCirc}
              initial={reduced ? { strokeDashoffset: dashOffset } : { strokeDashoffset: halfCirc }}
              animate={{ strokeDashoffset: dashOffset }}
              transition={{ duration: reduced ? 0.15 : 0.45, ease: MOTION_EASE }}
            />
          </svg>
          <div>
            <p className="tabular text-lg font-semibold leading-none text-[#1F2125]">{target}%</p>
            <p className="mt-1 font-mono text-[10.5px] text-[#4B5058]">
              <span className={health.failing > 0 ? "text-[#DC2626]" : ""}>
                {health.failing} failing
              </span>{" "}
              ·{" "}
              <span className={health.stale > 0 ? "text-[#EA580C]" : ""}>
                {health.stale} stale
              </span>
            </p>
          </div>
        </div>

        <Link
          href={`/company/${companyId}/crawler`}
          className="focus-ring inline-flex items-center gap-1 font-mono text-[11px] font-medium text-[#4F46E5] no-underline hover:underline"
        >
          <span>Crawler</span>
          <ArrowRight size={12} aria-hidden="true" />
        </Link>
      </div>
    </GlassCard>
  );
}
