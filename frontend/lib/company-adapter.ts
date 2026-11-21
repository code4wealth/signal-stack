import type {
  CompanyDetailApi,
  CompanyRecord,
  CompetitorItem,
  ConfidenceLevel,
  Evidence,
  Fact,
  LogEntry,
  SegmentItem,
  ServiceItem,
} from "@/lib/types";

export function extractDomain(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] || url;
  }
}

export function formatDomainPath(url: string): string {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    const host = parsed.hostname.replace(/^www\./, "");
    const path = parsed.pathname === "/" ? "" : parsed.pathname.replace(/\/$/, "");
    return `${host}${path}`;
  } catch {
    return url;
  }
}

export function formatRelativeTime(iso: string | null | undefined): string {
  if (!iso) return "not yet";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000);
  if (diffSec < 45) return "just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.round(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function splitFactText(text: string): { title: string; body: string } {
  const colonIdx = text.indexOf(":");
  if (colonIdx > 2 && colonIdx < 48) {
    return {
      title: text.slice(0, colonIdx).trim(),
      body: text.slice(colonIdx + 1).trim(),
    };
  }
  const dashIdx = text.indexOf(" — ");
  if (dashIdx > 2 && dashIdx < 48) {
    return {
      title: text.slice(0, dashIdx).trim(),
      body: text.slice(dashIdx + 3).trim(),
    };
  }
  const words = text.split(/\s+/);
  if (words.length <= 5) return { title: text, body: "" };
  return {
    title: words.slice(0, 4).join(" "),
    body: text,
  };
}

function computeConfidence(
  pagesCount: number,
  verifiedRatio: number,
  unverifiedCount: number,
): ConfidenceLevel {
  if (pagesCount >= 3 && verifiedRatio >= 0.7 && unverifiedCount <= 3) return "high";
  if (pagesCount >= 1 && verifiedRatio >= 0.4) return "medium";
  return "low";
}

function parseJobLogTitle(job: string, detail: string): { title: string; summary: string; kind: LogEntry["kind"] } {
  if (job === "profile_confirm") {
    return { title: "Founder confirmed company profile", summary: detail, kind: "confirm" };
  }
  if (job === "job:research") {
    try {
      const parsed = JSON.parse(detail) as {
        error?: string;
        result?: { pages_fetched?: string[]; unverified_count?: number };
      };
      if (parsed.error) {
        return { title: "Research run failed", summary: parsed.error, kind: "job" };
      }
      if (parsed.result) {
        const count = parsed.result.pages_fetched?.length ?? 0;
        const unv = parsed.result.unverified_count ?? 0;
        return {
          title: `Completed website research (${count} pages)`,
          summary: `${unv} unverified hypothesis item(s) separated`,
          kind: "extract",
        };
      }
    } catch {
      /* raw detail */
    }
    return { title: "Company website research", summary: detail, kind: "job" };
  }
  return { title: job.replace(/^job:/, "").replace(/_/g, " "), summary: detail, kind: "job" };
}

