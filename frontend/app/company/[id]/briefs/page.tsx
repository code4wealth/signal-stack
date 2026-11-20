"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Copy, Download, ExternalLink, FileText } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { Report, ReportListItem } from "@/lib/types";
import { Badge, Button, Card, Empty, ErrorNote, Loading, Notice, Stat, formatDate } from "@/components/ui";

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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">Monday Morning Brief</h2>
          <p className="mt-0.5 text-sm text-muted">
            Eleven fixed sections. Prose is written by the model; headings, top-five selection, and every citation id are validated in code.
          </p>
        </div>
        <Button onClick={generate} disabled={busy !== null}>
          <FileText size={15} /> {busy === "generate" ? "Generating brief…" : "Generate brief"}
        </Button>
      </div>

      {error ? <ErrorNote message={error} /> : null}
      {notice ? <Notice>{notice}</Notice> : null}
      {loading ? <Loading label="Loading briefs…" /> : null}

      {!loading && history && history.length === 0 ? (
        <Empty
          title="No briefs generated yet"
          hint="A brief requires analysed records. Crawl approved sources, run analysis, then generate."
        />
      ) : null}

      {history && history.length > 0 ? (
        <div className="grid items-start gap-6 lg:grid-cols-12">
          <div className="space-y-4 lg:col-span-4">
            <Card>
              <h3 className="text-sm font-semibold text-ink">Brief history</h3>
              <ul className="mt-3 divide-y divide-[rgba(31,33,37,0.07)]">
                {history.map((item) => {
                  const active = report?.id === item.id;
                  return (
                    <li key={item.id} className="py-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className={`text-sm font-medium ${active ? "text-accent" : "text-ink"}`}>
                            Brief #{item.id}
                          </p>
                          <p className="tabular mt-0.5 text-xs text-muted">{formatDate(item.created)}</p>
                          {item.top_signal ? (
                            <p className="mt-1 line-clamp-2 text-xs text-muted/85">{item.top_signal}</p>
                          ) : null}
                        </div>
                        <Badge>{item.actions} actions</Badge>
                      </div>
                      <div className="mt-2.5 flex items-center gap-3 text-xs">
                        <button
                          onClick={() => void openReport(item.id)}
                          disabled={busy !== null}
                          className="font-medium text-accent hover:underline disabled:opacity-50"
                        >
                          {active ? "Viewing" : "Open brief"}
                        </button>
                        <a href={api.exportUrl(item.id)} className="inline-flex items-center gap-1 text-muted hover:text-ink no-underline">
                          <Download size={12} /> Markdown
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>

          <div className="space-y-6 lg:col-span-8">
            {report ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Stat label="Records used" value={report.content.counts.records} />
                  <Stat label="Approved sources" value={report.content.counts.sources} />
                  <Stat label="Actions" value={report.content.actions.length} />
                  <Stat label="Dropped actions" value={report.content.dropped_actions} hint="Lacked valid evidence" />
                </div>

                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[rgba(31,33,37,0.08)] pb-5">
                    <div>
                      <h3 className="text-xl font-semibold tracking-[-0.025em] text-ink">
                        Monday Morning Brief — {report.content.company.name}
                      </h3>
                      <p className="tabular mt-1 text-xs text-muted">
                        {formatDate(report.content.generated_at)} · Model {report.content.model}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="ghost" onClick={copyMarkdown}>
                        <Copy size={14} /> {copied ? "Copied markdown" : "Copy markdown"}
                      </Button>
                      <a
                        href={api.exportUrl(report.id)}
                        className="btn-motion inline-flex min-h-[40px] items-center gap-2 rounded-[10px] border border-[rgba(31,33,37,0.12)] bg-surface/60 px-4 py-2 text-sm font-medium text-ink no-underline hover:border-accent/45 hover:text-accent"
                      >
                        <Download size={14} /> Export .md
                      </a>
                    </div>
                  </div>

                  <div className="mt-6 max-w-[72ch] space-y-6">
                    {report.content.sections.map((section) => (
                      <section key={section.key} className="space-y-2.5 border-b border-[rgba(31,33,37,0.06)] pb-5 last:border-b-0 last:pb-0">
                        <h4 className="text-sm font-semibold text-accent">{section.heading}</h4>

                        {section.key === "actions" && report.content.actions.length > 0 ? (
                          <ul className="space-y-3 pt-1">
                            {report.content.actions.map((action, index) => (
                              <li
                                key={`${action.action}-${index}`}
                                className="flex items-start gap-3 rounded-[10px] border border-[rgba(31,33,37,0.08)] bg-secondary/70 p-3.5"
                              >
                                <input
                                  type="checkbox"
                                  checked={action.done}
                                  disabled={busy !== null}
                                  onChange={(event) => void toggleAction(index, event.target.checked)}
                                  className="mt-1 h-4 w-4 accent-[#4F46E5]"
                                  aria-label={`Mark action done: ${action.action}`}
                                />
                                <div className="space-y-1">
                                  <p className={`text-[15px] font-medium ${action.done ? "text-muted line-through" : "text-ink"}`}>
                                    {action.action}
                                  </p>
                                  <p className="text-xs text-muted">
                                    Owner: {action.owner}
                                    {action.why ? ` · ${action.why}` : ""}
                                  </p>
                                  <p className="tabular text-xs text-muted/75">
                                    Citations: {action.record_ids.map((id) => `record ${id}`).join(", ")}
                                  </p>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="prose-body text-[15px] text-ink/90">{section.body}</p>
                        )}

                        {section.record_ids.length > 0 && section.key !== "actions" ? (
                          <p className="tabular text-xs text-muted">
                            Citations: {section.record_ids.map((id) => `record ${id}`).join(", ")}
                          </p>
                        ) : null}

                        {section.key === "strategic_implications" &&
                        report.content.opportunities &&
                        report.content.opportunities.length > 0 ? (
                          <div className="mt-3 space-y-2.5 pt-2">
                            <p className="text-xs font-semibold text-muted">Structured Opportunities</p>
                            <div className="grid gap-3 md:grid-cols-2">
                              {report.content.opportunities.map((opp, idx) => (
                                <div
                                  key={`${opp.opportunity}-${idx}`}
                                  className="rounded-[10px] border border-[rgba(31,33,37,0.08)] bg-secondary/70 p-3.5"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="text-sm font-semibold text-ink">{opp.opportunity}</span>
                                    <Badge tone={opp.priority === "high" ? "ok" : opp.priority === "medium" ? "info" : "neutral"}>
                                      {opp.priority}
                                    </Badge>
                                  </div>
                                  {opp.evidence ? <p className="mt-1.5 text-xs text-muted">Evidence: {opp.evidence}</p> : null}
                                  {opp.impact ? <p className="mt-1 text-xs text-muted">Impact: {opp.impact}</p> : null}
                                  {opp.next_step ? <p className="mt-1 text-xs font-medium text-accent">Next: {opp.next_step}</p> : null}
                                  <p className="tabular mt-2 text-[11px] text-muted/75">
                                    Cites {opp.record_ids.map((id) => `record ${id}`).join(", ")}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        {section.key === "risks_watchlist" && report.content.risks && report.content.risks.length > 0 ? (
                          <div className="mt-3 space-y-2.5 pt-2">
                            <p className="text-xs font-semibold text-muted">Structured Risks &amp; Mitigations</p>
                            <ul className="space-y-2.5">
                              {report.content.risks.map((item, idx) => (
                                <li
                                  key={`${item.risk}-${idx}`}
                                  className="rounded-[10px] border border-[rgba(31,33,37,0.08)] bg-secondary/70 p-3.5 text-sm"
                                >
                                  <p className="font-medium text-ink">{item.risk}</p>
                                  {item.mitigation ? (
                                    <p className="mt-1 text-xs text-muted">Mitigation: {item.mitigation}</p>
                                  ) : null}
                                  <p className="tabular mt-1.5 text-[11px] text-muted/75">
                                    Cites {item.record_ids.map((id) => `record ${id}`).join(", ")}
                                  </p>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </section>
                    ))}
                  </div>
                </Card>

                <Card>
                  <h3 className="mb-3 text-sm font-semibold text-ink">Record index</h3>
                  <ul className="space-y-1.5 text-xs">
                    {report.content.record_index.map((item) => (
                      <li key={item.id} className="tabular flex flex-wrap items-center gap-2 text-muted">
                        <span className="font-mono text-ink/75">record {item.id}</span>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-accent no-underline hover:underline"
                        >
                          {item.title || item.url} <ExternalLink size={11} />
                        </a>
                      </li>
                    ))}
                  </ul>
                </Card>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
