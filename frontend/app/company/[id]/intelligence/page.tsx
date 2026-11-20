"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { BarChart3, ChevronDown, ChevronUp, Download, ExternalLink, RefreshCw, RotateCcw } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { Signal, Source } from "@/lib/types";
import {
  Badge,
  BusyProgress,
  Button,
  Card,
  Empty,
  ErrorNote,
  Loading,
  Notice,
  Stat,
  formatDate,
  inputClass,
} from "@/components/ui";
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

  function resetFilters() {
    setFilter("all");
    setSourceId("");
    setClassification("");
    setPriorityBand("");
    setVerifiedFilter("");
    setMinRelevance("");
    setMinImpact("");
    setDateFrom("");
    setDateTo("");
    setSearchText("");
  }

  const hasActiveFilter =
    filter !== "all" ||
    Boolean(sourceId || classification || priorityBand || verifiedFilter || minRelevance || minImpact || dateFrom || dateTo || searchText);

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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">Ranked intelligence feed</h2>
          <p className="mt-0.5 text-sm text-muted">
            Score = 100 × Σ(weight × component). Crawling and ranking are deterministic code; only scoring inputs call the LLM.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={crawl} disabled={busy !== null}>
            <RefreshCw size={15} /> {busy === "crawl" ? "Crawling…" : "Crawl approved sources"}
          </Button>
          <Button variant="ghost" onClick={analyse} disabled={busy !== null}>
            <BarChart3 size={15} /> {busy === "analyse" ? "Analysing…" : "Analyse new records"}
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
      {notice ? <Notice>{notice}</Notice> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Signals shown" value={stats.count} />
        <Stat label="Average score" value={stats.average.toFixed(1)} />
        <Stat label="Evidence flagged" value={stats.flagged} hint="Snippet not verbatim (capped at 0.2)" />
        <Stat label="Updated URLs" value={stats.updates} hint="Same URL with changed content" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((option) => (
              <button
                key={option}
                onClick={() => setFilter(option)}
                className={`rounded-[8px] px-3 py-1.5 text-xs font-medium capitalize transition-colors ${
                  filter === option
                    ? "bg-[#1C1D21] text-white"
                    : "border border-[rgba(31,33,37,0.10)] bg-secondary text-muted hover:text-ink"
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          {hasActiveFilter ? (
            <button
              onClick={resetFilters}
              className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
            >
              <RotateCcw size={12} /> Reset filters
            </button>
          ) : null}
        </div>

        <div className="mt-4 grid gap-2.5 text-xs sm:grid-cols-2 lg:grid-cols-4">
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
          <div className="grid grid-cols-2 gap-2">
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
      </Card>

      {loading ? <Loading label="Loading signals…" /> : null}

      {!loading && signals && signals.length === 0 ? (
        <Empty
          title="No analysed records match"
          hint="Approve sources, crawl them, then run analysis — or clear your filters above."
        />
      ) : null}

      {signals && signals.length > 0 ? (
        <div className="space-y-4">
          {signals.map((signal) => {
            const isOpen = expanded === signal.id;
            return (
              <Card key={signal.id}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[17px] font-semibold tracking-[-0.015em] text-ink">{signal.title}</h3>
                      {signal.is_update ? <Badge tone="info">Updated</Badge> : null}
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
                        <Badge tone="ok">Corroborated ({signal.related_records?.length ?? 1})</Badge>
                      ) : null}
                      {signal.evidence_verbatim === false ? <Badge tone="bad">Evidence unverified</Badge> : null}
                    </div>
                    <p className="max-w-[68ch] text-[15px] leading-relaxed text-ink/90">{signal.summary}</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      <a
                        href={signal.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex max-w-md items-center gap-1 truncate text-accent no-underline hover:underline"
                      >
                        <span className="truncate">{signal.url}</span> <ExternalLink size={11} className="shrink-0" />
                      </a>
                      <span className="tabular">Discovered {formatDate(signal.discovered)}</span>
                      <span className="tabular">Published {formatDate(signal.published)}</span>
                      <span className="font-mono text-[11px] text-muted/75">sha256:{signal.content_hash.slice(0, 10)}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center justify-between gap-4 border-t border-[rgba(31,33,37,0.08)] pt-3 sm:flex-col sm:items-end sm:border-t-0 sm:pt-0">
                    <div className="sm:text-right">
                      <p className="tabular text-3xl font-semibold tracking-[-0.03em] text-accent">
                        {signal.total.toFixed(1)}
                      </p>
                      <p className="text-xs text-muted">score / 100</p>
                    </div>
                    <Button variant="ghost" onClick={() => setExpanded(isOpen ? null : signal.id)}>
                      {isOpen ? (
                        <>
                          Hide breakdown <ChevronUp size={14} />
                        </>
                      ) : (
                        <>
                          Why this score <ChevronDown size={14} />
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {isOpen ? (
                  <div className="mt-5 space-y-4 border-t border-[rgba(31,33,37,0.08)] pt-5">
                    <div className="grid gap-2.5 text-xs sm:grid-cols-3 lg:grid-cols-6">
                      {Object.entries(signal.scores ?? {})
                        .filter(([key]) => ["relevance", "impact", "urgency", "credibility", "recency", "novelty"].includes(key))
                        .map(([key, value]) => (
                          <div
                            key={key}
                            className="rounded-[8px] border border-[rgba(31,33,37,0.08)] bg-secondary/70 px-3 py-2.5"
                          >
                            <p className="capitalize text-muted">{key}</p>
                            <p className="tabular mt-0.5 text-base font-semibold text-ink">
                              {typeof value === "number" ? value.toFixed(2) : "—"}
                            </p>
                          </div>
                        ))}
                    </div>

                    <ScoreChart components={(signal.scores ?? {}) as Record<string, number | undefined>} />

                    {signal.explanation ? <p className="text-sm text-muted">{signal.explanation}</p> : null}

                    <div className="rounded-[10px] border border-[rgba(31,33,37,0.08)] bg-secondary/70 p-4">
                      <p className="text-xs font-semibold text-muted">Verbatim evidence snippet</p>
                      <p className="mt-1.5 text-sm italic leading-relaxed text-ink">
                        {signal.evidence_snippet ? `“${signal.evidence_snippet}”` : "No snippet stored."}
                      </p>
                      <p className="tabular mt-2.5 text-xs text-muted">
                        Verbatim match: {signal.evidence_verbatim ? "yes" : "no"} · Evidence strength{" "}
                        {signal.evidence_strength?.toFixed(2) ?? "—"} · Source reliability{" "}
                        {signal.source_reliability?.toFixed(2) ?? "—"} · Strategic relevance{" "}
                        {signal.strategic_relevance?.toFixed(2) ?? "—"}
                      </p>
                    </div>

                    {signal.related_records && signal.related_records.length > 0 ? (
                      <div className="rounded-[10px] border border-success/25 bg-success/5 p-4 text-sm">
                        <p className="text-xs font-semibold text-success">Cross-source corroboration</p>
                        <ul className="mt-2 space-y-1 text-xs text-ink/90">
                          {signal.related_records.map((rel) => (
                            <li key={rel.id} className="tabular">
                              Record #{rel.id} ({rel.source_name}) — {rel.title} · score {rel.total.toFixed(1)}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
                      <a href={api.signalUrl(signal.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent no-underline hover:underline">
                        <Download size={12} /> Raw signal JSON
                      </a>
                      <span>Source: {signal.source?.name ?? "Unknown"}</span>
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