export function adaptCompanyDetail(raw: CompanyDetailApi): CompanyRecord {
  const profile = raw.profile;
  const meta = profile?._meta;
  const researchedAt = meta?.updated_at || meta?.researched_at || raw.created;
  const pagesFetched = meta?.pages_fetched ?? [];

  const evidenceMap = new Map<string, Evidence>();

  const registerEvidence = (url: string, usedFor: string, verified: boolean): string => {
    const clean = url.trim();
    const existing = evidenceMap.get(clean);
    if (existing) {
      if (!existing.usedFor.includes(usedFor)) {
        existing.usedFor = `${existing.usedFor}, ${usedFor}`;
      }
      return existing.id;
    }
    const id = `ev-${evidenceMap.size + 1}`;
    evidenceMap.set(clean, {
      id,
      url: clean,
      title: formatDomainPath(clean),
      type: clean.startsWith("internal://") ? "user-provided" : "webpage",
      usedFor,
      fetchedAt: researchedAt,
      verified,
    });
    return id;
  };

  for (const pageUrl of pagesFetched) {
    registerEvidence(pageUrl, "Company profile", true);
  }

  const services: ServiceItem[] = (profile?.products ?? []).map((fact: Fact, idx: number) => {
    const { title, body } = splitFactText(fact.text);
    const evId = fact.evidence_url ? registerEvidence(fact.evidence_url, "Services", fact.verified) : "";
    return {
      id: `svc-${idx}`,
      name: title,
      description: body || fact.text,
      evidenceIds: evId ? [evId] : [],
      verified: fact.verified,
    };
  });

  const customerSegments: SegmentItem[] = (profile?.customers ?? []).map((fact: Fact, idx: number) => {
    const { title, body } = splitFactText(fact.text);
    const evId = fact.evidence_url ? registerEvidence(fact.evidence_url, "Customers", fact.verified) : "";
    return {
      id: `seg-${idx}`,
      name: title,
      rationale: body || fact.text,
      evidenceIds: evId ? [evId] : [],
      verified: fact.verified,
    };
  });

  const decisions = profile?.competitor_decisions ?? {};
  const competitors: CompetitorItem[] = (profile?.likely_competitors ?? []).map((hint, idx) => {
    const fallbackEvidenceUrl = pagesFetched[0] || raw.website;
    const evId = fallbackEvidenceUrl ? registerEvidence(fallbackEvidenceUrl, "Competitor hint", true) : "";
    return {
      id: `comp-${idx}-${extractDomain(hint.website)}`,
      name: hint.name,
      website: hint.website,
      domain: extractDomain(hint.website),
      reason: hint.reason || "Identified from company positioning on public site",
      evidenceIds: evId ? [evId] : [],
      confidence: hint.reason ? "medium" : "low",
      decision: decisions[hint.website] ?? "review",
    };
  });

  const totalFacts =
    (profile?.products?.length ?? 0) +
    (profile?.customers?.length ?? 0) +
    (profile?.geography?.length ?? 0) +
    (profile?.differentiators?.length ?? 0);
  const verifiedFacts =
    (profile?.products?.filter((f) => f.verified).length ?? 0) +
    (profile?.customers?.filter((f) => f.verified).length ?? 0) +
    (profile?.geography?.filter((f) => f.verified).length ?? 0) +
    (profile?.differentiators?.filter((f) => f.verified).length ?? 0);
  const verifiedRatio = totalFacts > 0 ? verifiedFacts / totalFacts : pagesFetched.length > 0 ? 0.6 : 0;

  const researchLog: LogEntry[] = [];
  for (const jobRow of raw.research_logs ?? []) {
    const parsed = parseJobLogTitle(jobRow.job, jobRow.detail);
    researchLog.push({
      id: `job-${jobRow.id}`,
      title: parsed.title,
      detail: parsed.summary,
      at: jobRow.at,
      status: jobRow.status === "error" ? "error" : jobRow.status === "running" ? "running" : "ok",
      kind: parsed.kind,
    });
  }
  for (const [idx, pageUrl] of pagesFetched.entries()) {
    researchLog.push({
      id: `page-${idx}`,
      title: idx === 0 ? "Fetched homepage" : `Read ${new URL(pageUrl).pathname || "/"}`,
      detail: pageUrl,
      at: researchedAt,
      status: "ok",
      kind: "fetch",
    });
  }
  if (services.length > 0) {
    researchLog.push({
      id: "extract-services",
      title: `Identified ${services.length} service${services.length === 1 ? "" : "s"}`,
      detail: `${services.filter((s) => s.verified).length} verified from fetched pages`,
      at: researchedAt,
      status: "ok",
      kind: "extract",
    });
  }
  if (competitors.length > 0) {
    researchLog.push({
      id: "extract-competitors",
      title: `Discovered ${competitors.length} competitor candidate${competitors.length === 1 ? "" : "s"}`,
      detail: "Pending founder Keep / Remove review",
      at: researchedAt,
      status: "info",
      kind: "competitors",
    });
  }

  const servicesPct =
    services.length > 0
      ? Math.round((services.filter((s) => s.verified).length / services.length) * 100)
      : 0;
  const customersPct =
    customerSegments.length > 0
      ? Math.round((customerSegments.filter((s) => s.verified).length / customerSegments.length) * 100)
      : 0;
  const competitorsPct =
    competitors.length > 0
      ? Math.round(
          (competitors.filter((c) => c.decision === "keep" || c.confidence !== "low").length /
            competitors.length) *
            100,
        )
      : 0;

  return {
    id: raw.id,
    name: raw.name,
    website: raw.website,
    domain: extractDomain(raw.website),
    context: raw.context || "",
    created: raw.created,
    industry: profile?.industry || null,
    businessModel: profile?.business_model || null,
    valueProposition: profile?.value_proposition || null,
    positioning: profile?.positioning || null,
    headquarters: profile?.headquarters || null,
    founded: profile?.founded || null,
    size: profile?.company_size || null,
    primaryRegion: profile?.primary_region || null,
    primaryLanguage: profile?.primary_language || null,
    summary: profile?.summary || "",
    summaryUpdatedAt: researchedAt,
    confirmedAt: meta?.confirmed_at || null,
    services,
    customerSegments,
    competitors,
    evidence: Array.from(evidenceMap.values()),
    researchLog,
    unverified: profile?.unverified ?? [],
    pagesFetchedCount: pagesFetched.length,
    confidence: computeConfidence(pagesFetched.length, verifiedRatio, profile?.unverified?.length ?? 0),
    confidenceBreakdown: {
      services: servicesPct,
      customers: customersPct,
      competitors: competitorsPct,
    },
    researchStatus: raw.research_status ?? (profile ? "ready" : "queued"),
    researchJobId: raw.research_job_id ?? null,
    researchError: raw.research_error ?? null,
    workflowStatus: raw.workflow_status ?? {
      company: meta?.confirmed_at ? "done" : "current",
      interview: profile ? "current" : "locked",
      sources: "locked",
      signals: "locked",
      briefs: "locked",
    },
    categoryCounts: raw.category_counts ?? {
      customers: 0,
      competitors: 0,
      market: 0,
      internal: 0,
    },
  };
}

