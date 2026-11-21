"use client";

import { useEffect, useRef, useState } from "react";

function formatCountdown(targetIso: string | null | undefined, nowMs: number): string {
  if (!targetIso) return "Not scheduled";
  const targetMs = Date.parse(targetIso);
  if (Number.isNaN(targetMs)) return "Not scheduled";
  const diffSec = Math.floor((targetMs - nowMs) / 1000);
  if (diffSec <= 0) return "Starting...";

  const days = Math.floor(diffSec / 86_400);
  const hours = Math.floor((diffSec % 86_400) / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);
  const secs = diffSec % 60;

  if (days > 0) return `in ${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `in ${hours}h ${mins}m`;
  if (mins > 0) return `in ${mins}m ${secs}s`;
  return `in ${secs}s`;
}

export function useLiveCountdown(
  targetIso?: string | null,
  options?: { tickMs?: number; onExpire?: () => void },
) {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const firedForRef = useRef<string | null>(null);
  const onExpireRef = useRef(options?.onExpire);
  onExpireRef.current = options?.onExpire;
  const tickMs = options?.tickMs ?? 1000;

  useEffect(() => {
    if (!targetIso) return;
    const tick = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      const now = Date.now();
      setNowMs(now);
      const targetMs = Date.parse(targetIso);
      if (
        !Number.isNaN(targetMs) &&
        targetMs <= now &&
        firedForRef.current !== targetIso
      ) {
        firedForRef.current = targetIso;
        onExpireRef.current?.();
      }
    };
    tick();
    const timer = window.setInterval(tick, tickMs);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [targetIso, tickMs]);

  const targetMs = targetIso ? Date.parse(targetIso) : Number.NaN;
  const diffSec = Number.isNaN(targetMs) ? null : Math.floor((targetMs - nowMs) / 1000);
  const minuteBucket = diffSec === null ? null : Math.floor(Math.max(0, diffSec) / 60);

  return {
    label: formatCountdown(targetIso, nowMs),
    isDue: diffSec !== null && diffSec <= 0,
    minuteBucket,
  };
}

export function useCountdown(targetIso?: string | null): string {
  return useLiveCountdown(targetIso, { tickMs: 30_000 }).label;
}
