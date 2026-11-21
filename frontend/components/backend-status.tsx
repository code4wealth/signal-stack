"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";

type State =
  | { status: "checking" }
  | { status: "online"; model: string; keyConfigured: boolean }
  | { status: "offline"; reason: string };

const HEALTH_CACHE_TTL_MS = 25_000;
let cachedState: State | null = null;
let cachedAt = 0;
let inflight: Promise<State> | null = null;

async function fetchSharedHealth(force = false): Promise<State> {
  const now = Date.now();
  if (!force && cachedState && cachedState.status !== "checking" && now - cachedAt < HEALTH_CACHE_TTL_MS) {
    return cachedState;
  }
  if (inflight) return inflight;
  inflight = api
    .health()
    .then((health): State => {
      if (health.status === "ok") {
        return {
          status: "online",
          model: health.llm.model,
          keyConfigured: health.llm.api_key_configured,
        };
      }
      return { status: "offline", reason: `API ${health.status}` };
    })
    .catch((caught): State => {
      const message = caught instanceof Error ? caught.message : "Backend unreachable";
      return { status: "offline", reason: message };
    })
    .then((next) => {
      cachedState = next;
      cachedAt = Date.now();
      inflight = null;
      return next;
    });
  return inflight;
}

export function BackendStatus() {
  const [state, setState] = useState<State>(() => cachedState ?? { status: "checking" });

  useEffect(() => {
    let active = true;
    const poll = async (force = false) => {
      if (typeof document !== "undefined" && document.hidden) return;
      const next = await fetchSharedHealth(force);
      if (active) setState(next);
    };

    void poll(false);
    const timer = setInterval(() => void poll(true), 30_000);
    const onVisibility = () => {
      if (!document.hidden) void poll(false);
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  if (state.status === "checking") {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-full border border-[#1F2125]/10 bg-white/75 px-3 py-1 text-xs font-medium text-muted"
        title="Checking /api/health"
      >
        <span className="h-2 w-2 rounded-full bg-subtle" aria-hidden />
        Checking API…
      </span>
    );
  }

  if (state.status === "online") {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-medium text-[#0F766E]"
        title={`Backend online · model ${state.model} · ${state.keyConfigured ? "GROQ_API_KEY configured" : "GROQ_API_KEY missing"}`}
      >
        <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
        Backend online{state.keyConfigured ? "" : " (no key)"}
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border border-danger/30 bg-danger/10 px-3 py-1 text-xs font-medium text-[#B91C1C]"
      title={state.reason}
    >
      <span className="h-2 w-2 rounded-full bg-danger" aria-hidden />
      Backend offline
    </span>
  );
}