export function buildDevMockCompany(id: number): CompanyRecord {
  const now = new Date().toISOString();
  return {
    id,
    name: "MOCK DATA — Demo Workspace",
    website: "https://example.com",
    domain: "example.com",
    context: "Dev-only preview enabled via NEXT_PUBLIC_USE_MOCKS=true",
    created: now,
    industry: "B2B SaaS (MOCK)",
    businessModel: "Subscription",
    valueProposition: "Evidence-backed operations",
    positioning: "Workflow automation",
    headquarters: "Bengaluru, India",
    founded: "2022",
    size: "11-50",
    primaryRegion: "India",
    primaryLanguage: "English",
    summary:
      "MOCK DATA — Demo Workspace is shown because NEXT_PUBLIC_USE_MOCKS=true is enabled. Disable NEXT_PUBLIC_USE_MOCKS to inspect live backend records.",
    summaryUpdatedAt: now,
    confirmedAt: null,
    services: [
      {
        id: "mock-svc-1",
        name: "Signal Monitoring",
        description: "MOCK DATA — Example service card.",
        evidenceIds: ["ev-1"],
        verified: true,
      },
    ],
    customerSegments: [
      {
        id: "mock-seg-1",
        name: "B2B Founders",
        rationale: "MOCK DATA — Example customer segment.",
        evidenceIds: ["ev-1"],
        verified: true,
      },
    ],
    competitors: [
      {
        id: "mock-comp-1",
        name: "Sample Rival",
        website: "https://example.org",
        domain: "example.org",
        reason: "MOCK DATA — Placeholder rival.",
        evidenceIds: ["ev-1"],
        confidence: "low",
        decision: "review",
      },
    ],
    evidence: [
      {
        id: "ev-1",
        url: "https://example.com/about",
        title: "example.com/about",
        type: "webpage",
        usedFor: "Summary, Services, Customers",
        fetchedAt: now,
        verified: true,
      },
    ],
    researchLog: [
      {
        id: "mock-log-1",
        title: "MOCK DATA — Preview active",
        detail: "Set NEXT_PUBLIC_USE_MOCKS=false for live API data",
        at: now,
        status: "info",
        kind: "job",
      },
    ],
    unverified: [],
    pagesFetchedCount: 1,
    confidence: "low",
    confidenceBreakdown: { services: 100, customers: 100, competitors: 50 },
    researchStatus: "ready",
    researchJobId: null,
    researchError: null,
    workflowStatus: {
      company: "current",
      interview: "current",
      sources: "locked",
      signals: "locked",
      briefs: "locked",
    },
    categoryCounts: { customers: 0, competitors: 0, market: 0, internal: 0 },
    isMock: true,
  };
}

