"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ExternalLink, Pencil, RefreshCw, Save, X } from "lucide-react";

import { api, ApiError } from "@/lib/api";
import type { CompanyOverview, Fact, Profile } from "@/lib/types";
import {
  Badge,
  BusyProgress,
  Button,
  Card,
  Empty,
  ErrorNote,
  Field,
  Loading,
  Notice,
  Stat,
  formatDate,
  inputClass,
} from "@/components/ui";

export default function OverviewPage() {
  const params = useParams<{ id: string }>();
  const companyId = Number(params?.id);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [overview, setOverview] = useState<CompanyOverview | null>(null);
  const [context, setContext] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({
    summary: "",
    industry: "",
    business_model: "",
    value_proposition: "",
    positioning: "",
    unverifiedText: "",
  });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const syncProfileForm = useCallback((p: Profile | null) => {
    setProfileForm({
      summary: p?.summary ?? "",
      industry: p?.industry ?? "",
      business_model: p?.business_model ?? "",
      value_proposition: p?.value_proposition ?? "",
      positioning: p?.positioning ?? "",
      unverifiedText: (p?.unverified ?? []).join("\n"),
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [company, dash] = await Promise.all([api.getCompany(companyId), api.getOverview(companyId)]);
      setProfile(company.profile);
      setOverview(dash);
      syncProfileForm(company.profile);
      setContext(company.context);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not load company.");
    } finally {
      setLoading(false);
    }
  }, [companyId, syncProfileForm]);

  useEffect(() => {
    if (Number.isFinite(companyId)) void load();
  }, [companyId, load]);

  async function runResearch() {
    setBusy("research");
    setError(null);
    setNotice(null);
    try {
      const result = await api.research(companyId);
      setProfile(result.profile);
      syncProfileForm(result.profile);
      setNotice(
        `Research stored. ${result.pages_fetched.length} pages fetched, ${result.unverified_count} unverified item(s) recorded.`,
      );
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Research failed.");
    } finally {
      setBusy(null);
    }
  }

  async function saveProfileEdit(event: React.FormEvent) {
    event.preventDefault();
    setBusy("profile");
    setError(null);
    setNotice(null);
    try {
      const unverified = profileForm.unverifiedText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      const updated = await api.patchProfile(companyId, {
        summary: profileForm.summary,
        industry: profileForm.industry,
        business_model: profileForm.business_model,
        value_proposition: profileForm.value_proposition,
        positioning: profileForm.positioning,
        unverified,
      });
      setProfile(updated);
      syncProfileForm(updated);
      setEditingProfile(false);
      setNotice("Profile changes saved.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save profile edits.");
    } finally {
      setBusy(null);
    }
  }

  async function saveContext() {
    setBusy("context");
    setError(null);
    setNotice(null);
    try {
      await api.updateCompany(companyId, { context });
      setNotice("Founder context saved. Use Automation → context reassessment to re-score sources.");
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not save context.");
    } finally {
      setBusy(null);
    }
  }

  function renderFacts(label: string, facts: Fact[] | undefined) {
    if (!facts || facts.length === 0) return null;
    return (
      <div className="rounded-[10px] border border-[rgba(31,33,37,0.08)] bg-secondary/70 p-4">
        <h4 className="text-[13px] font-semibold text-ink">{label}</h4>
        <ul className="mt-2.5 space-y-2.5">
          {facts.map((fact, index) => (
            <li key={`${label}-${index}`} className="text-sm leading-relaxed text-ink/90">
              <span>{fact.text}</span>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <Badge tone={fact.verified ? "ok" : "warn"}>{fact.verified ? "Verified" : "Unverified"}</Badge>
                <a
                  href={fact.evidence_url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-accent no-underline hover:underline"
                >
                  Source <ExternalLink size={11} />
                </a>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {loading ? <Loading label="Loading profile and monitoring status…" /> : null}
      {busy === "research" ? (
        <BusyProgress label="Researching website (fetching homepage + up to 5 internal pages, then building profile)…" />
      ) : null}
      {error ? <ErrorNote message={error} onRetry={load} /> : null}
      {notice ? <Notice>{notice}</Notice> : null}

      {overview ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Records analysed"
              value={`${overview.records_analysed} / ${overview.records_total}`}
              hint="analysed / discovered"
            />
            <Stat
              label="Latest crawl"
              value={overview.latest_crawl ? overview.latest_crawl.status : "Not run"}
              hint={overview.latest_crawl ? formatDate(overview.latest_crawl.at) : "Crawl approved sources"}
            />
            <Stat
              label="Latest brief"
              value={overview.latest_report ? `#${overview.latest_report.id}` : "None"}
              hint={
                overview.latest_report
                  ? `${overview.latest_report.actions} action(s) · ${formatDate(overview.latest_report.created)}`
                  : "Generate after analysis"
              }
            />
            <Stat
              label="Scheduled job"
              value={overview.scheduler_enabled ? "Local active" : "GitHub Actions"}
              hint={
                overview.latest_automation
                  ? `Last ${overview.latest_automation.job}: ${overview.latest_automation.status}`
                  : "weekly.yml · Monday 06:00 UTC"
              }
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(overview.sources_by_category).map(([cat, counts]) => (
              <div
                key={cat}
                className="rounded-[10px] border border-[rgba(31,33,37,0.08)] bg-surface px-4 py-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[13px] font-medium capitalize text-ink">{cat} sources</span>
                  <span className="tabular text-xs font-medium text-accent">{counts.total}</span>
                </div>
                <p className="tabular mt-1 text-xs text-muted">
                  {counts.approved} approved · {counts.pending} pending
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[rgba(31,33,37,0.08)] pb-4">
          <div>
            <h2 className="text-base font-semibold tracking-[-0.015em] text-ink">Company research &amp; founder context</h2>
            <p className="mt-1 text-sm text-muted">
              Fetches the homepage plus up to five internal pages. Facts without page evidence are demoted to unverified.
            </p>
          </div>
          <Button onClick={runResearch} disabled={busy === "research"}>
            <RefreshCw size={15} /> {busy === "research" ? "Researching…" : profile ? "Re-run research" : "Run research"}
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          <Field label="Founder context" hint="Used for question generation, analysis relevance, and context reassessment.">
            <textarea className={`${inputClass} h-20`} value={context} onChange={(event) => setContext(event.target.value)} />
          </Field>
          <div>
            <Button variant="ghost" onClick={saveContext} disabled={busy === "context"}>
              <Save size={15} /> {busy === "context" ? "Saving…" : "Save context"}
            </Button>
          </div>
        </div>
      </Card>

      {!loading && !profile ? (
        <Empty title="No profile stored yet" hint="Run research above to fetch the website and build a verified profile." />
      ) : null}

      {profile ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Stat label="Industry" value={profile.industry || "Unclear"} />
            <Stat
              label="Pages fetched"
              value={profile._meta?.pages_fetched?.length ?? 0}
              hint={profile._meta?.model ? `Model ${profile._meta.model}` : undefined}
            />
            <Stat label="Unverified items" value={profile.unverified?.length ?? 0} hint="Hypotheses, never counted as facts" />
          </div>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(31,33,37,0.08)] pb-4">
              <h3 className="text-lg font-semibold tracking-[-0.02em] text-ink">Verified company profile</h3>
              <Button
                variant="ghost"
                onClick={() => {
                  syncProfileForm(profile);
                  setEditingProfile((prev) => !prev);
                }}
              >
                {editingProfile ? (
                  <>
                    <X size={14} /> Cancel edit
                  </>
                ) : (
                  <>
                    <Pencil size={14} /> Edit profile
                  </>
                )}
              </Button>
            </div>

            {editingProfile ? (
              <form onSubmit={saveProfileEdit} className="mt-5 space-y-4">
                <Field label="Overview / summary">
                  <textarea
                    className={`${inputClass} h-24`}
                    value={profileForm.summary}
                    onChange={(event) => setProfileForm({ ...profileForm, summary: event.target.value })}
                  />
                </Field>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Industry">
                    <input
                      className={inputClass}
                      value={profileForm.industry}
                      onChange={(event) => setProfileForm({ ...profileForm, industry: event.target.value })}
                    />
                  </Field>
                  <Field label="Business model">
                    <input
                      className={inputClass}
                      value={profileForm.business_model}
                      onChange={(event) => setProfileForm({ ...profileForm, business_model: event.target.value })}
                    />
                  </Field>
                  <Field label="Value proposition">
                    <input
                      className={inputClass}
                      value={profileForm.value_proposition}
                      onChange={(event) => setProfileForm({ ...profileForm, value_proposition: event.target.value })}
                    />
                  </Field>
                  <Field label="Market positioning">
                    <input
                      className={inputClass}
                      value={profileForm.positioning}
                      onChange={(event) => setProfileForm({ ...profileForm, positioning: event.target.value })}
                    />
                  </Field>
                </div>
                <Field label="Unverified items (one per line)">
                  <textarea
                    className={`${inputClass} h-24`}
                    value={profileForm.unverifiedText}
                    onChange={(event) => setProfileForm({ ...profileForm, unverifiedText: event.target.value })}
                  />
                </Field>
                <Button type="submit" disabled={busy === "profile"}>
                  <Save size={14} /> {busy === "profile" ? "Saving…" : "Save profile edits"}
                </Button>
              </form>
            ) : (
              <div className="mt-5 space-y-5">
                <p className="prose-body max-w-[68ch] text-[15px] text-ink/90">{profile.summary || "No summary stored."}</p>

                {(profile.business_model || profile.value_proposition || profile.positioning) ? (
                  <div className="grid gap-3 md:grid-cols-3">
                    {profile.business_model ? (
                      <div className="rounded-[10px] border border-[rgba(31,33,37,0.08)] bg-secondary/70 p-3.5">
                        <p className="text-xs font-medium text-muted">Business model</p>
                        <p className="mt-1 text-sm text-ink">{profile.business_model}</p>
                      </div>
                    ) : null}
                    {profile.value_proposition ? (
                      <div className="rounded-[10px] border border-[rgba(31,33,37,0.08)] bg-secondary/70 p-3.5">
                        <p className="text-xs font-medium text-muted">Value proposition</p>
                        <p className="mt-1 text-sm text-ink">{profile.value_proposition}</p>
                      </div>
                    ) : null}
                    {profile.positioning ? (
                      <div className="rounded-[10px] border border-[rgba(31,33,37,0.08)] bg-secondary/70 p-3.5">
                        <p className="text-xs font-medium text-muted">Market positioning</p>
                        <p className="mt-1 text-sm text-ink">{profile.positioning}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  {renderFacts("Products", profile.products)}
                  {renderFacts("Customers", profile.customers)}
                  {renderFacts("Geography", profile.geography)}
                  {renderFacts("Differentiators", profile.differentiators)}
                  {renderFacts("Growth opportunities", profile.growth_opportunities)}
                  {renderFacts("Challenges", profile.challenges)}
                </div>
              </div>
            )}

            {profile.likely_competitors && profile.likely_competitors.length > 0 ? (
              <div className="mt-6 border-t border-[rgba(31,33,37,0.08)] pt-5">
                <h4 className="text-[13px] font-semibold text-muted">Initial competitor hints</h4>
                <ul className="mt-2.5 grid gap-2 sm:grid-cols-2">
                  {profile.likely_competitors.map((competitor) => (
                    <li
                      key={competitor.website}
                      className="rounded-[8px] border border-[rgba(31,33,37,0.07)] bg-secondary/60 px-3 py-2 text-sm"
                    >
                      <a href={competitor.website} target="_blank" rel="noreferrer" className="font-medium no-underline hover:underline">
                        {competitor.name}
                      </a>
                      {competitor.reason ? <p className="mt-0.5 text-xs text-muted">{competitor.reason}</p> : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {profile.unverified && profile.unverified.length > 0 ? (
              <div className="mt-6 rounded-[10px] border border-warning/30 bg-warning/5 p-4">
                <h4 className="text-[13px] font-semibold text-warning">Unverified hypotheses (not stored as facts)</h4>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-ink/85">
                  {profile.unverified.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {profile._meta?.fetch_failures && profile._meta.fetch_failures.length > 0 ? (
              <details className="mt-4 text-xs text-muted">
                <summary className="cursor-pointer font-medium hover:text-ink">
                  Fetch failures ({profile._meta.fetch_failures.length})
                </summary>
                <ul className="mt-2 space-y-1 font-mono">
                  {profile._meta.fetch_failures.map((failure, index) => (
                    <li key={index}>{failure}</li>
                  ))}
                </ul>
              </details>
            ) : null}

            {profile.intelligence?.completed_at ? (
              <div className="mt-6 rounded-[10px] border border-success/30 bg-success/5 p-4">
                <h4 className="text-[13px] font-semibold text-success">Interview intelligence captured</h4>
                <p className="mt-1 text-sm text-ink/90">
                  {profile.intelligence.answered ?? 0} answers, {profile.intelligence.skipped ?? 0} skipped — merged into the
                  profile on {formatDate(profile.intelligence.completed_at)}.
                </p>
              </div>
            ) : null}
          </Card>
        </>
      ) : null}
    </div>
  );
}
