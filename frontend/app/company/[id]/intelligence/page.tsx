"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { BarChart3, Download, RefreshCw } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { Signal, Source } from "@/lib/types";
import { Badge, BusyProgress, Button, Card, Empty, ErrorNote, Loading, Stat, formatDate, inputClass } from "@/components/ui";
import { ScoreChart } from "@/components/score-chart";

const FILTERS = ["all", "customers", "competitors", "market", "internal"] as const;

export default function IntelligencePage() {
  const params = useParams<{ id: string }>();
  const companyId = Number(params?.id);

  const [signals, setSignals] = useState<Signal[] | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [sourceId, setSourceId] = useState("");
  const [classification, setClassification] = useState("");
  const [priorityBand, setPriorityBand] = useState("");
  const [verifiedFilter, setVerifiedFilter] = useState("");
  const [minRelevance, setMinRelevance] = useState("");
  const [minImpact, setMinImpact] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [result, srcResult] = await Promise.all([
        api.intelligence(companyId, {
          category: filter === "all" ? undefined : filter,
          source_id: sourceId ? Number(sourceId) : undefined,
          classification: classification || undefined,
          priority_band: priorityBand || undefined,
          verified_only: verifiedFilter === "verified" ? true : verifiedFilter === "unverified" ? false : undefined,
          min_relevance: minRelevance ? Number(minRelevance) : undefined,
          min_impact: minImpact ? Number(minImpact) : undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          q: searchText.trim() || undefined,
        }),
        api.listSources(companyId),
      ]);
      setSignals(result.items);
      setSources(srcResult.items);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load intelligence.");
      setSignals([]);
    } finally {
      setLoading(false);
    }
  }, [
    companyId,
    filter,
    sourceId,
    classification,
    priorityBand,
    verifiedFilter,
    minRelevance,
    minImpact,
    dateFrom,
    dateTo,
    searchText,
  ]);

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

      <div className="space-y-3 rounded-xl border border-white/5 bg-secondary/40 p-3">
        <div className="flex flex-wrap items-center gap-1">
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
        <div className="grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
          <input
            type="search"
            aria-label="Search signals"
            placeholder="Search title or summary…"
            className={inputClass}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <select aria-label="Filter by source" className={inputClass} value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
            <option value="">All sources</option>
            {sources.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.name} ({s.category})
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by classification"
            className={inputClass}
            value={classification}
            onChange={(e) => setClassification(e.target.value)}
          >
            <option value="">All classifications</option>
            <option value="opportunity">Opportunity</option>
            <option value="threat">Threat</option>
            <option value="neutral">Neutral</option>
            <option value="uncertain">Uncertain</option>
          </select>
          <select
            aria-label="Filter by priority band"
            className={inputClass}
            value={priorityBand}
            onChange={(e) => setPriorityBand(e.target.value)}
          >
            <option value="">All priority bands</option>
            <option value="high">High (70–100)</option>
            <option value="medium">Medium (40–69)</option>
            <option value="low">Low (&lt;40)</option>
          </select>
          <select
            aria-label="Filter by verification"
            className={inputClass}
            value={verifiedFilter}
            onChange={(e) => setVerifiedFilter(e.target.value)}
          >
            <option value="">All verification states</option>
            <option value="verified">Verbatim verified only</option>
            <option value="unverified">Unverified quote only</option>
          </select>
          <select
            aria-label="Filter by minimum relevance"
            className={inputClass}
            value={minRelevance}
            onChange={(e) => setMinRelevance(e.target.value)}
          >
            <option value="">Any relevance</option>
            <option value="0.5">Relevance &gt;= 0.5</option>
            <option value="0.7">Relevance &gt;= 0.7</option>
            <option value="0.85">Relevance &gt;= 0.85</option>
          </select>
          <select
            aria-label="Filter by minimum impact"
            className={inputClass}
            value={minImpact}
            onChange={(e) => setMinImpact(e.target.value)}
          >
            <option value="">Any impact</option>
            <option value="0.5">Impact &gt;= 0.5</option>
            <option value="0.7">Impact &gt;= 0.7</option>
            <option value="0.85">Impact &gt;= 0.85</option>
          </select>
          <div className="flex items-center gap-1">
            <input
              type="date"
              aria-label="Date from"
              className={inputClass}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
            <input
              type="date"
              aria-label="Date to"
              className={inputClass}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
        </div>
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
                      {signal.classification ? (
                        <Badge
                          tone={
                            signal.classification === "opportunity"
                              ? "ok"
                              : signal.classification === "threat"
                                ? "bad"
                                : signal.classification === "uncertain"
                                  ? "warn"
                                  : "neutral"
                          }
                        >
                          {signal.classification}
                        </Badge>
                      ) : null}
                      {signal.corroborated ? (
                        <Badge tone="ok">corroborated ({signal.related_records?.length ?? 1})</Badge>
                      ) : null}
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
                    {signal.related_records && signal.related_records.length > 0 ? (
                      <div className="rounded-lg border border-success/20 bg-success/5 p-3 text-xs">
                        <p className="font-semibold text-success">Cross-source corroboration</p>
                        <ul className="mt-1 space-y-1 text-slate-300">
                          {signal.related_records.map((rel) => (
                            <li key={rel.id}>
                              Record #{rel.id} ({rel.source_name}) — {rel.title} · score {rel.total.toFixed(1)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
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
