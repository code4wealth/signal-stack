"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Ban, Check, Pause, Plus, Radar, Trash2 } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { DiscoveryResult, Source, SourceCategory } from "@/lib/types";
import { Badge, BusyProgress, Button, Card, Empty, ErrorNote, Field, Loading, Stat, formatDate, inputClass } from "@/components/ui";

const CATEGORIES: { key: SourceCategory; label: string; blurb: string }[] = [
  { key: "customers", label: "Customers", blurb: "Where the company's buyers publish news, reviews and procurement signals." },
  { key: "competitors", label: "Competitors", blurb: "Competitor sites and trade press covering them." },
  { key: "market", label: "Market", blurb: "Regulators, associations, statistics and funding news." },
  { key: "internal", label: "Internal", blurb: "Documents you uploaded. Labelled user-provided." },
];

export default function SourcesPage() {
  const params = useParams<{ id: string }>();
  const companyId = Number(params?.id);

  const [sources, setSources] = useState<Source[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", url: "", category: "market" as SourceCategory, reason: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listSources(companyId);
      setSources(result.items);
      setCounts(result.counts_by_status);
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Sources</h2>
          <p className="text-xs text-slate-500">
            Every stored source passed a real fetch during discovery. Rejected and paused sources are never crawled.
          </p>
        </div>
        <Button onClick={discover} disabled={busy === "discover"}>
          <Radar size={16} /> {busy === "discover" ? "Verifying candidates…" : "Discover sources"}
        </Button>
      </div>

      {busy === "discover" ? (
        <BusyProgress label="Discovering & verifying candidate URLs (1 req/s per host + RSS autodiscovery — may take 1–2 min)…" />
      ) : null}
      {error ? <ErrorNote message={error} onRetry={load} /> : null}

      {discovery ? (
        <Card>
          <h3 className="text-sm font-semibold text-slate-200">Last discovery run</h3>
          <div className="mt-3 grid gap-3 md:grid-cols-4">
            <Stat label="Verified & stored" value={discovery.created_count} />
            <Stat label="Dropped" value={discovery.dropped_count} hint="Unreachable, blocked or duplicate" />
            <Stat label="Customers" value={discovery.counts_by_category.customers ?? 0} />
            <Stat label="Competitors" value={discovery.counts_by_category.competitors ?? 0} />
          </div>
          {discovery.dropped.length > 0 ? (
            <details className="mt-3 text-xs text-slate-500">
              <summary className="cursor-pointer">Dropped candidates ({discovery.dropped.length})</summary>
              <ul className="mt-2 space-y-1">
                {discovery.dropped.map((item, index) => (
                  <li key={index}>
                    <span className="text-slate-400">{item.url}</span> — {item.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </Card>
      ) : null}

      <div className="flex flex-wrap gap-2 text-xs text-slate-400">
        {Object.entries(counts).map(([status, count]) => (
          <Badge key={status} tone={statusTone(status)}>
            {status}: {count}
          </Badge>
        ))}
      </div>

      {loading ? <Loading label="Loading sources…" /> : null}

      {!loading && sources && sources.length === 0 ? (
        <Empty
          title="No sources yet"
          hint="Run discovery after research, or add a URL you trust. Nothing is stored unless the fetch succeeds."
        />
      ) : null}

      {grouped.map((group) => (
        <Card key={group.key}>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              {group.label} <span className="text-slate-600">({group.items.length})</span>
            </h3>
            <p className="text-xs text-slate-500">{group.blurb}</p>
          </div>

          {group.items.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">No {group.label.toLowerCase()} sources yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-white/5">
              {group.items.map((source) => (
                <li key={source.id} className="py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-slate-100">{source.name}</span>
                        <Badge tone={statusTone(source.status)}>{source.status}</Badge>
                        <Badge tone={source.health === "ok" ? "ok" : source.health === "error" ? "bad" : "neutral"}>
                          health: {source.health}
                        </Badge>
                        <Badge>reliability {source.reliability.toFixed(2)}</Badge>
                        {source.relevance !== null ? (
                          <Badge tone={source.relevance < 0.4 ? "warn" : "info"}>
                            relevance {source.relevance.toFixed(2)}
                          </Badge>
                        ) : null}
                        {source.feed_url ? <Badge tone="info">RSS</Badge> : null}
                      </div>
                      <a href={source.url} target="_blank" rel="noreferrer" className="mt-1 block truncate text-xs text-accent">
                        {source.url}
                      </a>
                      {source.reason ? <p className="mt-1 text-xs text-slate-500">{source.reason}</p> : null}
                      {source.relevance_reason ? (
                        <p className="mt-1 text-xs text-slate-500">relevance reason: {source.relevance_reason}</p>
                      ) : null}
                      <p className="mt-1 text-xs text-slate-600">
                        last checked {formatDate(source.last_checked)}
                        {source.last_error ? ` · last error: ${source.last_error}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1">
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
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Add a source manually</h3>
        <p className="mt-1 text-xs text-slate-500">The URL is fetched first; if it cannot be fetched it is not stored.</p>
        <form onSubmit={addSource} className="mt-3 grid gap-3 md:grid-cols-2">
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
          <Field label="Why this source">
            <input className={inputClass} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
          </Field>
          <div className="md:col-span-2">
            <Button type="submit" disabled={busy !== null}>
              <Plus size={16} /> {busy === "add" ? "Verifying…" : "Add and verify"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
