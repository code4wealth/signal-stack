"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Activity, CalendarClock, Database, Play, ShieldCheck, Upload } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { DocumentItem, JobLog, ReassessResult, Source } from "@/lib/types";
import {
  Badge,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Loading,
  Notice,
  formatDate,
  inputClass,
} from "@/components/ui";

export default function AutomationPage() {
  const params = useParams<{ id: string }>();
  const companyId = Number(params?.id);

  const [logs, setLogs] = useState<JobLog[] | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [docType, setDocType] = useState("support_tickets");
  const [sources, setSources] = useState<Source[]>([]);
  const [reassessment, setReassessment] = useState<ReassessResult | null>(null);
  const [context, setContext] = useState("International student recruitment and overseas education consultancy");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [logResult, docResult, sourceResult] = await Promise.all([
        api.jobLogs(companyId),
        api.listDocuments(companyId),
        api.listSources(companyId),
      ]);
      setLogs(logResult.items);
      setDocuments(docResult.items);
      setSources(sourceResult.items);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load automation data.");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (Number.isFinite(companyId)) void load();
  }, [companyId, load]);

  async function runJob(kind: "weekly" | "audit") {
    setBusy(kind);
    setError(null);
    setNotice(null);
    try {
      const result = kind === "weekly" ? await api.runAutomation(companyId) : await api.runAudit(companyId);
      setNotice(`${kind === "weekly" ? "Weekly pipeline" : "Source audit"} finished. ${JSON.stringify(result)}`);
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Job failed.");
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File | null) {
    if (!file) return;
    setBusy("upload");
    setError(null);
    setNotice(null);
    try {
      const stored = await api.uploadDocument(companyId, file, docType);
      setNotice(
        `Uploaded ${stored.filename} (${stored.document_type}, ${stored.characters} chars) and labelled ${stored.label}.`,
      );
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  }

  async function reassess() {
    setBusy("reassess");
    setError(null);
    setNotice(null);
    try {
      const result = await api.reassessContext(companyId, context);
      setReassessment(result);
      setNotice(
        `Reassessed ${result.scored} sources (${result.changed_count ?? 0} changed). ${result.recommended_removal.length} recommended for removal — nothing deleted.`,
      );
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Reassessment failed.");
    } finally {
      setBusy(null);
    }
  }

  const lowFitSources = sources.filter((s) => s.relevance !== null && s.relevance < 0.4);

  return (
    <div className="space-y-6">
      {error ? <ErrorNote message={error} onRetry={load} /> : null}
      {notice ? <Notice>{notice}</Notice> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="flex flex-col justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
              <CalendarClock size={16} className="text-accent" /> Weekly job
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Runs Crawl → Analyse → Brief. Also scheduled in <code className="font-mono text-xs text-ink/85">.github/workflows/weekly.yml</code> (and locally with <code className="font-mono text-xs text-ink/85">ENABLE_SCHEDULER=1</code>).
            </p>
          </div>
          <div className="mt-4">
            <Button onClick={() => void runJob("weekly")} disabled={busy !== null}>
              <Play size={15} /> {busy === "weekly" ? "Running…" : "Run weekly job"}
            </Button>
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
              <ShieldCheck size={16} className="text-accent" /> Source audit
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Re-fetches every source and updates health status. Failing sources are flagged cleanly, never deleted automatically.
            </p>
          </div>
          <div className="mt-4">
            <Button variant="ghost" onClick={() => void runJob("audit")} disabled={busy !== null}>
              <Activity size={15} /> {busy === "audit" ? "Auditing…" : "Run source audit"}
            </Button>
          </div>
        </Card>

        <Card className="flex flex-col justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
              <Upload size={16} className="text-accent" /> Internal document
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              TXT or CSV, 2 MB cap. Stored as <code className="font-mono text-xs text-ink/85">user-provided</code>, never as web evidence.
            </p>
            <div className="mt-3">
              <select
                aria-label="Document type"
                className={inputClass}
                value={docType}
                onChange={(event) => setDocType(event.target.value)}
              >
                <option value="support_tickets">Support tickets</option>
                <option value="sales_objections">Sales objections</option>
                <option value="lost_deals">Lost deals</option>
                <option value="product_requests">Product requests</option>
                <option value="general">General internal note</option>
              </select>
            </div>
          </div>

          <div className="mt-4 space-y-3">
            <label className="btn-motion inline-flex min-h-[40px] cursor-pointer items-center gap-2 rounded-[10px] border border-[rgba(31,33,37,0.12)] bg-surface/60 px-4 py-2 text-sm font-medium text-ink hover:border-accent/45 hover:text-accent">
              <Database size={15} />
              {busy === "upload" ? "Uploading…" : "Choose TXT or CSV"}
              <input
                type="file"
                accept=".txt,.csv"
                className="hidden"
                onChange={(event) => void upload(event.target.files?.[0] ?? null)}
              />
            </label>
            {documents.length > 0 ? (
              <ul className="space-y-2 text-xs text-muted">
                {documents.map((doc) => (
                  <li key={doc.record_id} className="rounded-[8px] border border-[rgba(31,33,37,0.08)] bg-secondary/70 p-2.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-ink">{doc.filename}</span>
                      {doc.document_type ? <Badge tone="info">{doc.document_type}</Badge> : null}
                      <Badge>user-provided</Badge>
                    </div>
                    <p className="tabular mt-1 text-muted">
                      {doc.characters} chars · {doc.analysed ? "analysed" : "pending analysis"}
                    </p>
                    {doc.insights ? (
                      <p className="tabular mt-1 text-muted/90">
                        complaints {doc.insights.counts.complaints ?? 0} · objections{" "}
                        {doc.insights.counts.objections ?? 0} · lost deals {doc.insights.counts.lost_deal_reasons ?? 0} ·
                        requests {doc.insights.counts.product_requests ?? 0}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Card>
      </div>

      <Card>
        <h3 className="text-base font-semibold tracking-[-0.015em] text-ink">Context reassessment</h3>
        <p className="mt-1 text-sm text-muted">
          Re-scores every active source against a new context and discovers new candidates. Sources below 0.4 are flagged for human approval before removal.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[280px] flex-1">
            <Field label="New monitoring context">
              <input className={inputClass} value={context} onChange={(event) => setContext(event.target.value)} />
            </Field>
          </div>
          <Button onClick={reassess} disabled={busy !== null}>
            {busy === "reassess" ? "Re-scoring sources…" : "Reassess sources"}
          </Button>
        </div>

        {reassessment ? (
          <div className="mt-5 space-y-4">
            {reassessment.profile_comparison ? (
              <div className="rounded-[10px] border border-accent/30 bg-accent/10 p-3.5 text-sm text-ink">
                <p className="text-xs font-semibold text-accent">Before vs after comparison</p>
                <p className="mt-1">{reassessment.profile_comparison.explanation}</p>
              </div>
            ) : (
              <p className="text-xs text-muted">
                Previous: “{reassessment.previous_context}” → New: “{reassessment.new_context}”
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[rgba(31,33,37,0.08)] text-muted">
                  <tr>
                    <th className="py-2.5 pr-3 font-medium">Source</th>
                    <th className="py-2.5 pr-3 font-medium">Category</th>
                    <th className="py-2.5 pr-3 font-medium">Before</th>
                    <th className="py-2.5 pr-3 font-medium">After</th>
                    <th className="py-2.5 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[rgba(31,33,37,0.06)]">
                  {reassessment.updated.map((item) => (
                    <tr key={item.source_id} className={item.relevance < 0.4 ? "text-warning" : "text-ink/90"}>
                      <td className="max-w-[220px] truncate py-2.5 pr-3 font-medium">{item.name}</td>
                      <td className="py-2.5 pr-3 capitalize">{item.category}</td>
                      <td className="tabular py-2.5 pr-3">{item.previous_relevance?.toFixed(2) ?? "—"}</td>
                      <td className="tabular py-2.5 pr-3 font-semibold">{item.relevance.toFixed(2)}</td>
                      <td className="py-2.5">{item.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {reassessment.recommended_removal.length > 0 ? (
              <div className="rounded-[10px] border border-warning/30 bg-warning/5 p-3.5 text-xs text-warning">
                Recommended for removal (needs your approval, nothing deleted):{" "}
                {reassessment.recommended_removal.map((item) => item.name).join(", ")}
              </div>
            ) : null}
          </div>
        ) : lowFitSources.length > 0 ? (
          <div className="mt-4 rounded-[10px] border border-warning/30 bg-warning/5 p-3.5 text-xs text-warning">
            Previously flagged below 0.4 fit: {lowFitSources.map((s) => `${s.name} (${s.relevance?.toFixed(2)})`).join(", ")}
          </div>
        ) : null}
      </Card>

      <Card>
        <h3 className="mb-3 text-base font-semibold tracking-[-0.015em] text-ink">Job logs</h3>
        {loading ? <Loading label="Loading job logs…" /> : null}
        {!loading && logs && logs.length === 0 ? (
          <Empty title="No jobs have run yet" hint="Run the weekly job or a source audit to record log entries." />
        ) : null}
        {logs && logs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[rgba(31,33,37,0.08)] text-muted">
                <tr>
                  <th className="py-2.5 pr-3 font-medium">When</th>
                  <th className="py-2.5 pr-3 font-medium">Job</th>
                  <th className="py-2.5 pr-3 font-medium">Status</th>
                  <th className="py-2.5 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(31,33,37,0.06)]">
                {logs.map((log) => (
                  <tr key={log.id} className="align-top text-ink/90">
                    <td className="tabular whitespace-nowrap py-2.5 pr-3 text-muted">{formatDate(log.at)}</td>
                    <td className="py-2.5 pr-3 font-medium">{log.job}</td>
                    <td className="py-2.5 pr-3">
                      <Badge tone={log.status === "ok" ? "ok" : log.status === "error" ? "bad" : "warn"}>{log.status}</Badge>
                    </td>
                    <td className="max-w-lg break-words py-2.5 font-mono text-[11px] text-muted">{log.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
