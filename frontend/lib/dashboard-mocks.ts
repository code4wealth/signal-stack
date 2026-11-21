import type {
  CollectedItem,
  DashboardData,
  DashboardRange,
  SignalItem,
  SourceCategory,
  WorkspaceSearchResponse,
} from "@/lib/types";

const MOCK_EV_1: CollectedItem = {
  id: 9101,
  sourceId: 201,
  sourceName: "Rival Changelog",
  domain: "rival.example",
  category: "competitors",
  title: "Rival lowers Enterprise annual pricing by 20%",
  url: "https://rival.example/changelog/pricing",
  publishedAt: new Date(Date.now() - 86_400_000).toISOString(),
  publishedAtMethod: "metadata",
  fetchedAt: new Date(Date.now() - 36_000_000).toISOString(),
  change: "changed",
  contentHash: "dashmock9101",
  excerpt: "Enterprise plans drop from $250/seat to $200/seat for 25+ seats starting Dec 1.",
};

const MOCK_EV_2: CollectedItem = {
  id: 9102,
  sourceId: 202,
  sourceName: "Customer Forum",
  domain: "forum.example",
  category: "customers",
  title: "NetSuite webhook sync requested by 6 buyers",
  url: "https://forum.example/t/netsuite-sync",
  publishedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  publishedAtMethod: "rss",
  fetchedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  change: "new",
  contentHash: "dashmock9102",
  excerpt: "Six mid-market ops teams requested native NetSuite webhook sync before renewal.",
};

const MOCK_EV_3: CollectedItem = {
  id: 9103,
  sourceId: 203,
  sourceName: "Industry Weekly",
  domain: "market.example",
  category: "market",
  title: "EU e-invoicing mandate timeline moves up to Q2",
  url: "https://market.example/eu-einvoicing",
  publishedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  publishedAtMethod: "metadata",
  fetchedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
  change: "new",
  contentHash: "dashmock9103",
  excerpt: "Compliance auditors must verify structured XML invoices starting next Q2.",
};

const MOCK_TOP_HEADLINE = "Rival cuts Enterprise pricing by 20% for 25+ seat accounts";

const MOCK_SIGS: SignalItem[] = [
  {
    id: 9101,
    companyId: 1,
    category: "competitors",
    classification: "threat",
    headline: MOCK_TOP_HEADLINE,
    evidenceSummary: MOCK_EV_1.excerpt ?? "",
    whyItMatters: "Pressures upcoming mid-market renewal quotes.",
    potentialImpact: "High business impact (86/100)",
    impactLevel: "high",
    recommendedAction: {
      text: "Review active 25+ seat renewal quotes and prepare value-tier counter-offer.",
      effort: "low",
      timeframe: "This week",
    },
    priority: 5,
    priorityValue: 88,
    priorityReasons: [{ label: "Impact", weight: 88 }],
    confidence: "high",
    evidenceIds: ["9101"],
    itemIds: ["9101"],
    sourceDomains: ["rival.example"],
    assumptionRefs: [],
    publishedAt: MOCK_EV_1.publishedAt,
    detectedAt: MOCK_EV_1.fetchedAt,
    status: "new",
    verified: true,
    sourceName: "Rival Changelog",
    sourceId: 201,
    isMock: true,
  },
  {
    id: 9102,
    companyId: 1,
    category: "customers",
    classification: "opportunity",
    headline: "Mid-market buyers requesting native NetSuite webhook sync",
    evidenceSummary: MOCK_EV_2.excerpt ?? "",
    whyItMatters: "Unlocks expansion conversions across finance-ops accounts.",
    potentialImpact: "High business impact (76/100)",
    impactLevel: "high",
    recommendedAction: {
      text: "Scope NetSuite webhook pilot with top 3 requesting buyers.",
      effort: "medium",
      timeframe: "This week",
    },
    priority: 4,
    priorityValue: 78,
    priorityReasons: [{ label: "Relevance", weight: 82 }],
    confidence: "high",
    evidenceIds: ["9102"],
    itemIds: ["9102"],
    sourceDomains: ["forum.example"],
    assumptionRefs: [],
    publishedAt: MOCK_EV_2.publishedAt,
    detectedAt: MOCK_EV_2.fetchedAt,
    status: "new",
    verified: true,
    sourceName: "Customer Forum",
    sourceId: 202,
    isMock: true,
  },
  {
    id: 9103,
    companyId: 1,
    category: "market",
    classification: "opportunity",
    headline: "EU e-invoicing compliance mandate accelerates to Q2",
    evidenceSummary: MOCK_EV_3.excerpt ?? "",
    whyItMatters: "Creates urgent demand for automated invoice validation.",
    potentialImpact: "Medium business impact (68/100)",
    impactLevel: "medium",
    recommendedAction: {
      text: "Publish a Q2 readiness checklist for European enterprise leads.",
      effort: "low",
      timeframe: "This week",
    },
    priority: 4,
    priorityValue: 71,
    priorityReasons: [{ label: "Urgency", weight: 74 }],
    confidence: "medium",
    evidenceIds: ["9103"],
    itemIds: ["9103"],
    sourceDomains: ["market.example"],
    assumptionRefs: [],
    publishedAt: MOCK_EV_3.publishedAt,
    detectedAt: MOCK_EV_3.fetchedAt,
    status: "saved",
    verified: true,
    sourceName: "Industry Weekly",
    sourceId: 203,
    isMock: true,
  },
];

