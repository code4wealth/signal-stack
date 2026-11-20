"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { BarChart3, Download, RefreshCw } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { Signal } from "@/lib/types";
import { Badge, BusyProgress, Button, Card, Empty, ErrorNote, Loading, Stat, formatDate } from "@/components/ui";
import { ScoreChart } from "@/components/score-chart";

const FILTERS = ["all", "customers", "competitors", "market", "internal"] as const;

export default function IntelligencePage() {
  const params = useParams<{ id: string }>();
  const companyId = Number(params?.id);

  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.intelligence(companyId, filter === "all" ? undefined : filter);
      setSignals(result.items);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load intelligence.");
      setSignals([]);
    } finally {
      setLoading(false);
    }
  }, [companyId, filter]);

  useEffect(() => {
    if (Number.isFinite(companyId)) void load();
  }, [companyId, load]);

  async function crawl() {
    setBusy("crawl");
    setError(null);
    setNotice(null);
    try {
      const result = await api.crawl(companyId);
      setNotice(
        `Crawl finished: ${result.sources_checked} source(s) checked, ${result.new_records} new, ${result.updated_records} updated, ${result.duplicates} duplicate(s), ${result.errors} error(s).`,
      );
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Crawl failed.");
    } finally {
      setBusy(null);
    }
  }

  async function analyse() {
    setBusy("analyse");
    setError(null);
    setNotice(null);
    try {
      const result = await api.analyse(companyId);
      setNotice(
        `Analysis finished: ${result.analysed} analysed (cap ${result.cap_per_run}/run), ${result.failed} failed, ${result.evidence_flagged} flagged for unverified evidence.`,
      );
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Analysis failed.");
    } finally {
      setBusy(null);
    }
  }

  const stats = useMemo(() => {
    if (!signals || signals.length === 0) return { count: 0, flagged: 0, average: 0, updates: 0 };
    const flagged = signals.filter((signal) => signal.evidence_verbatim === false).length;
    const updates = signals.filter((signal) => signal.is_update).length;
    const average = signals.reduce((sum, signal) => sum + signal.total, 0) / signals.length;
    return { count: signals.length, flagged, average, updates };
  }, [signals]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Ranked intelligence</h2>
          <p className="text-xs text-slate-500">
            Score = 100 × Σ(weight × component). Crawling and ranking never call the LLM; only scoring inputs do.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={crawl} disabled={busy !== null}>
            <RefreshCw size={16} /> {busy === "crawl" ? "Crawling…" : "Crawl approved sources"}
          </Button>
          <Button variant="ghost" onClick={analyse} disabled={busy !== null}>
            <BarChart3 size={16} /> {busy === "analyse" ? "Analysing…" : "Analyse new records"}
          </Button>
        </div>
      </div>

      {busy === "crawl" ? (
        <BusyProgress label="Crawling approved sources (respecting 1 req/s host rate limit, robots.txt, and conditional GET)…" />
      ) : null}
      {busy === "analyse" ? (
        <BusyProgress label="Analysing unanalysed records with Groq (1s pacing per record — up to 40 records per run)…" />
      ) : null}
      {error ? <ErrorNote message={error} onRetry={load} /> : null}
      {notice ? (
        <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">{notice}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Signals shown" value={stats.count} />
        <Stat label="Average score" value={stats.average.toFixed(1)} />
        <Stat label="Evidence flagged" value={stats.flagged} hint="Snippet not found verbatim (capped at 0.2)" />
        <Stat label="Updates" value={stats.updates} hint="Same URL, changed content" />
      </div>

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((option) => (
          <button
            key={option}
            onClick={() => setFilter(option)}
            className={`rounded-lg px-3 py-1.5 text-xs ${
              filter === option ? "bg-primary text-white" : "border border-white/10 text-slate-300 hover:text-accent"
            }`}
          >
            {option}
          </button>
        ))}
      </div>

      {loading ? <Loading label="Loading signals…" /> : null}

      {!loading && signals && signals.length === 0 ? (
        <Empty
          title="No analysed records yet"
          hint="Approve sources, crawl them, then run analysis. Nothing here is invented — records come from real fetches."
        />
      ) : null}

      {signals && signals.length > 0 ? (
        <div className="space-y-3">
          {signals.map((signal) => {
            const isOpen = expanded === signal.id;
            return (
              <Card key={signal.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base font-semibold text-slate-100">{signal.title}</span>
                      {signal.is_update ? <Badge tone="info">[UPDATED]</Badge> : null}
                      {signal.source ? <Badge>{signal.source.category}</Badge> : null}
                      {signal.evidence_verbatim === false ? <Badge tone="bad">evidence unverified</Badge> : null}
                    </div>
                    <p className="mt-1 text-sm text-slate-300">{signal.summary}</p>
                    <a href={signal.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-accent">
                      {signal.url}
                    </a>
                    <p className="mt-1 text-xs text-slate-500">
                      discovered {formatDate(signal.discovered)} · published {formatDate(signal.published)} · hash{" "}
                      {signal.content_hash.slice(0, 12)}…
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-semibold text-accent">{signal.total.toFixed(1)}</p>
                    <p className="text-xs text-slate-500">score /100</p>
                    <Button variant="ghost" onClick={() => setExpanded(isOpen ? null : signal.id)}>
                      {isOpen ? "Hide" : "Why this score"}
                    </Button>
                  </div>
                </div>

                {isOpen ? (
                  <div className="mt-4 space-y-3 border-t border-white/5 pt-4">
                    <div className="grid gap-2 text-xs sm:grid-cols-3 lg:grid-cols-6">
                      {Object.entries(signal.scores ?? {})
                        .filter(([key]) => ["relevance", "impact", "urgency", "credibility", "recency", "novelty"].includes(key))
                        .map(([key, value]) => (
                          <div key={key} className="rounded-lg bg-secondary/60 px-3 py-2">
                            <p className="text-slate-500">{key}</p>
                            <p className="text-sm text-slate-200">{typeof value === "number" ? value.toFixed(2) : "—"}</p>
                          </div>
                        ))}
                    </div>
                    <ScoreChart components={(signal.scores ?? {}) as Record<string, number | undefined>} />
                    <p className="text-xs text-slate-400">{signal.explanation}</p>
                    <div className="rounded-lg border border-white/5 bg-secondary/40 p-3">
                      <p className="text-xs uppercase tracking-wide text-slate-500">Evidence snippet</p>
                      <p className="mt-1 text-sm italic text-slate-300">
                        {signal.evidence_snippet ? `“${signal.evidence_snippet}”` : "no snippet stored"}
                      </p>
                      <p className="mt-2 text-xs text-slate-500">
                        verbatim: {signal.evidence_verbatim ? "yes" : "no"} · evidence strength{" "}
                        {signal.evidence_strength?.toFixed(2) ?? "—"} · source reliability{" "}
                        {signal.source_reliability?.toFixed(2) ?? "—"} · strategic relevance{" "}
                        {signal.strategic_relevance?.toFixed(2) ?? "—"}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a href={`/api/signals/${signal.id}`} target="_blank" rel="noreferrer" className="text-xs text-accent">
                        <Download size={12} className="mr-1 inline" /> raw signal JSON
                      </a>
                      <span className="text-xs text-slate-600">source: {signal.source?.name ?? "unknown"}</span>
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
