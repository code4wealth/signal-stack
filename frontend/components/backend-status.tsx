"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";

type State =
  | { status: "checking" }
  | { status: "online"; model: string; keyConfigured: boolean }
  | { status: "offline"; reason: string };

export function BackendStatus() {
  const [state, setState] = useState<State>({ status: "checking" });

  useEffect(() => {
    let active = true;
    const poll = async () => {
      try {
        const health = await api.health();
        if (!active) return;
        if (health.status === "ok") {
          setState({
            status: "online",
            model: health.llm.model,
            keyConfigured: health.llm.api_key_configured,
          });
        } else {
          setState({ status: "offline", reason: `API ${health.status}` });
        }
      } catch (caught) {
        if (!active) return;
        const message = caught instanceof Error ? caught.message : "Backend unreachable";
        setState({ status: "offline", reason: message });
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), 10_000);
    return () => {
      active = false;
      clearInterval(timer);
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