export function mockDashboardData(
  range: DashboardRange,
  category?: SourceCategory | null,
): DashboardData {
  const filtered = category
    ? MOCK_SIGS.filter((s) => s.category === category)
    : MOCK_SIGS;

  const days = range === "week" ? 7 : range === "quarter" ? 90 : 30;
  const trend = Array.from({ length: Math.min(days, 30) }).map((_, idx, arr) => {
    const dt = new Date(Date.now() - (arr.length - 1 - idx) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    return {
      date: dt,
      evidence: idx % 3 === 0 ? 2 : 1,
      signals: idx >= arr.length - 3 ? 1 : 0,
      topHeadline: idx === arr.length - 1 ? MOCK_TOP_HEADLINE : null,
    };
  });

  const heatmap = [];
  for (let b = 0; b < 8; b++) {
    for (let d = 0; d < 7; d++) {
      const count = d === 2 && b === 3 ? 4 : d === 4 && b === 5 ? 2 : (d + b) % 5 === 0 ? 1 : 0;
      heatmap.push({
        day: d as 0 | 1 | 2 | 3 | 4 | 5 | 6,
        bucket: b as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
        count,
      });
    }
  }

  return {
    range,
    category: category ?? null,
    user: { firstName: "Founder" },
    lastVisitAt: new Date(Date.now() - 86_400_000).toISOString(),
    workflowStatus: {
      company: "done",
      interview: "done",
      sources: "done",
      crawler: "done",
      signals: "done",
      briefs: "done",
    },
    topPriorities: filtered.slice(0, 3),
    recentSignals: filtered,
    evidenceById: {
      "9101": MOCK_EV_1,
      "9102": MOCK_EV_2,
      "9103": MOCK_EV_3,
    },
    brief: {
      nextRunAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
      lastGeneratedAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
      latestBriefId: "1",
    },
    kpis: [
      {
        category: "customers",
        newSignals: 1,
        opportunities: 1,
        threats: 0,
        deltaPct: 20,
        spark: [0, 1, 0, 0, 1, 0, 1],
      },
      {
        category: "competitors",
        newSignals: 1,
        opportunities: 0,
        threats: 1,
        deltaPct: 10,
        spark: [0, 0, 1, 0, 0, 1, 1],
      },
      {
        category: "market",
        newSignals: 1,
        opportunities: 1,
        threats: 0,
        deltaPct: null,
        spark: [0, 0, 0, 1, 0, 0, 1],
      },
      {
        category: "internal",
        newSignals: 0,
        opportunities: 0,
        threats: 0,
        deltaPct: null,
        spark: [0, 0, 0, 0, 0, 0, 0],
        filesAnalysed: 0,
      },
    ],
    heatmap,
    heatmapMax: 4,
    heatmapInsight: "Busiest publishing window: Tue 09:00–12:00 UTC (4 items)",
    trend,
    mix: {
      opportunity: filtered.filter((s) => s.classification === "opportunity").length,
      threat: filtered.filter((s) => s.classification === "threat").length,
      neutral: filtered.filter((s) => s.classification === "neutral").length,
    },
    jobs: [
      {
        id: "weekly_brief",
        name: "Weekly Monday Brief",
        enabled: true,
        nextRunAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        lastRun: { status: "ok", finishedAt: new Date(Date.now() - 5 * 86_400_000).toISOString() },
      },
      {
        id: "monthly_audit",
        name: "Monthly Source Audit",
        enabled: true,
        nextRunAt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
        lastRun: null,
      },
    ],
    health: { healthyPct: 100, failing: 0, stale: 0 },
    sourcePerformance: (
      [
        {
          sourceId: 201,
          name: "Rival Changelog",
          domain: "rival.example",
          category: "competitors" as const,
          type: "changelog",
          yieldPct: 75,
          items: 4,
          signals: 3,
          lastCheckedAt: new Date(Date.now() - 3_600_000).toISOString(),
          status: "approved",
          health: "ok",
        },
        {
          sourceId: 202,
          name: "Customer Forum",
          domain: "forum.example",
          category: "customers" as const,
          type: "forum",
          yieldPct: 60,
          items: 5,
          signals: 3,
          lastCheckedAt: new Date(Date.now() - 7_200_000).toISOString(),
          status: "approved",
          health: "ok",
        },
      ] satisfies import("@/lib/types").DashboardSourcePerf[]
    ).filter((row) => !category || row.category === category),
    totalSignalsInRange: filtered.length,
    lastUpdatedAt: new Date().toISOString(),
    activeCrawlRunning: false,
    activeAnalysisRunning: false,
    suggestedQuestions: [
      "Which threats should we prioritize this week?",
      "Where are our strongest growth opportunities?",
    ],
    isMock: true,
  };
}

export function mockWorkspaceSearch(q: string): WorkspaceSearchResponse {
  const needle = q.trim().toLowerCase();
  if (!needle) return { signals: [], sources: [] };
  return {
    signals: MOCK_SIGS.filter((s) => s.headline.toLowerCase().includes(needle)),
    sources: [],
  };
}
