import {
  Bot,
  FileText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import type { JobType } from "@/lib/types";

export const JOB_META: Record<
  JobType,
  {
    label: string;
    shortLabel: string;
    description: string;
    Icon: typeof Bot;
    patternClass: string;
    patternLabel: string;
    tintBg: string;
    tintText: string;
    borderTopClass: string;
  }
> = {
  crawl: {
    label: "Source crawl",
    shortLabel: "Crawl",
    description: "Collects evidence from approved sources",
    Icon: Bot,
    patternClass: "pattern-hatch",
    patternLabel: "Diagonal hatch",
    tintBg: "bg-[#4F46E5]/10",
    tintText: "text-[#4F46E5]",
    borderTopClass: "border-t-[3px] border-t-[#4F46E5]/65",
  },
  analysis: {
    label: "Signal analysis",
    shortLabel: "Analysis",
    description: "Turns new evidence into scored signals",
    Icon: Sparkles,
    patternClass: "pattern-dots",
    patternLabel: "Dotted band",
    tintBg: "bg-[#4F46E5]/15",
    tintText: "text-[#4338CA]",
    borderTopClass: "border-t-[3px] border-t-[#4F46E5]/85",
  },
  weekly_brief: {
    label: "Weekly Monday Brief",
    shortLabel: "Brief",
    description: "Generates the 11-section executive brief",
    Icon: FileText,
    patternClass: "bg-[#4F46E5]",
    patternLabel: "Solid fill",
    tintBg: "bg-[#1C1D21]",
    tintText: "text-white",
    borderTopClass: "border-t-[3px] border-t-[#4F46E5]",
  },
  source_audit: {
    label: "Monthly source audit",
    shortLabel: "Audit",
    description: "Re-assesses sources and proposes Keep / Add / Remove",
    Icon: ShieldCheck,
    patternClass: "pattern-grid",
    patternLabel: "Grid fill",
    tintBg: "bg-slate-600/12",
    tintText: "text-slate-700",
    borderTopClass: "border-t-[3px] border-t-slate-500/75",
  },
};

export function getDisplayTimezone(scheduleTz: string, showLocal: boolean): string {
  if (!showLocal) return scheduleTz || "UTC";
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || scheduleTz || "UTC";
  } catch {
    return scheduleTz || "UTC";
  }
}

export function formatTimeInZone(
  iso: string | null | undefined,
  scheduleTz: string,
  showLocal: boolean,
): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "—";
  const tz = getDisplayTimezone(scheduleTz, showLocal);
  try {
    return new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz,
    }).format(dt);
  } catch {
    return dt.toISOString().slice(11, 16);
  }
}

export function formatDateTimeInZone(
  iso: string | null | undefined,
  scheduleTz: string,
  showLocal: boolean,
): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "—";
  const tz = getDisplayTimezone(scheduleTz, showLocal);
  try {
    const formatted = new Intl.DateTimeFormat("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz,
    }).format(dt);
    return `${formatted} ${tz}`;
  } catch {
    return `${dt.toUTCString()} ${tz}`;
  }
}

export function formatFullDateInZone(
  iso: string | null | undefined,
  scheduleTz: string,
  showLocal: boolean,
): string {
  if (!iso) return "Not scheduled";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "Not scheduled";
  const tz = getDisplayTimezone(scheduleTz, showLocal);
  try {
    return new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      day: "numeric",
      month: "long",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz,
    }).format(dt);
  } catch {
    return dt.toUTCString();
  }
}

export function formatRelativeAge(iso: string | null | undefined): string {
  if (!iso) return "never";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "never";
  const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}