export function buildDevMockInterview(companyId: number): import("@/lib/types").Interview {
  const now = new Date().toISOString();
  return {
    id: companyId,
    companyId,
    status: "in_progress",
    totalQuestions: 10,
    currentIndex: 1,
    model: "MOCK MODEL",
    turns: [
      {
        id: 1,
        index: 0,
        question: "MOCK DATA — Which customer segment closes fastest for you today?",
        topic: "Customers",
        whyAsking: "Your public site highlights two distinct buyer personas.",
        evidenceIds: ["https://example.com/about"],
        suggestedAnswers: [
          "Mid-market operations teams (50–250 employees) close in under 3 weeks.",
          "Self-serve teams convert on the starter tier before upgrading.",
        ],
        answer: {
          text: "Mid-market operations teams close fastest because they already track competitors manually.",
          skipped: false,
          answeredAt: now,
        },
      },
      {
        id: 2,
        index: 1,
        question: "MOCK DATA — What is the main bottleneck slowing down pipeline growth this quarter?",
        topic: "Growth",
        whyAsking: "Public pages show heavy outbound positioning without self-serve pricing.",
        evidenceIds: ["https://example.com/about"],
        suggestedAnswers: [
          "Long security and procurement reviews on enterprise deals.",
          "Outbound reply rates in new verticals outside our core ICP.",
        ],
      },
    ],
    learned: [
      {
        id: "mock-learned-1",
        topic: "Customers",
        text: "Mid-market operations teams close fastest because they already track competitors manually.",
        sourceTurnIndex: 0,
      },
    ],
  };
}

export function buildDevMockSignalStack(companyId: number): import("@/lib/types").SignalStack {
  const now = new Date().toISOString();
  return {
    recommendedThreshold: 60,
    discoveryStatus: "ready",
    discoveryStage: null,
    discoveryError: null,
    maxUploadBytes: 2 * 1024 * 1024,
    allowedExtensions: [".txt", ".csv", ".xlsx", ".pdf"],
    confirmedAt: null,
    isMock: true,
    counts: {
      customers: 1,
      competitors: 1,
      market: 1,
      internal: 0,
      approved: 1,
      needs_review: 2,
      rejected: 0,
      failing: 0,
      blocked: 0,
    },
    internalFiles: [],
    auditProposals: [],
    sources: [
      {
        id: 101,
        companyId,
        name: "MOCK DATA — Industry Forum",
        url: "https://example.com/community",
        domain: "example.com",
        category: "customers",
        type: "Forum",
        crawlMethod: "rss",
        language: "English",
        status: "needs_review",
        relevanceScore: 84,
        scoreReasons: [
          { label: "Matches customer buyer discussions", weight: 45 },
          { label: "Active RSS feed", weight: 39 },
        ],
        whyRecommended: "MOCK DATA — Example customer discussion board for UI preview.",
        evidenceIds: ["https://example.com/about"],
        discoveryConfidence: "high",
        frequency: "daily",
        lastCheckedAt: now,
        robotsAllowed: true,
        subSources: [{ name: "RSS Feed", url: "https://example.com/feed.xml" }],
        isCustom: false,
      },
      {
        id: 102,
        companyId,
        name: "MOCK DATA — Sample Rival Changelog",
        url: "https://example.org/changelog",
        domain: "example.org",
        category: "competitors",
        type: "Competitor site",
        crawlMethod: "html",
        language: "English",
        status: "approved",
        relevanceScore: 91,
        scoreReasons: [{ label: "Confirmed competitor from Company Profile", weight: 91 }],
        whyRecommended: "MOCK DATA — Tracks product updates from a confirmed competitor.",
        evidenceIds: ["https://example.org"],
        discoveryConfidence: "high",
        frequency: "daily",
        lastCheckedAt: now,
        robotsAllowed: true,
        isCustom: false,
      },
      {
        id: 103,
        companyId,
        name: "MOCK DATA — Market Standards Body",
        url: "https://example.net/updates",
        domain: "example.net",
        category: "market",
        type: "Government",
        crawlMethod: "sitemap",
        language: "English",
        status: "needs_review",
        relevanceScore: 72,
        whyRecommended: "MOCK DATA — Publishes regulatory guidance for your sector.",
        evidenceIds: ["https://example.net"],
        discoveryConfidence: "medium",
        frequency: "weekly",
        lastCheckedAt: null,
        robotsAllowed: true,
        isCustom: false,
      },
    ],
  };
}

