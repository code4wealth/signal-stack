"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Ban, Check, ExternalLink, Pause, Plus, Radar, Trash2 } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { CrawlDiagnostics, DiscoveryResult, Source, SourceCategory } from "@/lib/types";
import { Badge, BusyProgress, Button, Card, Empty, ErrorNote, Field, Loading, Stat, formatDate, inputClass } from "@/components/ui";

const CATEGORIES: { key: SourceCategory; label: string; blurb: string }[] = [
  { key: "customers", label: "Customers", blurb: "Buyer news, reviews, and procurement signals." },
  { key: "competitors", label: "Competitors", blurb: "Competitor domains and trade coverage." },
  { key: "market", label: "Market", blurb: "Regulators, industry associations, and funding news." },
  { key: "internal", label: "Internal", blurb: "User-uploaded internal documents (labelled user-provided)." },
];

export default function SourcesPage() {
  const params = useParams<{ id: string }>();
  const companyId = Number(params?.id);

  const [sources, setSources] = useState<Source[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [diagnostics, setDiagnostics] = useState<CrawlDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", url: "", category: "market" as SourceCategory, reason: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [result, diag] = await Promise.all([api.listSources(companyId), api.crawlDiagnostics(companyId)]);
      setSources(result.items);
      setCounts(result.counts_by_status);
      setDiagnostics(diag);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load sources.");
      setSources([]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (Number.isFinite(companyId)) void load();
  }, [companyId, load]);

  async function discover() {
    setBusy("discover");
    setError(null);
    try {
      const result = await api.discoverSources(companyId);
      setDiscovery(result);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Discovery failed.");
    } finally {
      setBusy(null);
    }
  }

  async function act(id: number, action: "approve" | "reject" | "pause" | "delete") {
    setBusy(`source-${id}`);
    setError(null);
    try {
      if (action === "approve") await api.approveSource(id);
      else if (action === "reject") await api.patchSource(id, { status: "rejected" });
      else if (action === "pause") await api.patchSource(id, { status: "paused" });
      else await api.deleteSource(id);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Action failed.");
    } finally {
      setBusy(null);
    }
  }

  async function addSource(event: React.FormEvent) {
    event.preventDefault();
    setBusy("add");
    setError(null);
    try {
      await api.addSource(companyId, { ...form, reliability: 0.6 });
      setForm({ name: "", url: "", category: form.category, reason: "" });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not add source.");
    } finally {
      setBusy(null);
    }
  }

  function statusTone(status: string): "ok" | "warn" | "bad" | "neutral" {
    if (status === "approved") return "ok";
    if (status === "pending") return "warn";
    if (status === "rejected") return "bad";
    return "neutral";
  }

  const grouped = CATEGORIES.map((category) => ({
    ...category,
    items: (sources ?? []).filter((source) => source.category === category.key),
  }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">Monitoring sources</h2>
          <p className="mt-0.5 text-sm text-muted">
            Every stored source passed a live HTTP fetch during discovery. Rejected and paused sources are never crawled.
          </p>
        </div>
        <Button onClick={discover} disabled={busy === "discover"}>
          <Radar size={15} /> {busy === "discover" ? "Verifying candidates…" : "Discover sources"}
        </Button>
      </div>

      {busy === "discover" ? (
        <BusyProgress label="Discovering & verifying candidate URLs (1 req/s per host + RSS autodiscovery — may take 1–2 min)…" />
      ) : null}
      {error ? <ErrorNote message={error} onRetry={load} /> : null}

      {discovery ? (
        <Card>
          <h3 className="text-base font-semibold text-ink">Latest discovery run</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <Stat label="Verified & stored" value={discovery.created_count} />
            <Stat label="Dropped" value={discovery.dropped_count} hint="Unreachable, blocked or duplicate" />
            <Stat label="Customers" value={discovery.counts_by_category.customers ?? 0} />
            <Stat label="Competitors" value={discovery.counts_by_category.competitors ?? 0} />
          </div>
          {discovery.dropped.length > 0 ? (
            <details className="mt-3 text-xs text-muted">
              <summary className="cursor-pointer font-medium hover:text-ink">
                Dropped candidates ({discovery.dropped.length})
              </summary>
              <ul className="mt-2 space-y-1 font-mono">
                {discovery.dropped.map((item, index) => (
                  <li key={index}>
                    <span className="text-ink/80">{item.url}</span> — {item.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {Object.entries(counts).map(([status, count]) => (
          <Badge key={status} tone={statusTone(status)}>
            {status}: <span className="tabular ml-1">{count}</span>
          </Badge>
        ))}
      </div>

      {loading ? <Loading label="Loading sources…" /> : null}

      {!loading && sources && sources.length === 0 ? (
        <Empty
          title="No sources yet"
          hint="Run discovery after research, or add a URL you trust below. Nothing is stored unless the fetch succeeds."
        />
      ) : null}

      {grouped.map((group) => (
        <Card key={group.key}>
          <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[rgba(31,33,37,0.08)] pb-3.5">
            <h3 className="text-base font-semibold text-ink">
              {group.label} <span className="tabular text-sm font-normal text-muted">({group.items.length})</span>
            </h3>
            <p className="text-xs text-muted">{group.blurb}</p>
          </div>

          {group.items.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No {group.label.toLowerCase()} sources yet.</p>
          ) : (
            <ul className="divide-y divide-[rgba(31,33,37,0.07)]">
              {group.items.map((source) => (
                <li key={source.id} className="py-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-medium text-ink">{source.name}</span>
                        <Badge tone={statusTone(source.status)}>{source.status}</Badge>
                        {source.source_type ? <Badge tone="info">{source.source_type}</Badge> : null}
                        {source.update_frequency ? <Badge>{source.update_frequency}</Badge> : null}
                        <Badge tone={source.health === "ok" ? "ok" : source.health === "error" ? "bad" : "neutral"}>
                          health: {source.health}
                        </Badge>
                        <Badge>
                          <span className="tabular">rel {source.reliability.toFixed(2)}</span>
                        </Badge>
                        {source.relevance !== null ? (
                          <Badge tone={source.relevance < 0.4 ? "warn" : "info"}>
                            <span className="tabular">fit {source.relevance.toFixed(2)}</span>
                          </Badge>
                        ) : null}
                        {source.feed_url ? <Badge tone="info">RSS</Badge> : null}
                      </div>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1.5 inline-flex max-w-full items-center gap-1 truncate text-xs text-accent no-underline hover:underline"
                      >
                        <span className="truncate">{source.url}</span> <ExternalLink size={11} className="shrink-0" />
                      </a>
                      {source.description || source.reason ? (
                        <p className="mt-1.5 text-sm text-muted">{source.description || source.reason}</p>
                      ) : null}
                      {source.expected ? (
                        <p className="mt-0.5 text-xs text-muted/80">Expected signal: {source.expected}</p>
                      ) : null}
                      {source.relevance_reason ? (
                        <p className="mt-1 text-xs text-muted">Context fit: {source.relevance_reason}</p>
                      ) : null}
                      <p className="tabular mt-1.5 text-xs text-muted/75">
                        Last checked {formatDate(source.last_checked)}
                        {source.last_error ? ` · Error: ${source.last_error}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {source.status !== "approved" ? (
                        <Button variant="success" onClick={() => void act(source.id, "approve")} disabled={busy !== null}>
                          <Check size={14} /> Approve
                        </Button>
                      ) : (
                        <Button variant="ghost" onClick={() => void act(source.id, "pause")} disabled={busy !== null}>
                          <Pause size={14} /> Pause
                        </Button>
                      )}
                      <Button variant="ghost" onClick={() => void act(source.id, "reject")} disabled={busy !== null}>
                        <Ban size={14} /> Reject
                      </Button>
                      <Button variant="danger" onClick={() => void act(source.id, "delete")} disabled={busy !== null}>
                        <Trash2 size={14} /> Delete
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ))}

      <Card>
        <h3 className="text-base font-semibold text-ink">Add a source manually</h3>
        <p className="mt-1 text-sm text-muted">The URL is fetched live first; if unreachable or blocked it is not stored.</p>
        <form onSubmit={addSource} className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Name">
            <input className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
          </Field>
          <Field label="URL">
            <input className={inputClass} value={form.url} onChange={(event) => setForm({ ...form, url: event.target.value })} required />
          </Field>
          <Field label="Category">
            <select
              className={inputClass}
              value={form.category}
              onChange={(event) => setForm({ ...form, category: event.target.value as SourceCategory })}
            >
              {CATEGORIES.map((category) => (
                <option key={category.key} value={category.key}>
                  {category.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Why this source matters">
            <input className={inputClass} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
          </Field>
          <div className="md:col-span-2">
            <Button type="submit" disabled={busy !== null}>
              <Plus size={15} /> {busy === "add" ? "Verifying URL…" : "Add & verify source"}
            </Button>
          </div>
        </form>
      </Card>

      {diagnostics ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <h3 className="text-sm font-semibold text-ink">
              Crawl errors <span className="tabular text-muted">({diagnostics.failing_sources.length})</span>
            </h3>
            {diagnostics.failing_sources.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No failing sources recorded.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-xs">
                {diagnostics.failing_sources.map((s) => (
                  <li key={s.id} className="rounded-[8px] border border-danger/30 bg-danger/5 p-2.5">
                    <p className="font-medium text-ink">{s.name}</p>
                    <p className="truncate text-muted">{s.url}</p>
                    <p className="mt-1 text-danger">{s.last_error || "Fetch error"}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-ink">
              Duplicates skipped <span className="tabular text-muted">({diagnostics.total_duplicates_logged})</span>
            </h3>
            {diagnostics.duplicate_entries.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No duplicate skips logged yet.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-xs text-muted">
                {diagnostics.duplicate_entries.slice(0, 12).map((dup, idx) => (
                  <li key={`${dup.url}-${idx}`} className="truncate border-b border-[rgba(31,33,37,0.06)] pb-1.5">
                    <span className="font-medium text-ink/90">{dup.source_name}:</span> {dup.title || dup.url}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-ink">
              Source crawl history <span className="tabular text-muted">({diagnostics.history.length})</span>
            </h3>
            {diagnostics.history.length === 0 ? (
              <p className="mt-2 text-sm text-muted">No crawl runs recorded yet.</p>
            ) : (
              <ul className="mt-3 space-y-2 text-xs text-muted">
                {diagnostics.history.slice(0, 10).map((run) => (
                  <li
                    key={run.id}
                    className="tabular flex flex-wrap items-center justify-between gap-1 border-b border-[rgba(31,33,37,0.06)] pb-1.5"
                  >
                    <span>{formatDate(run.at)}</span>
                    <span className="text-ink/85">
                      +{run.new_records} new · {run.updated_records} upd · {run.duplicates} dup · {run.errors} err
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
