"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Copy, Download, FileText } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { Report, ReportListItem } from "@/lib/types";
import { Badge, Button, Card, Empty, ErrorNote, Loading, Stat, formatDate } from "@/components/ui";

export default function BriefsPage() {
  const params = useParams<{ id: string }>();
  const companyId = Number(params?.id);

  const [history, setHistory] = useState<ReportListItem[] | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const loadHistory = useCallback(async () => {
    try {
      const result = await api.listReports(companyId);
      setHistory(result.items);
      return result.items;
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load report history.");
      setHistory([]);
      return [];
    }
  }, [companyId]);

  useEffect(() => {
    if (!Number.isFinite(companyId)) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const items = await loadHistory();
      const first = items[0];
      if (!cancelled && first) {
        try {
          setReport(await api.getReport(first.id));
        } catch {
          /* history is still shown */
        }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId, loadHistory]);

  async function generate() {
    setBusy("generate");
    setError(null);
    setNotice(null);
    try {
      const created = await api.generateReport(companyId);
      setReport(created);
      await loadHistory();
      setNotice(
        `Brief #${created.id} generated from ${created.content.counts.records} records across ${created.content.counts.sources} approved sources.`,
      );
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not generate the brief.");
    } finally {
      setBusy(null);
    }
  }

  async function openReport(id: number) {
    setBusy(`report-${id}`);
    setError(null);
    try {
      setReport(await api.getReport(id));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not open that report.");
    } finally {
      setBusy(null);
    }
  }

  async function toggleAction(index: number, done: boolean) {
    if (!report) return;
    setBusy(`action-${index}`);
    try {
      const result = await api.toggleAction(report.id, index, done);
      setReport({ ...report, content: { ...report.content, actions: result.actions } });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not update the action.");
    } finally {
      setBusy(null);
    }
  }

  async function copyMarkdown() {
    if (!report?.markdown) return;
    try {
      await navigator.clipboard.writeText(report.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Clipboard is unavailable in this browser context. Use the download instead.");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Monday Morning Brief</h2>
          <p className="text-xs text-slate-500">
            Eleven sections. Prose is written by the model; headings, top-five selection and every citation id are
            validated in code.
          </p>
        </div>
        <Button onClick={generate} disabled={busy !== null}>
          <FileText size={16} /> {busy === "generate" ? "Generating…" : "Generate brief"}
        </Button>
      </div>

      {error ? <ErrorNote message={error} /> : null}
      {notice ? (
        <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">{notice}</div>
      ) : null}

      {loading ? <Loading label="Loading briefs…" /> : null}

      {history && history.length > 0 ? (
        <Card>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">History</h3>
          <ul className="divide-y divide-white/5">
            {history.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div>
                  <span className="text-sm text-slate-200">Brief #{item.id}</span>
                  <span className="ml-2 text-xs text-slate-500">{formatDate(item.created)}</span>
                  {item.top_signal ? <p className="text-xs text-slate-500">top signal: {item.top_signal}</p> : null}
                </div>
                <div className="flex items-center gap-2">
                  <Badge>{item.actions} actions</Badge>
                  <Button variant="ghost" onClick={() => void openReport(item.id)} disabled={busy !== null}>
                    Open
                  </Button>
                  <a href={api.exportUrl(item.id)} className="text-xs text-accent">
                    <Download size={14} className="mr-1 inline" />
                    markdown
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {!loading && history && history.length === 0 ? (
        <Empty
          title="No briefs yet"
          hint="A brief needs analysed records. Crawl sources, run analysis, then generate."
        />
      ) : null}

      {report ? (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Stat label="Records used" value={report.content.counts.records} />
            <Stat label="Approved sources" value={report.content.counts.sources} />
            <Stat label="Actions" value={report.content.actions.length} />
            <Stat label="Dropped actions" value={report.content.dropped_actions} hint="No valid evidence" />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={copyMarkdown}>
              <Copy size={16} /> {copied ? "Copied" : "Copy markdown"}
            </Button>
            <a
              href={api.exportUrl(report.id)}
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm no-underline hover:border-accent/50 hover:text-accent"
            >
              <Download size={16} /> Export .md
            </a>
          </div>

          <Card>
            <h3 className="text-lg font-semibold text-slate-100">
              Monday Morning Brief — {report.content.company.name}
            </h3>
            <p className="text-xs text-slate-500">
              {formatDate(report.content.generated_at)} · model {report.content.model}
            </p>

            {report.content.sections.map((section) => (
              <div key={section.key} className="mt-5">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-accent">{section.heading}</h4>

                {section.key === "actions" && report.content.actions.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {report.content.actions.map((action, index) => (
                      <li key={`${action.action}-${index}`} className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={action.done}
                          disabled={busy !== null}
                          onChange={(event) => void toggleAction(index, event.target.checked)}
                          className="mt-1 h-4 w-4 accent-[#2DD4BF]"
                          aria-label={`Mark action done: ${action.action}`}
                        />
                        <div>
                          <p className={`text-sm ${action.done ? "text-slate-500 line-through" : "text-slate-200"}`}>
                            {action.action} <span className="text-xs text-slate-500">· owner {action.owner}</span>
                          </p>
                          {action.why ? <p className="text-xs text-slate-500">{action.why}</p> : null}
                          <p className="text-xs text-slate-600">
                            cites {action.record_ids.map((id) => `record ${id}`).join(", ")}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="prose-body mt-2 text-sm text-slate-300">{section.body}</p>
                )}

                {section.record_ids.length > 0 && section.key !== "actions" ? (
                  <p className="mt-1 text-xs text-slate-600">
                    citations: {section.record_ids.map((id) => `record ${id}`).join(", ")}
                  </p>
                ) : null}

                {section.key === "strategic_implications" &&
                report.content.opportunities &&
                report.content.opportunities.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Structured Opportunities
                    </p>
                    <div className="grid gap-2 md:grid-cols-2">
                      {report.content.opportunities.map((opp, idx) => (
                        <div key={`${opp.opportunity}-${idx}`} className="rounded-lg border border-white/10 bg-secondary/40 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium text-slate-100">{opp.opportunity}</span>
                            <Badge tone={opp.priority === "high" ? "ok" : opp.priority === "medium" ? "info" : "neutral"}>
                              {opp.priority}
                            </Badge>
                          </div>
                          {opp.evidence ? <p className="mt-1 text-xs text-slate-400">Evidence: {opp.evidence}</p> : null}
                          {opp.impact ? <p className="mt-0.5 text-xs text-slate-400">Impact: {opp.impact}</p> : null}
                          {opp.next_step ? <p className="mt-0.5 text-xs text-accent">Next: {opp.next_step}</p> : null}
                          <p className="mt-1 text-xs text-slate-600">
                            cites {opp.record_ids.map((id) => `record ${id}`).join(", ")}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {section.key === "risks_watchlist" && report.content.risks && report.content.risks.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Structured Risks & Mitigations
                    </p>
                    <ul className="space-y-2">
                      {report.content.risks.map((item, idx) => (
                        <li key={`${item.risk}-${idx}`} className="rounded-lg border border-white/10 bg-secondary/40 p-3 text-xs">
                          <p className="font-medium text-slate-200">{item.risk}</p>
                          {item.mitigation ? <p className="mt-1 text-slate-400">Mitigation: {item.mitigation}</p> : null}
                          <p className="mt-1 text-slate-600">
                            cites {item.record_ids.map((id) => `record ${id}`).join(", ")}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ))}
          </Card>

          <Card>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Record index</h3>
            <ul className="space-y-1 text-xs">
              {report.content.record_index.map((item) => (
                <li key={item.id}>
                  <a href={item.url} target="_blank" rel="noreferrer">
                    record {item.id}: {item.title || item.url}
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </>
      ) : null}
    </div>
  );
}
