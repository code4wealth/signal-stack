"use client";

import { useEffect, useState } from "react";

function formatCountdown(targetIso: string | null | undefined, nowMs: number): string {
  if (!targetIso) return "Not scheduled";
  const targetMs = Date.parse(targetIso);
  if (Number.isNaN(targetMs)) return "Not scheduled";
  const diffSec = Math.floor((targetMs - nowMs) / 1000);
  if (diffSec <= 0) return "Due now";

  const days = Math.floor(diffSec / 86_400);
  const hours = Math.floor((diffSec % 86_400) / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);

  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${mins}m`;
  return `in ${Math.max(1, mins)}m`;
}

export function useCountdown(targetIso?: string | null): string {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (!targetIso) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      setNowMs(Date.now());
    };
    tick();
    const timer = window.setInterval(tick, 30_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [targetIso]);

  return formatCountdown(targetIso, nowMs);
}
