"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Activity, CalendarClock, Database, Play, ShieldCheck, Upload } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { DocumentItem, JobLog, ReassessResult, Source } from "@/lib/types";
import { Badge, Button, Card, Empty, ErrorNote, Field, Loading, formatDate, inputClass } from "@/components/ui";

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
      setNotice(`${kind === "weekly" ? "Weekly" : "Source audit"} finished. ${JSON.stringify(result)}`);
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

  return (
    <div className="space-y-6">
      {error ? <ErrorNote message={error} onRetry={load} /> : null}
      {notice ? (
        <div className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">{notice}</div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <CalendarClock size={16} /> Weekly job
          </h3>
          <p className="mt-2 text-xs text-slate-500">
            Crawl → analyse → brief. Also scheduled in <code>.github/workflows/weekly.yml</code> (and locally with
            ENABLE_SCHEDULER=1).
          </p>
          <div className="mt-3">
            <Button onClick={() => void runJob("weekly")} disabled={busy !== null}>
              <Play size={16} /> {busy === "weekly" ? "Running…" : "Run now"}
            </Button>
          </div>
        </Card>

        <Card>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <ShieldCheck size={16} /> Source audit
          </h3>
          <p className="mt-2 text-xs text-slate-500">
            Re-fetches every source and records health. Failing sources are flagged, never deleted.
          </p>
          <div className="mt-3">
            <Button variant="ghost" onClick={() => void runJob("audit")} disabled={busy !== null}>
              <Activity size={16} /> {busy === "audit" ? "Auditing…" : "Run audit"}
            </Button>
          </div>
        </Card>

        <Card>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Upload size={16} /> Internal document
          </h3>
          <p className="mt-2 text-xs text-slate-500">TXT or CSV, 2 MB maximum. Stored as user-provided, never as web evidence.</p>
          <div className="mt-2">
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
          <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm hover:border-accent/50 hover:text-accent">
            <Database size={16} />
            {busy === "upload" ? "Uploading…" : "Choose file"}
            <input
              type="file"
              accept=".txt,.csv"
              className="hidden"
              onChange={(event) => void upload(event.target.files?.[0] ?? null)}
            />
          </label>
          {documents.length > 0 ? (
            <ul className="mt-3 space-y-2 text-xs text-slate-400">
              {documents.map((doc) => (
                <li key={doc.record_id} className="rounded border border-white/5 bg-secondary/40 p-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium text-slate-200">{doc.filename}</span>
                    {doc.document_type ? <Badge tone="info">{doc.document_type}</Badge> : null}
                    <Badge>user-provided</Badge>
                  </div>
                  <p className="mt-1 text-slate-500">
                    {doc.characters} chars · {doc.analysed ? "analysed" : "not analysed"}
                  </p>
                  {doc.insights ? (
                    <p className="mt-1 text-slate-500">
                      complaints {doc.insights.counts.complaints ?? 0} · objections{" "}
                      {doc.insights.counts.objections ?? 0} · lost deals {doc.insights.counts.lost_deal_reasons ?? 0} ·
                      requests {doc.insights.counts.product_requests ?? 0}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>
      </div>

      <Card>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Context reassessment</h3>
        <p className="mt-1 text-xs text-slate-500">
          Re-scores every active source against a new context and runs discovery again. Sources below 0.4 need your
          approval before removal.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <div className="min-w-[320px] flex-1">
            <Field label="New context">
              <input className={inputClass} value={context} onChange={(event) => setContext(event.target.value)} />
            </Field>
          </div>
          <Button onClick={reassess} disabled={busy !== null}>
            {busy === "reassess" ? "Re-scoring…" : "Reassess sources"}
          </Button>
        </div>

        {reassessment ? (
          <div className="mt-4 space-y-3">
            {reassessment.profile_comparison ? (
              <div className="rounded-lg border border-accent/20 bg-accent/5 p-3 text-xs text-slate-300">
                <p className="font-semibold text-accent">Before vs after comparison</p>
                <p className="mt-1">{reassessment.profile_comparison.explanation}</p>
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                previous: “{reassessment.previous_context}” → new: “{reassessment.new_context}”
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-slate-500">
                  <tr>
                    <th className="py-2">Source</th>
                    <th className="py-2">Category</th>
                    <th className="py-2">Before</th>
                    <th className="py-2">After</th>
                    <th className="py-2">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {reassessment.updated.map((item) => (
                    <tr key={item.source_id} className={item.relevance < 0.4 ? "text-warning" : "text-slate-300"}>
                      <td className="max-w-[220px] truncate py-2">{item.name}</td>
                      <td className="py-2">{item.category}</td>
                      <td className="py-2">{item.previous_relevance?.toFixed(2) ?? "—"}</td>
                      <td className="py-2">{item.relevance.toFixed(2)}</td>
                      <td className="py-2">{item.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {reassessment.recommended_removal.length > 0 ? (
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-xs text-warning">
                Recommended for removal (needs your approval, nothing deleted):{" "}
                {reassessment.recommended_removal.map((item) => item.name).join(", ")}
              </div>
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Job logs</h3>
        {loading ? <Loading label="Loading job logs…" /> : null}
        {!loading && logs && logs.length === 0 ? (
          <Empty title="No jobs have run yet" hint="Run the weekly job or an audit to create log entries." />
        ) : null}
        {logs && logs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-slate-500">
                <tr>
                  <th className="py-2">When</th>
                  <th className="py-2">Job</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">Detail</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {logs.map((log) => (
                  <tr key={log.id} className="align-top text-slate-300">
                    <td className="whitespace-nowrap py-2">{formatDate(log.at)}</td>
                    <td className="py-2">{log.job}</td>
                    <td className="py-2">
                      <Badge tone={log.status === "ok" ? "ok" : log.status === "error" ? "bad" : "warn"}>{log.status}</Badge>
                    </td>
                    <td className="max-w-[520px] truncate py-2 text-slate-500">{log.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>

      <Card>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Sources at a glance</h3>
        <p className="mt-1 text-xs text-slate-500">
          {sources.filter((source) => source.status === "approved").length} approved ·{" "}
          {sources.filter((source) => source.status === "pending").length} pending ·{" "}
          {sources.filter((source) => source.health === "error").length} with fetch errors
        </p>
      </Card>
    </div>
  );
}
