"use client";

import { Fragment } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  PauseCircle,
  XCircle,
} from "lucide-react";

import { GlassCard, StatusPill } from "@/components/ui-shared";
import { useMotionSafe } from "@/hooks/useMotionSafe";
import { drawPath, fadeUp } from "@/lib/motion";
import type { AutomationPipelineNode } from "@/lib/types";
import { formatTimeInZone, JOB_META } from "./jobMeta";

function statusTone(lastStatus?: string | null) {
  switch (lastStatus) {
    case "success":
      return { tone: "verified" as const, Icon: CheckCircle2, label: "Success" };
    case "failed":
      return { tone: "threat" as const, Icon: XCircle, label: "Failed" };
    case "running":
    case "queued":
      return { tone: "info" as const, Icon: Clock, label: "Running" };
    case "skipped":
      return { tone: "warning" as const, Icon: AlertTriangle, label: "Skipped" };
    case "missed":
      return { tone: "threat" as const, Icon: AlertTriangle, label: "Missed" };
    default:
      return { tone: "neutral" as const, Icon: PauseCircle, label: "Pending" };
  }
}

export function PipelineOverview({
  nodes,
  timezone,
  showLocalTime,
}: {
  nodes: AutomationPipelineNode[];
  timezone: string;
  showLocalTime: boolean;
}) {
  const { reduced, isDocumentHidden } = useMotionSafe();

  if (nodes.length === 0) return null;

  const anyRunning = nodes.some((n) => n.lastStatus === "running");

  return (
    <GlassCard className="p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-[11px] uppercase tracking-wider text-[#9AA0AA]">
          Intelligence pipeline
        </p>
        <p className="text-xs text-[#4B5058]">
          Each stage feeds the next; dependent runs skip automatically if an upstream stage fails.
        </p>
      </div>

      <div className="flex flex-col items-stretch gap-3 md:flex-row md:items-center md:justify-between">
        {nodes.map((node, idx) => {
          const meta = JOB_META[node.jobType];
          const Icon = meta.Icon;
          const badge = statusTone(node.lastStatus);
          const isRunning = node.lastStatus === "running";
          const isBlocked = Boolean(node.blockedBy);

          return (
            <Fragment key={node.jobType}>
              <motion.div
                variants={fadeUp(reduced)}
                initial="hidden"
                animate="visible"
                transition={{ delay: reduced ? 0 : idx * 0.08 }}
                className={`flex flex-1 items-center justify-between gap-3 rounded-2xl border px-3.5 py-2.5 ${
                  isBlocked
                    ? "border-[#DC2626]/45 bg-[#DC2626]/6"
                    : "border-white/85 bg-white/75"
                }`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${
                      isRunning && !reduced && !isDocumentHidden ? "animate-pulse" : ""
                    } ${meta.tintBg} ${meta.tintText}`}
                    aria-hidden="true"
                  >
                    <Icon size={15} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-[#1F2125]">
                      {node.name}
                    </p>
                    <p className="truncate font-mono text-[10.5px] text-[#4B5058]">
                      {isBlocked
                        ? `Blocked by: ${node.blockedBy}`
                        : node.nextRunAt
                          ? `Next ${formatTimeInZone(node.nextRunAt, timezone, showLocalTime)}`
                          : "Paused"}
                    </p>
                  </div>
                </div>

                <StatusPill tone={badge.tone} icon={<badge.Icon size={11} />}>
                  {badge.label}
                </StatusPill>
              </motion.div>

              {idx < nodes.length - 1 ? (
                <div
                  className="hidden shrink-0 items-center md:flex"
                  aria-hidden="true"
                >
                  <svg width="42" height="14" viewBox="0 0 42 14">
                    <motion.line
                      x1="2"
                      y1="7"
                      x2="34"
                      y2="7"
                      stroke="#4F46E5"
                      strokeOpacity="0.55"
                      strokeWidth="1.75"
                      strokeDasharray="4 4"
                      variants={drawPath(reduced)}
                      initial="hidden"
                      animate="visible"
                      className={
                        anyRunning && !reduced && !isDocumentHidden
                          ? "automation-marching-ants"
                          : ""
                      }
                    />
                    <polyline
                      points="30,3 36,7 30,11"
                      fill="none"
                      stroke="#4F46E5"
                      strokeOpacity="0.7"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              ) : null}
            </Fragment>
          );
        })}
      </div>
    </GlassCard>
  );
}
