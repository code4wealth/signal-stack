"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { Company } from "@/lib/types";
import { Badge, Button, Card, Empty, ErrorNote, Field, Loading, PageHeader, formatDate, inputClass } from "@/components/ui";

type Health = {
  status: string;
  llm: { model: string; api_key_configured: boolean };
  tables: string[];
};

export default function HomePage() {
  const [companies, setCompanies] = useState<Company[] | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: "", website: "", context: "" });

  const load = useCallback(async () => {
    setError(null);
    try {
      const [companyList, healthResult] = await Promise.all([api.listCompanies(), api.health()]);
      setCompanies(companyList.items);
      setHealth(healthResult);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not reach the API.");
      // Leave the list in its "unknown" state: showing "No companies yet" here would
      // claim the database is empty when the API was simply unreachable.
      setCompanies(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createCompany(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await api.createCompany(form);
      setForm({ name: "", website: "", context: "" });
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not create the company.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Companies"
        subtitle="Add a company by name and website. Research, interview, sources, crawl, ranking and the Monday Brief are all generated from what the pipeline can verify."
      />

      {health ? (
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
          <Badge tone="ok">API {health.status}</Badge>
          <span>model: {health.llm.model}</span>
          {health.llm.api_key_configured ? (
            <Badge tone="ok">GROQ_API_KEY configured</Badge>
          ) : (
            <Badge tone="warn">GROQ_API_KEY missing — LLM steps will return 503</Badge>
          )}
          <span>{health.tables.length} tables</span>
        </div>
      ) : null}

      {error ? <ErrorNote message={error} onRetry={load} /> : null}

      <Card>
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-400">Add a company</h2>
        <form onSubmit={createCompany} className="grid gap-4 md:grid-cols-2">
          <Field label="Company name">
            <input
              className={inputClass}
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="e.g. Northwind Logistics"
              required
            />
          </Field>
          <Field label="Website" hint="Entered as data — nothing about the company is hardcoded.">
            <input
              className={inputClass}
              value={form.website}
              onChange={(event) => setForm({ ...form, website: event.target.value })}
              placeholder="example.com"
              required
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Founder context" hint="What the founder cares about right now. Used for interview questions, relevance and reassessment.">
              <textarea
                className={`${inputClass} h-24`}
                value={form.context}
                onChange={(event) => setForm({ ...form, context: event.target.value })}
                placeholder="e.g. Expanding into international student recruitment"
              />
            </Field>
          </div>
          <div className="md:col-span-2">
            <Button type="submit" disabled={saving}>
              <Plus size={16} /> {saving ? "Creating…" : "Create company"}
            </Button>
          </div>
        </form>
      </Card>

      {companies === null ? <Loading label="Loading companies…" /> : null}

      {companies && companies.length === 0 ? (
        <Empty title="No companies yet" hint="Create one above, then run research to build its profile." />
      ) : null}

      {companies && companies.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {companies.map((company) => (
            <Link key={company.id} href={`/company/${company.id}`} className="block no-underline">
              <Card className="h-full transition hover:border-accent/40">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-100">{company.name}</h3>
                    <p className="text-xs text-slate-400">{company.website}</p>
                  </div>
                  <Badge tone={company.has_profile ? "ok" : "warn"}>
                    {company.has_profile ? "profile ready" : "no profile"}
                  </Badge>
                </div>
                {company.context ? <p className="mt-3 line-clamp-3 text-sm text-slate-400">{company.context}</p> : null}
                <p className="mt-3 text-xs text-slate-500">created {formatDate(company.created)}</p>
              </Card>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
