"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  Bot,
  Building2,
  Check,
  ChevronDown,
  ChevronsUpDown,
  FileSpreadsheet,
  FileText,
  Globe,
  HelpCircle,
  Layers,
  LayoutDashboard,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Radar,
  Search,
  Settings,
  Swords,
  Users,
  X,
} from "lucide-react";

import { getCrawlerOverview, getSignalsOverview } from "@/lib/api";
import type { Company, CompanyRecord, WorkflowStepState } from "@/lib/types";
import { extractDomain } from "@/lib/company-adapter";
import { FAST_TRANSITION } from "@/lib/motion";

function CompanyFavicon({ name, domain }: { name: string; domain: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const initial = (name || "S").trim().charAt(0).toUpperCase();

  if (!domain || imgFailed) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#1C1D21] text-xs font-semibold text-white">
        {initial}
      </span>
    );
  }

  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#1F2125]/10 bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
        alt=""
        width={20}
        height={20}
        className="h-5 w-5 object-contain"
        onError={() => setImgFailed(true)}
      />
    </span>
  );
}

function StepDot({ state }: { state: WorkflowStepState }) {
  if (state === "done") {
    return (
      <span
        className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#059669]/15 text-[#059669]"
        title="Completed"
      >
        <Check size={10} strokeWidth={2.5} aria-hidden="true" />
      </span>
    );
  }
  if (state === "current") {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center" title="Current step">
        <span className="h-2 w-2 animate-pulse rounded-full bg-[#4F46E5]" />
      </span>
    );
  }
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center text-[#9AA0AA]" title="Complete the previous step to unlock">
      <Lock size={11} strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

export function Sidebar({
  companyId,
  company,
  companies,
  mobileOpen,
  onCloseMobile,
  onOpenCommandPalette,
}: {
  companyId: number;
  company: CompanyRecord | null;
  companies: Company[];
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onOpenCommandPalette?: () => void;
}) {
  const pathname = usePathname();
  const reduced = Boolean(useReducedMotion());
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const base = `/company/${companyId}`;
  const isCrawlerRoute = pathname === `${base}/crawler`;
  const [crawlerOpen, setCrawlerOpen] = useState<boolean>(isCrawlerRoute);
  const [crawlerHash, setCrawlerHash] = useState<string>("");

  const crawlerOverviewQuery = useQuery({
    queryKey: ["crawler-overview", companyId, "7d"],
    queryFn: () => getCrawlerOverview(companyId, "7d"),
    enabled:
      Number.isFinite(companyId) &&
      companyId > 0 &&
      process.env.NEXT_PUBLIC_USE_MOCKS !== "true",
    staleTime: 30_000,
    retry: 0,
  });

  const runsCount = crawlerOverviewQuery.data?.runsCount ?? 0;
  const activeCrawlStatus = crawlerOverviewQuery.data?.activeRun?.status;
  const isCrawlActive = activeCrawlStatus === "running" || activeCrawlStatus === "queued";
  const isDashboardRoute = pathname === `${base}/dashboard`;

  const workflow = company?.workflowStatus ?? {
    company: "current",
    interview: "locked",
    sources: "locked",
    crawler: "locked",
    signals: "locked",
    briefs: "locked",
  };

  const signalsOverviewQuery = useQuery({
    queryKey: ["signals-overview", companyId, "30d"],
    queryFn: () => getSignalsOverview(companyId, "30d"),
    enabled:
      Number.isFinite(companyId) &&
      companyId > 0 &&
      workflow.signals !== "locked",
    staleTime: 30_000,
    retry: 0,
  });

  const unreviewedSignalsCount = signalsOverviewQuery.data?.countsByStatus?.new ?? 0;

  const workflowItems: {
    key: keyof typeof workflow;
    label: string;
    href: string;
    Icon: typeof Building2;
    active: boolean;
    state: WorkflowStepState;
    badgeCount?: number;
  }[] = [
    {
      key: "company",
      label: "Company",
      href: base,
      Icon: Building2,
      active: pathname === base,
      state: workflow.company,
    },
    {
      key: "interview",
      label: "Interview",
      href: `${base}/interview`,
      Icon: MessageSquare,
      active: pathname === `${base}/interview`,
      state: workflow.interview,
    },
    {
      key: "sources",
      label: "Signal Stack",
      href: `${base}/signal-stack`,
      Icon: Layers,
      active: pathname === `${base}/signal-stack` || pathname === `${base}/sources`,
      state: workflow.sources,
    },
    {
      key: "signals",
      label: "Signals",
      href: `${base}/signals`,
      Icon: Radar,
      active: pathname === `${base}/signals` || pathname === `${base}/intelligence`,
      state: workflow.signals,
      badgeCount: unreviewedSignalsCount,
    },
    {
      key: "briefs",
      label: "Briefs",
      href: `${base}/briefs`,
      Icon: FileText,
      active: pathname === `${base}/briefs` || pathname === `${base}/brief`,
      state: workflow.briefs,
    },
  ];

  const counts = company?.categoryCounts ?? {
    customers: 0,
    competitors: 0,
    market: 0,
    internal: 0,
  };

  const intelligenceItems = [
    {
      label: "Customers",
      href: `${base}/sources`,
      Icon: Users,
      color: "text-[#0D9488]",
      count: counts.customers,
    },
    {
      label: "Competitors",
      href: `${base}/competitors`,
      Icon: Swords,
      color: "text-[#EA580C]",
      count: counts.competitors,
    },
    {
      label: "Market",
      href: `${base}/signals?category=market`,
      Icon: Globe,
      color: "text-[#2563EB]",
      count: counts.market,
    },
    {
      label: "Internal",
      href: `${base}/automation`,
      Icon: FileSpreadsheet,
      color: "text-[#7C3AED]",
      count: counts.internal,
    },
  ];

  const crawlerChildren = [
    { key: "overview", label: "Overview", href: `${base}/crawler`, count: null as number | null },
    { key: "runs", label: "Runs", href: `${base}/crawler#runs`, count: runsCount },
    { key: "sources", label: "Sources", href: `${base}/signal-stack`, count: null as number | null },
    { key: "logs", label: "Logs", href: `${base}/crawler#logs`, count: null as number | null },
  ];

  const operationsBefore = [
    { label: "Internal Data", href: `${base}/automation`, Icon: FileSpreadsheet },
  ];
  const operationsAfter = [
    { label: "Automation", href: `${base}/automation`, Icon: Activity },
  ];

  const companyName = company?.name ?? `Company #${companyId}`;
  const companyDomain = company?.domain ?? "";

  const sidebarBody = (
    <div className="flex h-full flex-col justify-between gap-4 p-3">
      <div className="space-y-4">
        {/* Company Switcher */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setSwitcherOpen((prev) => !prev)}
            aria-expanded={switcherOpen}
            aria-label="Switch company workspace"
            className="focus-ring flex w-full items-center justify-between gap-2.5 rounded-2xl border border-white/80 bg-white/75 px-2.5 py-2 text-left shadow-[0_4px_14px_rgba(31,33,37,0.04)] transition-colors hover:bg-white md:justify-center xl:justify-between"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <CompanyFavicon name={companyName} domain={companyDomain} />
              <div className="min-w-0 md:hidden xl:block">
                <p className="truncate text-[13px] font-semibold text-[#1F2125]">{companyName}</p>
                <p className="truncate text-[11px] text-[#4B5058]">Signal Stack workspace</p>
              </div>
            </div>
            <ChevronsUpDown size={14} className="shrink-0 text-[#9AA0AA] md:hidden xl:block" />
          </button>

          {switcherOpen ? (
            <div className="glass-strong absolute left-0 right-0 top-full z-40 mt-2 space-y-1 rounded-2xl p-2">
              {companies.map((c) => (
                <Link
                  key={c.id}
                  href={`/company/${c.id}/dashboard`}
                  onClick={() => {
                    setSwitcherOpen(false);
                    onCloseMobile();
                  }}
                  className={`flex items-center gap-2 rounded-xl px-2.5 py-2 text-xs font-medium no-underline transition-colors ${
                    c.id === companyId
                      ? "bg-[#1C1D21] text-white"
                      : "text-[#1F2125] hover:bg-white/75"
                  }`}
                >
                  <span className="truncate flex-1">{c.name}</span>
                  <span className={`font-mono text-[10px] ${c.id === companyId ? "text-white/75" : "text-[#9AA0AA]"}`}>
                    {extractDomain(c.website)}
                  </span>
                </Link>
              ))}
              <Link
                href="/"
                onClick={() => {
                  setSwitcherOpen(false);
                  onCloseMobile();
                }}
                className="flex items-center gap-2 rounded-xl border-t border-[#1F2125]/8 px-2.5 py-2 text-xs font-medium text-[#4F46E5] no-underline hover:bg-white/75"
              >
                <Plus size={13} /> New company research
              </Link>
            </div>
          ) : null}
        </div>

        {/* Search button with ⌘K hint */}
        <div className="relative md:hidden xl:block">
          <button
            type="button"
            onClick={() => {
              onCloseMobile();
              onOpenCommandPalette?.();
            }}
            aria-label="Search workspace (shortcut Command K)"
            className="focus-ring flex h-9 w-full items-center justify-between rounded-xl border border-white/75 bg-white/55 px-3 text-left text-xs text-[#9AA0AA] transition-colors hover:bg-white/80 hover:text-[#4B5058]"
          >
            <span className="flex items-center gap-2">
              <Search size={14} strokeWidth={1.75} aria-hidden="true" />
              <span>Search workspace</span>
            </span>
            <kbd className="rounded-md border border-[#1F2125]/10 bg-white/80 px-1.5 py-0.5 font-mono text-[10px] text-[#4B5058]">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Primary home: Dashboard */}
        <div className="relative">
          {isDashboardRoute ? (
            <motion.span
              layoutId={reduced ? undefined : "sidebar-active-pill"}
              transition={FAST_TRANSITION}
              className="absolute inset-0 rounded-xl border border-white/80 bg-white shadow-[0_4px_14px_rgba(31,33,37,0.06)]"
            />
          ) : null}
          <Link
            href={`${base}/dashboard`}
            onClick={onCloseMobile}
            aria-current={isDashboardRoute ? "page" : undefined}
            title="Dashboard"
            className={`focus-ring relative z-10 flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-[13px] font-medium no-underline transition-colors md:justify-center xl:justify-between ${
              isDashboardRoute
                ? "text-[#1F2125]"
                : "text-[#4B5058] hover:bg-white/50 hover:text-[#1F2125]"
            }`}
          >
            <span className="flex items-center gap-2.5">
              <LayoutDashboard size={16} strokeWidth={1.75} aria-hidden="true" />
              <span className="md:hidden xl:inline">Dashboard</span>
            </span>
          </Link>
        </div>

        {/* Group: WORKFLOW */}
        <div>
          <p className="mb-1.5 px-2.5 font-mono text-[11px] uppercase tracking-wider text-[#9AA0AA] md:hidden xl:block">
            Workflow
          </p>
          <ul className="space-y-0.5">
            {workflowItems.map((item) => {
              const Icon = item.Icon;
              const isLocked = item.state === "locked" && !item.active;
              if (isLocked) {
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      disabled
                      aria-disabled="true"
                      title="Complete the previous workflow step to unlock"
                      className="flex w-full cursor-not-allowed items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-[13px] font-medium text-[#9AA0AA] opacity-75 md:justify-center xl:justify-between"
                    >
                      <span className="flex items-center gap-2.5">
                        <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                        <span className="md:hidden xl:inline">{item.label}</span>
                      </span>
                      <span className="md:hidden xl:inline-flex">
                        <StepDot state={item.state} />
                      </span>
                    </button>
                  </li>
                );
              }
              return (
                <li key={item.key} className="relative">
                  {item.active ? (
                    <motion.span
                      layoutId={reduced ? undefined : "sidebar-active-pill"}
                      transition={FAST_TRANSITION}
                      className="absolute inset-0 rounded-xl border border-white/80 bg-white shadow-[0_4px_14px_rgba(31,33,37,0.06)]"
                    />
                  ) : null}
                  <Link
                    href={item.href}
                    onClick={onCloseMobile}
                    aria-current={item.active ? "page" : undefined}
                    title={item.label}
                    className={`focus-ring relative z-10 flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-[13px] font-medium no-underline transition-colors md:justify-center xl:justify-between ${
                      item.active
                        ? "text-[#1F2125]"
                        : "text-[#4B5058] hover:bg-white/50 hover:text-[#1F2125]"
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                      <span className="md:hidden xl:inline">{item.label}</span>
                    </span>
                    <span className="md:hidden xl:inline-flex items-center gap-1.5">
                      {item.badgeCount && item.badgeCount > 0 ? (
                        <span className="tabular rounded-full bg-[#4F46E5]/10 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-[#4F46E5]">
                          {item.badgeCount}
                        </span>
                      ) : null}
                      <StepDot state={item.state} />
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Group: INTELLIGENCE */}
        <div>
          <p className="mb-1.5 px-2.5 font-mono text-[11px] uppercase tracking-wider text-[#9AA0AA] md:hidden xl:block">
            Intelligence
          </p>
          <ul className="space-y-0.5">
            {intelligenceItems.map((item) => {
              const Icon = item.Icon;
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    onClick={onCloseMobile}
                    title={item.label}
                    className="focus-ring flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-[13px] font-medium text-[#4B5058] no-underline transition-colors hover:bg-white/50 hover:text-[#1F2125] md:justify-center xl:justify-between"
                  >
                    <span className="flex items-center gap-2.5">
                      <Icon size={16} strokeWidth={1.75} className={item.color} aria-hidden="true" />
                      <span className="md:hidden xl:inline">{item.label}</span>
                    </span>
                    {item.count > 0 ? (
                      <span className="tabular rounded-full bg-white/80 px-2 py-0.5 font-mono text-[11px] text-[#4B5058] md:hidden xl:inline-flex">
                        {item.count}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Group: OPERATIONS */}
        <div>
          <p className="mb-1.5 px-2.5 font-mono text-[11px] uppercase tracking-wider text-[#9AA0AA] md:hidden xl:block">
            Operations
          </p>
          <ul className="space-y-0.5">
            {operationsBefore.map((item) => {
              const Icon = item.Icon;
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    onClick={onCloseMobile}
                    title={item.label}
                    className="focus-ring flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium text-[#4B5058] no-underline transition-colors hover:bg-white/50 hover:text-[#1F2125] md:justify-center xl:justify-start"
                  >
                    <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                    <span className="md:hidden xl:inline">{item.label}</span>
                  </Link>
                </li>
              );
            })}

            {/* Collapsible Crawler group */}
            <li>
              <div className="relative">
                {isCrawlerRoute && !crawlerOpen ? (
                  <motion.span
                    layoutId={reduced ? undefined : "sidebar-active-pill"}
                    transition={FAST_TRANSITION}
                    className="absolute inset-0 rounded-xl border border-white/80 bg-white shadow-[0_4px_14px_rgba(31,33,37,0.06)]"
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => setCrawlerOpen((prev) => !prev)}
                  aria-expanded={crawlerOpen}
                  title="Crawler"
                  className={`focus-ring relative z-10 flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-[13px] font-medium transition-colors md:justify-center xl:justify-between ${
                    isCrawlerRoute
                      ? "text-[#1F2125]"
                      : "text-[#4B5058] hover:bg-white/50 hover:text-[#1F2125]"
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <Bot size={16} strokeWidth={1.75} aria-hidden="true" />
                    <span className="md:hidden xl:inline">Crawler</span>
                    {isCrawlActive ? (
                      <span
                        className="h-2 w-2 animate-pulse rounded-full bg-[#4F46E5]"
                        title="Crawl running"
                      />
                    ) : null}
                  </span>
                  <ChevronDown
                    size={14}
                    className={`shrink-0 text-[#9AA0AA] transition-transform md:hidden xl:block ${
                      crawlerOpen ? "rotate-180" : ""
                    }`}
                    aria-hidden="true"
                  />
                </button>
              </div>

              {crawlerOpen ? (
                <ul className="mt-0.5 space-y-0.5 pl-6 md:hidden xl:block">
                  {crawlerChildren.map((child) => {
                    const isChildActive =
                      (child.key === "overview" && isCrawlerRoute && crawlerHash === "") ||
                      (child.key === "runs" && isCrawlerRoute && crawlerHash === "#runs") ||
                      (child.key === "logs" && isCrawlerRoute && crawlerHash === "#logs");
                    return (
                      <li key={child.key} className="relative">
                        {isChildActive ? (
                          <motion.span
                            layoutId={reduced ? undefined : "sidebar-crawler-pill"}
                            transition={FAST_TRANSITION}
                            className="absolute inset-0 rounded-xl border border-white/80 bg-white shadow-[0_4px_14px_rgba(31,33,37,0.06)]"
                          />
                        ) : null}
                        <Link
                          href={child.href}
                          onClick={() => {
                            const hashIdx = child.href.indexOf("#");
                            setCrawlerHash(hashIdx >= 0 ? child.href.slice(hashIdx) : "");
                            onCloseMobile();
                          }}
                          className={`focus-ring relative z-10 flex items-center justify-between gap-2 rounded-xl px-2.5 py-1.5 text-[12.5px] font-medium no-underline transition-colors ${
                            isChildActive
                              ? "text-[#1F2125]"
                              : "text-[#4B5058] hover:bg-white/50 hover:text-[#1F2125]"
                          }`}
                        >
                          <span>{child.label}</span>
                          {child.count !== null && child.count > 0 ? (
                            <span className="tabular rounded-full bg-[#EEF2FF] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#4F46E5]">
                              {child.count}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>

            {operationsAfter.map((item) => {
              const Icon = item.Icon;
              return (
                <li key={item.label}>
                  <Link
                    href={item.href}
                    onClick={onCloseMobile}
                    title={item.label}
                    className="focus-ring flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[13px] font-medium text-[#4B5058] no-underline transition-colors hover:bg-white/50 hover:text-[#1F2125] md:justify-center xl:justify-start"
                  >
                    <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
                    <span className="md:hidden xl:inline">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      {/* Bottom utilities + User block */}
      <div className="space-y-2 border-t border-white/70 pt-3">
        <div className="space-y-0.5">
          <Link
            href={`${base}/automation`}
            onClick={onCloseMobile}
            title="Settings"
            className="focus-ring flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-xs font-medium text-[#4B5058] no-underline hover:bg-white/50 hover:text-[#1F2125] md:justify-center xl:justify-start"
          >
            <Settings size={15} strokeWidth={1.75} aria-hidden="true" />
            <span className="md:hidden xl:inline">Settings</span>
          </Link>
          <Link
            href="/sample-brief"
            onClick={onCloseMobile}
            title="Help"
            className="focus-ring flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-xs font-medium text-[#4B5058] no-underline hover:bg-white/50 hover:text-[#1F2125] md:justify-center xl:justify-start"
          >
            <HelpCircle size={15} strokeWidth={1.75} aria-hidden="true" />
            <span className="md:hidden xl:inline">Help</span>
          </Link>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-2xl border border-white/75 bg-white/60 px-2.5 py-2 md:justify-center xl:justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#4F46E5]/15 text-xs font-semibold text-[#4F46E5]">
              F
            </span>
            <div className="min-w-0 md:hidden xl:block">
              <p className="truncate text-xs font-semibold text-[#1F2125]">Founder</p>
              <p className="truncate text-[11px] text-[#4B5058]">Workspace owner</p>
            </div>
          </div>
          <MoreHorizontal size={15} className="shrink-0 text-[#9AA0AA] md:hidden xl:block" aria-hidden="true" />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop & tablet sticky sidebar */}
      <aside
        aria-label="Workspace navigation"
        className="glass-strong sticky top-0 hidden h-screen shrink-0 overflow-y-auto border-r border-white/70 md:block md:w-[72px] xl:w-[260px]"
      >
        {sidebarBody}
      </aside>

      {/* Mobile slide-over drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div
            className="fixed inset-0 bg-[#1F2125]/25 backdrop-blur-sm"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside
            aria-label="Mobile workspace navigation"
            className="glass-strong relative z-10 flex h-full w-[268px] flex-col overflow-y-auto border-r border-white/80"
          >
            <div className="flex items-center justify-between border-b border-white/60 px-4 py-3">
              <span className="text-xs font-semibold text-[#1F2125]">Signal Stack</span>
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close navigation menu"
                className="focus-ring rounded-lg p-1 text-[#4B5058] hover:bg-white"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1">{sidebarBody}</div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