export function formatDurationMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const mins = Math.floor(sec / 60);
  const rem = Math.round(sec % 60);
  return `${mins}m ${rem}s`;
}

export function buildDevMockCrawlerOverview(
  companyId: number,
  range: import("@/lib/types").CrawlRange = "7d",
): import("@/lib/types").CrawlerOverview {
  const days = range === "90d" ? 90 : range === "30d" ? 30 : 7;
  const now = Date.now();
  const daily = Array.from({ length: days }).map((_, idx) => {
    const d = new Date(now - (days - 1 - idx) * 86400_000).toISOString().slice(0, 10);
    return {
      date: d,
      new: idx % 2 === 0 ? 4 : 2,
      changed: idx % 3 === 0 ? 1 : 0,
      failed: idx === days - 2 ? 1 : 0,
      sourcesChecked: 4,
    };
  });
  const sampleRun: import("@/lib/types").CrawlRun = {
    id: 901,
    companyId,
    trigger: "manual",
    status: "completed",
    startedAt: new Date(now - 3600_000).toISOString(),
    finishedAt: new Date(now - 3580_000).toISOString(),
    durationMs: 18400,
    sourcesTotal: 4,
    sourcesDone: 4,
    counts: { new: 6, changed: 2, unchanged: 4, failed: 0, blocked: 1 },
    perSource: [
      {
        sourceId: 101,
        sourceName: "MOCK DATA — Industry Forum",
        domain: "example.com",
        category: "customers",
        status: "success",
        httpStatus: 200,
        itemsNew: 3,
        itemsChanged: 1,
        durationMs: 4120,
      },
      {
        sourceId: 102,
        sourceName: "MOCK DATA — Sample Rival Changelog",
        domain: "example.org",
        category: "competitors",
        status: "success",
        httpStatus: 200,
        itemsNew: 2,
        itemsChanged: 1,
        durationMs: 5200,
      },
      {
        sourceId: 103,
        sourceName: "MOCK DATA — Market Standards Body",
        domain: "example.net",
        category: "market",
        status: "not_modified",
        httpStatus: 304,
        itemsNew: 0,
        itemsChanged: 0,
        durationMs: 1950,
      },
    ],
  };

  return {
    range,
    totals: {
      new: daily.reduce((s, d) => s + d.new, 0),
      changed: daily.reduce((s, d) => s + d.changed, 0),
      failed: daily.reduce((s, d) => s + d.failed, 0),
      deltaPct: { new: 14.2, changed: 8.5, failed: -25.0 },
    },
    daily,
    activeRun: null,
    lastRun: sampleRun,
    recentRuns: [sampleRun],
    runsCount: 1,
    nextRunAt: null,
    budget: { pagesUsed: 16, pagesLimit: 40, period: "run" },
    etiquette: {
      respectsRobots: true,
      delaySeconds: 1.0,
      userAgent: "SignalStack/0.1 (MOCK)",
      blockedByRobots: 1,
    },
    health: { healthyPct: 92, failing: 0, stale: 0, windowCrawls: 5 },
    coverage: [
      { category: "customers", approved: 2, checked: 2, newItems: 3 },
      { category: "competitors", approved: 1, checked: 1, newItems: 2 },
      { category: "market", approved: 1, checked: 1, newItems: 1 },
      { category: "internal", approved: 0, checked: 0, newItems: 0 },
    ],
    allTimeCoverage: [
      { category: "customers", approved: 2, checked: 2, newItems: 11 },
      { category: "competitors", approved: 1, checked: 1, newItems: 7 },
      { category: "market", approved: 1, checked: 1, newItems: 4 },
      { category: "internal", approved: 0, checked: 0, newItems: 0 },
    ],
    quickRecheck: [
      {
        sourceId: "101",
        name: "MOCK DATA — Industry Forum",
        domain: "example.com",
        lastCheckedAt: new Date(now - 3600_000).toISOString(),
        status: "ok",
      },
      {
        sourceId: "102",
        name: "MOCK DATA — Sample Rival Changelog",
        domain: "example.org",
        lastCheckedAt: new Date(now - 7200_000).toISOString(),
        status: "ok",
      },
    ],
    isMock: true,
  };
}

