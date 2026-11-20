"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ExternalLink, Plus, Radar } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { CompetitorHint, CompetitorProfile } from "@/lib/types";
import { Badge, BusyProgress, Button, Card, Empty, ErrorNote, Loading, Notice, Stat } from "@/components/ui";

export default function CompetitorsPage() {
  const params = useParams<{ id: string }>();
  const companyId = Number(params?.id);

  const [competitors, setCompetitors] = useState<CompetitorProfile[]>([]);
  const [hints, setHints] = useState<CompetitorHint[]>([]);
  const [monitored, setMonitored] = useState<{ id: number; name: string; url: string; status: string; health: string }[]>([]);
  const [failed, setFailed] = useState<{ name: string; url: string; reason: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.listCompetitors(companyId);
      setCompetitors(data.competitors);
      setHints(data.hints);
      setMonitored(data.monitored_sources);
      setFailed(data.meta?.failed ?? []);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load competitors.");
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
    setNotice(null);
    try {
      const res = await api.discoverCompetitors(companyId);
      setCompetitors(res.competitors);
      setFailed(res.failed);
      setNotice(
        `Researched ${res.competitors.length} verified competitor profile(s) from ${res.fetched_count} fetched sites (${res.failed.length} failed).`,
      );
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Competitor discovery failed.");
    } finally {
      setBusy(null);
    }
  }

  async function monitorCompetitor(comp: CompetitorProfile) {
    setBusy(`add-${comp.website}`);
    setError(null);
    setNotice(null);
    try {
      await api.addSource(companyId, {
        name: `${comp.name} (Competitor)`,
        url: comp.website,
        category: "competitors",
        description: comp.positioning || comp.differentiation,
        reason: `Tracked from researched competitor profile (${comp.evidence_url})`,
        update_frequency: "weekly",
        reliability: 0.7,
      });
      setNotice(`Added ${comp.name} as a pending competitor monitoring source.`);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not add competitor source.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">Competitor landscape</h2>
          <p className="mt-0.5 text-sm text-muted">
            5–10 competitor profiles researched directly from fetched public homepages. Unreachable sites are dropped.
          </p>
        </div>
        <Button onClick={discover} disabled={busy !== null}>
          <Radar size={15} /> {busy === "discover" ? "Researching competitors…" : "Discover & research competitors"}
        </Button>
      </div>

      {busy === "discover" ? (
        <BusyProgress label="Identifying competitors and fetching public homepages…" />
      ) : null}
      {error ? <ErrorNote message={error} onRetry={load} /> : null}
      {notice ? <Notice>{notice}</Notice> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Researched profiles" value={competitors.length} />
        <Stat label="Monitored competitor sources" value={monitored.length} />
        <Stat label="Initial research hints" value={hints.length} />
      </div>

      {loading ? <Loading label="Loading competitors…" /> : null}

      {!loading && competitors.length === 0 ? (
        <Empty
          title="No researched competitor profiles yet"
          hint="Run competitor discovery after company research to fetch and verify 5–10 real competitors."
        />
      ) : null}

      {competitors.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {competitors.map((comp) => (
            <Card key={comp.website}>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[rgba(31,33,37,0.08)] pb-3.5">
                <div className="min-w-0">
                  <h3 className="text-base font-semibold text-ink">{comp.name}</h3>
                  <a
                    href={comp.website}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-0.5 inline-flex items-center gap-1 text-xs text-accent no-underline hover:underline"
                  >
                    {comp.website} <ExternalLink size={11} />
                  </a>
                </div>
                <Button variant="ghost" onClick={() => void monitorCompetitor(comp)} disabled={busy !== null}>
                  <Plus size={14} /> Track source
                </Button>
              </div>

              <div className="mt-3.5 space-y-2">
                {comp.positioning ? (
                  <p className="text-sm leading-relaxed text-ink/90">
                    <span className="font-medium text-ink">Positioning:</span> {comp.positioning}
                  </p>
                ) : null}
                {comp.pricing_or_offer ? (
                  <p className="text-sm text-muted">
                    <span className="font-medium text-ink/85">Offer / pricing:</span> {comp.pricing_or_offer}
                  </p>
                ) : null}
                {comp.differentiation ? (
                  <p className="text-sm text-muted">
                    <span className="font-medium text-ink/85">Differentiation:</span> {comp.differentiation}
                  </p>
                ) : null}
              </div>

              {(comp.strengths.length > 0 || comp.weaknesses.length > 0) ? (
                <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
                  {comp.strengths.length > 0 ? (
                    <div className="rounded-[10px] border border-success/20 bg-success/5 p-3">
                      <p className="text-xs font-semibold text-success">Strengths</p>
                      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed text-ink/85">
                        {comp.strengths.map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {comp.weaknesses.length > 0 ? (
                    <div className="rounded-[10px] border border-warning/25 bg-warning/5 p-3">
                      <p className="text-xs font-semibold text-warning">Weaknesses / gaps</p>
                      <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs leading-relaxed text-ink/85">
                        {comp.weaknesses.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <p className="mt-3.5 border-t border-[rgba(31,33,37,0.06)] pt-2.5 text-xs text-muted">
                Verified page:{" "}
                <a href={comp.evidence_url} target="_blank" rel="noreferrer" className="text-accent/90 no-underline hover:underline">
                  {comp.evidence_url}
                </a>
              </p>
            </Card>
          ))}
        </div>
      ) : null}

      {failed.length > 0 ? (
        <Card>
          <h3 className="text-sm font-semibold text-ink">
            Unreachable or skipped candidate sites ({failed.length})
          </h3>
          <ul className="mt-2.5 space-y-1.5 text-xs text-muted">
            {failed.map((f) => (
              <li key={f.url}>
                <span className="font-medium text-ink">{f.name}</span> ({f.url}) — {f.reason}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {monitored.length > 0 ? (
        <Card>
          <h3 className="text-sm font-semibold text-ink">
            Active competitor monitoring sources ({monitored.length})
          </h3>
          <ul className="mt-3 divide-y divide-[rgba(31,33,37,0.07)] text-sm">
            {monitored.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <span className="font-medium text-ink">{s.name}</span>
                  <a href={s.url} target="_blank" rel="noreferrer" className="ml-2 text-xs text-accent no-underline hover:underline">
                    {s.url}
                  </a>
                </div>
                <div className="flex gap-2">
                  <Badge>{s.status}</Badge>
                  <Badge tone={s.health === "ok" ? "ok" : "bad"}>{s.health}</Badge>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
