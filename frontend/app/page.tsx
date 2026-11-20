"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { Company } from "@/lib/types";
import { Badge, Button, Card, Empty, ErrorNote, Field, Loading, formatDate, inputClass } from "@/components/ui";

type Health = {
  status: string;
  llm: { model: string; api_key_configured: boolean };
  tables: string[];
};

const PIPELINE_STEPS = ["Research", "Interview", "Competitors", "Sources", "Crawl & Rank", "Monday Brief"];

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
    <div className="space-y-8">
      <section className="hero-enter border-b border-[rgba(233,237,243,0.08)] pb-8">
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-muted">
          {PIPELINE_STEPS.map((step, index) => (
            <span key={step} className="inline-flex items-center gap-2">
              <span className="text-ink/80">{step}</span>
              {index < PIPELINE_STEPS.length - 1 ? <span aria-hidden className="text-muted/50">→</span> : null}
            </span>
          ))}
        </div>

        <h1 className="mt-4 max-w-[24ch] text-3xl font-semibold tracking-[-0.035em] text-ink sm:text-4xl">
          Verify every company signal before you act on it
        </h1>
        <p className="mt-3 max-w-[62ch] text-base leading-relaxed text-muted">
          Add any company by name and website. Every profile fact, competitor record, signal score, and Monday Morning
          Brief is grounded in a real fetch and a verbatim quote.
        </p>

        {health ? (
          <div className="mt-5 flex flex-wrap items-center gap-2.5 text-xs">
            <Badge tone="ok">API {health.status}</Badge>
            <Badge tone="info">Model {health.llm.model}</Badge>
            {health.llm.api_key_configured ? (
              <Badge tone="ok">GROQ_API_KEY configured</Badge>
            ) : (
              <Badge tone="warn">GROQ_API_KEY missing — LLM calls return 503</Badge>
            )}
            <Badge>{health.tables.length} database tables</Badge>
          </div>
        ) : null}
      </section>

      {error ? <ErrorNote message={error} onRetry={load} /> : null}

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-7">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">
              Monitored companies
            </h2>
            <span className="tabular text-xs font-medium text-muted">
              {companies ? `${companies.length} total` : "Checking…"}
            </span>
          </div>

          {companies === null ? <Loading label="Loading companies…" /> : null}

          {companies && companies.length === 0 ? (
            <Empty
              title="No companies added yet"
              hint="Create a company using the form on the right, then run research to inspect its live site."
            />
          ) : null}

          {companies && companies.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {companies.map((company) => (
                <Link key={company.id} href={`/company/${company.id}`} className="group block no-underline">
                  <Card interactive className="flex h-full flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="truncate text-[17px] font-semibold tracking-[-0.015em] text-ink">
                            {company.name}
                          </h3>
                          <p className="mt-0.5 truncate text-xs text-muted">{company.website}</p>
                        </div>
                        <Badge tone={company.has_profile ? "ok" : "warn"}>
                          {company.has_profile ? "Profile ready" : "Needs research"}
                        </Badge>
                      </div>
                      {company.context ? (
                        <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted">{company.context}</p>
                      ) : (
                        <p className="mt-3 text-sm text-muted/60">No founder context added yet.</p>
                      )}
                    </div>
                    <div className="mt-4 flex items-center justify-between border-t border-[rgba(233,237,243,0.07)] pt-3 text-xs text-muted">
                      <span className="tabular">Added {formatDate(company.created)}</span>
                      <span className="inline-flex items-center gap-1 font-medium text-accent transition-transform duration-150 group-hover:translate-x-0.5">
                        Open workspace <ArrowRight size={13} />
                      </span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          ) : null}
        </div>

        <div className="lg:col-span-5">
          <Card>
            <h2 className="text-lg font-semibold tracking-[-0.02em] text-ink">Add a company</h2>
            <p className="mt-1 text-sm text-muted">
              Entered as live data — nothing about the company, its competitors, or its sources is hardcoded.
            </p>
            <form onSubmit={createCompany} className="mt-5 space-y-4">
              <Field label="Company name">
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                  placeholder="e.g. Northwind Logistics"
                  required
                />
              </Field>
              <Field label="Website URL">
                <input
                  className={inputClass}
                  value={form.website}
                  onChange={(event) => setForm({ ...form, website: event.target.value })}
                  placeholder="https://example.com"
                  required
                />
              </Field>
              <Field
                label="Founder context"
                hint="Guides interview questions, signal relevance scoring, and monitoring focus."
              >
                <textarea
                  className={`${inputClass} h-24`}
                  value={form.context}
                  onChange={(event) => setForm({ ...form, context: event.target.value })}
                  placeholder="e.g. Expanding into enterprise cross-border payments"
                />
              </Field>
              <Button type="submit" disabled={saving}>
                <Plus size={16} /> {saving ? "Creating company…" : "Create company"}
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
