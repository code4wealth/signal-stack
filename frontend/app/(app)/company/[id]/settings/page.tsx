"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock,
  PauseCircle,
  RefreshCw,
  Save,
  Settings,
  ShieldCheck,
} from "lucide-react";

import { GlassCard, SkeletonBlock, StatusPill } from "@/components/ui-shared";
import { getCompanySettings, updateCompanySettings } from "@/lib/api";
import type { CompanySettingsPatch } from "@/lib/types";

const WEEKDAYS = [
  { value: 0, label: "Monday" },
  { value: 1, label: "Tuesday" },
  { value: 2, label: "Wednesday" },
  { value: 3, label: "Thursday" },
  { value: 4, label: "Friday" },
  { value: 5, label: "Saturday" },
  { value: 6, label: "Sunday" },
];

const COMMON_TIMEZONES = [
  "Asia/Kolkata",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
];

export default function CompanySettingsPage() {
  const params = useParams<{ id: string }>();
  const companyId = Number(params.id);
  const queryClient = useQueryClient();

  const {
    data: settings,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["settings", companyId],
    queryFn: () => getCompanySettings(companyId),
    enabled: Number.isFinite(companyId) && companyId > 0,
  });

  const [briefingDay, setBriefingDay] = useState(0);
  const [briefingTime, setBriefingTime] = useState("07:00");
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [monitoringFrequency, setMonitoringFrequency] = useState<
    "6h" | "12h" | "daily" | "weekly"
  >("daily");
  const [sourceRefreshFrequency, setSourceRefreshFrequency] = useState<
    "daily" | "weekly" | "biweekly" | "monthly"
  >("weekly");
  const [monthlySourceHealthCheck, setMonthlySourceHealthCheck] = useState(true);
  const [healthCheckDayOfMonth, setHealthCheckDayOfMonth] = useState(1);

  const [companyName, setCompanyName] = useState("");
  const [website, setWebsite] = useState("");
  const [context, setContext] = useState("");
  const [summary, setSummary] = useState("");
  const [industry, setIndustry] = useState("");
  const [targetCustomers, setTargetCustomers] = useState("");
  const [valueProposition, setValueProposition] = useState("");

  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!settings) return;
    setBriefingDay(settings.briefingDay);
    setBriefingTime(settings.briefingTime);
    setTimezone(settings.timezone);
    setMonitoringFrequency(settings.monitoringFrequency);
    setSourceRefreshFrequency(settings.sourceRefreshFrequency);
    setMonthlySourceHealthCheck(settings.monthlySourceHealthCheck);
    setHealthCheckDayOfMonth(settings.healthCheckDayOfMonth);
    setCompanyName(settings.profile.companyName);
    setWebsite(settings.profile.website);
    setContext(settings.profile.context);
    setSummary(settings.profile.summary);
    setIndustry(settings.profile.industry);
    setTargetCustomers(settings.profile.targetCustomers);
    setValueProposition(settings.profile.valueProposition);
  }, [settings]);

  const timezoneOptions = useMemo(() => {
    if (!timezone || COMMON_TIMEZONES.includes(timezone)) return COMMON_TIMEZONES;
    return [timezone, ...COMMON_TIMEZONES];
  }, [timezone]);

  const mutation = useMutation({
    mutationFn: (payload: CompanySettingsPatch) => updateCompanySettings(companyId, payload),
    onSuccess: (updated) => {
      queryClient.setQueryData(["settings", companyId], updated);
      void queryClient.invalidateQueries({ queryKey: ["company", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["companies"] });
      void queryClient.invalidateQueries({ queryKey: ["automation", companyId] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard", companyId] });
      setSaveError(null);
      setSavedNotice("Settings saved and synced to automation schedules.");
      window.setTimeout(() => setSavedNotice(null), 4000);
    },
    onError: (err) => {
      setSavedNotice(null);
      setSaveError(err instanceof Error ? err.message : "Could not save settings.");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    mutation.mutate({
      briefingDay,
      briefingTime,
      timezone,
      monitoringFrequency,
      sourceRefreshFrequency,
      monthlySourceHealthCheck,
      healthCheckDayOfMonth,
      companyName,
      website,
      context,
      summary,
      industry,
      targetCustomers,
      valueProposition,
    });
  };

  if (isLoading && !settings) {
    return (
      <div className="space-y-5 pb-12">
        <SkeletonBlock className="h-24" />
        <SkeletonBlock className="h-64" />
        <SkeletonBlock className="h-64" />
      </div>
    );
  }

  if (error && !settings) {
    return (
      <GlassCard className="flex flex-wrap items-center justify-between gap-3 border-[#DC2626]/25 bg-[#DC2626]/5 p-5">
        <div className="flex items-center gap-2 text-sm text-[#991B1B]">
          <AlertCircle size={18} className="shrink-0 text-[#DC2626]" />
          <span>{error instanceof Error ? error.message : "Could not load settings."}</span>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="focus-ring inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#1C1D21] px-4 text-xs font-medium text-white"
        >
          <RefreshCw size={13} /> Retry
        </button>
      </GlassCard>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 pb-12">
      {/* Header */}
      <GlassCard className="flex flex-wrap items-center justify-between gap-4 p-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Settings size={17} className="text-[#4F46E5]" aria-hidden="true" />
            <h1 className="text-lg font-semibold text-[#1F2125]">Workspace Settings</h1>
            {settings ? (
              <StatusPill
                tone={settings.schedulerEngine === "running" ? "verified" : "warning"}
                icon={
                  settings.schedulerEngine === "running" ? (
                    <CheckCircle2 size={11} />
                  ) : (
                    <PauseCircle size={11} />
                  )
                }
              >
                {settings.schedulerEngine === "running"
                  ? "Scheduler running"
                  : "Scheduler is off"}
              </StatusPill>
            ) : null}
          </div>
          <p className="text-xs text-[#4B5058]">
            Configure briefing cadence, timezone, monitoring frequency, monthly source health
            audits, and your company profile. Changes immediately update your active{" "}
            <Link
              href={`/company/${companyId}/automation`}
              className="font-medium text-[#4F46E5] underline"
            >
              Automation schedules
            </Link>
            .
          </p>
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="focus-ring inline-flex h-10 items-center gap-2 rounded-xl bg-[#1C1D21] px-4 text-xs font-semibold text-white hover:bg-[#1C1D21]/90 disabled:opacity-55"
        >
          <Save size={14} aria-hidden="true" />
          {mutation.isPending ? "Saving…" : "Save settings"}
        </button>
      </GlassCard>

      {savedNotice ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-2xl border border-[#059669]/30 bg-[#059669]/10 px-4 py-3 text-xs font-medium text-[#047857]"
        >
          <CheckCircle2 size={15} className="shrink-0" />
          <span>{savedNotice}</span>
        </div>
      ) : null}

      {saveError ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-2xl border border-[#DC2626]/30 bg-[#DC2626]/10 px-4 py-3 text-xs font-medium text-[#991B1B]"
        >
          <AlertCircle size={15} className="shrink-0" />
          <span>{saveError}</span>
        </div>
      ) : null}

      {/* Briefing & Monitoring Cadence */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <GlassCard className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <CalendarClock size={15} className="text-[#4F46E5]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-[#1F2125]">
              Monday Brief Delivery & Timezone
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="settings-briefing-day"
                className="block font-mono text-[10.5px] uppercase text-[#9AA0AA]"
              >
                Briefing day
              </label>
              <select
                id="settings-briefing-day"
                value={briefingDay}
                onChange={(e) => setBriefingDay(Number(e.target.value))}
                className="focus-ring mt-1 h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 text-xs text-[#1F2125]"
              >
                {WEEKDAYS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="settings-briefing-time"
                className="block font-mono text-[10.5px] uppercase text-[#9AA0AA]"
              >
                Briefing time
              </label>
              <input
                id="settings-briefing-time"
                type="time"
                value={briefingTime}
                onChange={(e) => setBriefingTime(e.target.value)}
                className="focus-ring mt-1 h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 text-xs text-[#1F2125]"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="settings-timezone"
              className="block font-mono text-[10.5px] uppercase text-[#9AA0AA]"
            >
              Workspace timezone (IANA)
            </label>
            <select
              id="settings-timezone"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              className="focus-ring mt-1 h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 text-xs text-[#1F2125]"
            >
              {timezoneOptions.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>

          {settings?.nextBriefRunAt ? (
            <p className="flex items-center gap-1.5 rounded-xl border border-white/80 bg-white/60 px-3 py-2 font-mono text-[11px] text-[#4B5058]">
              <Clock size={12} className="text-[#4F46E5]" />
              Next scheduled brief: {new Date(settings.nextBriefRunAt).toLocaleString()}
            </p>
          ) : null}
        </GlassCard>

        <GlassCard className="space-y-4 p-5">
          <div className="flex items-center gap-2">
            <ShieldCheck size={15} className="text-[#059669]" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-[#1F2125]">
              Monitoring & Source Health Checks
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label
                htmlFor="settings-monitoring-freq"
                className="block font-mono text-[10.5px] uppercase text-[#9AA0AA]"
              >
                Monitoring frequency
              </label>
              <select
                id="settings-monitoring-freq"
                value={monitoringFrequency}
                onChange={(e) =>
                  setMonitoringFrequency(e.target.value as "6h" | "12h" | "daily" | "weekly")
                }
                className="focus-ring mt-1 h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 text-xs text-[#1F2125]"
              >
                <option value="6h">Every 6 hours</option>
                <option value="12h">Every 12 hours</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly (on briefing day)</option>
              </select>
            </div>

            <div>
              <label
                htmlFor="settings-source-refresh"
                className="block font-mono text-[10.5px] uppercase text-[#9AA0AA]"
              >
                Source refresh cadence
              </label>
              <select
                id="settings-source-refresh"
                value={sourceRefreshFrequency}
                onChange={(e) =>
                  setSourceRefreshFrequency(
                    e.target.value as "daily" | "weekly" | "biweekly" | "monthly",
                  )
                }
                className="focus-ring mt-1 h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 text-xs text-[#1F2125]"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Biweekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>

          <div className="space-y-3 rounded-xl border border-white/85 bg-white/65 p-3.5">
            <label className="flex cursor-pointer items-center justify-between gap-2 text-xs font-medium text-[#1F2125]">
              <span>Monthly source-health check</span>
              <input
                type="checkbox"
                checked={monthlySourceHealthCheck}
                onChange={(e) => setMonthlySourceHealthCheck(e.target.checked)}
                className="h-4 w-4 accent-[#4F46E5]"
              />
            </label>
            <div className="flex items-center justify-between gap-3">
              <label
                htmlFor="settings-health-dom"
                className="text-[11.5px] text-[#4B5058]"
              >
                Run audit on day of month (1–28)
              </label>
              <input
                id="settings-health-dom"
                type="number"
                min={1}
                max={28}
                disabled={!monthlySourceHealthCheck}
                value={healthCheckDayOfMonth}
                onChange={(e) =>
                  setHealthCheckDayOfMonth(Math.max(1, Math.min(28, Number(e.target.value) || 1)))
                }
                className="focus-ring h-8 w-20 rounded-xl border border-white/85 bg-white/85 px-2.5 text-center font-mono text-xs disabled:opacity-45"
              />
            </div>
          </div>
        </GlassCard>
      </div>

      {/* Company Profile */}
      <GlassCard className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-[#1F2125]">Company Profile</h2>
          <span className="font-mono text-[10.5px] text-[#9AA0AA]">
            Used for relevance scoring, source discovery & brief synthesis
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label
              htmlFor="settings-company-name"
              className="block font-mono text-[10.5px] uppercase text-[#9AA0AA]"
            >
              Company name
            </label>
            <input
              id="settings-company-name"
              type="text"
              required
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="focus-ring mt-1 h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 text-xs text-[#1F2125]"
            />
          </div>

          <div>
            <label
              htmlFor="settings-website"
              className="block font-mono text-[10.5px] uppercase text-[#9AA0AA]"
            >
              Website
            </label>
            <input
              id="settings-website"
              type="text"
              required
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className="focus-ring mt-1 h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 text-xs text-[#1F2125]"
            />
          </div>

          <div>
            <label
              htmlFor="settings-industry"
              className="block font-mono text-[10.5px] uppercase text-[#9AA0AA]"
            >
              Industry
            </label>
            <input
              id="settings-industry"
              type="text"
              value={industry}
              onChange={(e) => setIndustry(e.target.value)}
              placeholder="e.g. Developer Tools / B2B SaaS"
              className="focus-ring mt-1 h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 text-xs text-[#1F2125]"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="settings-target-customers"
              className="block font-mono text-[10.5px] uppercase text-[#9AA0AA]"
            >
              Target customers
            </label>
            <input
              id="settings-target-customers"
              type="text"
              value={targetCustomers}
              onChange={(e) => setTargetCustomers(e.target.value)}
              placeholder="e.g. Mid-market engineering and finance teams"
              className="focus-ring mt-1 h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 text-xs text-[#1F2125]"
            />
          </div>

          <div>
            <label
              htmlFor="settings-value-prop"
              className="block font-mono text-[10.5px] uppercase text-[#9AA0AA]"
            >
              Value proposition
            </label>
            <input
              id="settings-value-prop"
              type="text"
              value={valueProposition}
              onChange={(e) => setValueProposition(e.target.value)}
              placeholder="Core differentiation and buyer value"
              className="focus-ring mt-1 h-9 w-full rounded-xl border border-white/85 bg-white/85 px-3 text-xs text-[#1F2125]"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="settings-summary"
            className="block font-mono text-[10.5px] uppercase text-[#9AA0AA]"
          >
            Company summary
          </label>
          <textarea
            id="settings-summary"
            rows={3}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className="focus-ring mt-1 w-full rounded-xl border border-white/85 bg-white/85 p-3 text-xs text-[#1F2125]"
          />
        </div>

        <div>
          <label
            htmlFor="settings-context"
            className="block font-mono text-[10.5px] uppercase text-[#9AA0AA]"
          >
            Founder context & priorities
          </label>
          <textarea
            id="settings-context"
            rows={3}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            className="focus-ring mt-1 w-full rounded-xl border border-white/85 bg-white/85 p-3 text-xs text-[#1F2125]"
          />
        </div>
      </GlassCard>
    </form>
  );
}
