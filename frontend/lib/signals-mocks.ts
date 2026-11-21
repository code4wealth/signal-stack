import type {
  AskSignalsResponse,
  CollectedItem,
  SignalDetailResponse,
  SignalItem,
  SignalPatchPayload,
  SignalRange,
  SignalsListFilters,
  SignalsListResponse,
  SignalsOverviewResponse,
} from "@/lib/types";

const EV_1: CollectedItem = {
  id: 9001,
  sourceId: 101,
  sourceName: "Rival Changelog",
  domain: "rival.example",
  category: "competitors",
  title: "Rival lowers Enterprise tier pricing by 20%",
  url: "https://rival.example/changelog/pricing-update",
  publishedAt: new Date(Date.now() - 86_400_000).toISOString(),
  publishedAtMethod: "metadata",
  fetchedAt: new Date(Date.now() - 43_200_000).toISOString(),
  change: "changed",
  contentHash: "mockhash9001abcdef",
  excerpt:
    "Starting this quarter, Enterprise plans move from $250/seat to $200/seat for teams above 25 seats.",
  diff: {
    before: "Enterprise tier priced at $250/seat billed annually.",
    after: "Enterprise tier priced at $200/seat billed annually (20% reduction).",
  },
};

const EV_2: CollectedItem = {
  id: 9002,
  sourceId: 102,
  sourceName: "Customer Forum",
  domain: "community.example",
  category: "customers",
  title: "Operations teams requesting automated ERP sync",
  url: "https://community.example/threads/erp-sync",
  publishedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  publishedAtMethod: "rss",
  fetchedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  change: "new",
  contentHash: "mockhash9002abcdef",
  excerpt:
    "Multiple mid-market buyers asked for direct webhook sync before annual renewal.",
};

const MOCK_EVIDENCE: Record<string, CollectedItem> = {
  "9001": EV_1,
  "9002": EV_2,
};

const SIG_1: SignalItem = {
  id: 9001,
  companyId: 1,
  category: "competitors",
  classification: "threat",
  headline: "Rival drops Enterprise pricing by 20% for 25+ seat accounts",
  evidenceSummary:
    "Starting this quarter, Enterprise plans move from $250/seat to $200/seat for teams above 25 seats.",
  whyItMatters: "Directly pressures mid-market renewal conversations above 25 seats.",
  potentialImpact: "High business impact (85/100)",
  impactLevel: "high",
  recommendedAction: {
    text: "Review active 25+ seat renewal quotes and prepare value-tier counter-offer.",
    effort: "low",
    timeframe: "This week",
  },
  priority: 5,
  priorityValue: 86,
  priorityReasons: [
    { label: "Strategic relevance", weight: 90 },
    { label: "Business impact", weight: 85 },
    { label: "Time urgency", weight: 82 },
  ],
  confidence: "high",
  evidenceIds: ["9001"],
  itemIds: ["9001"],
  sourceDomains: ["rival.example"],
  assumptionRefs: [{ type: "interview", id: "0", label: "Interview: Mid-market renewals" }],
  limitations: null,
  publishedAt: EV_1.publishedAt,
  detectedAt: EV_1.fetchedAt,
  status: "new",
  feedback: null,
  relatedSignalIds: [],
  verified: true,
  sourceName: "Rival Changelog",
  sourceId: 101,
  isMock: true,
};

const SIG_2: SignalItem = {
  id: 9002,
  companyId: 1,
  category: "customers",
  classification: "opportunity",
  headline: "Mid-market buyers requesting direct ERP webhook sync",
  evidenceSummary:
    "Multiple mid-market buyers asked for direct webhook sync before annual renewal.",
  whyItMatters: "Creates an upsell wedge for expansion tier accounts.",
  potentialImpact: "Medium business impact (72/100)",
  impactLevel: "medium",
  recommendedAction: {
    text: "Scope an ERP webhook integration pilot with the top 3 requesting accounts.",
    effort: "medium",
    timeframe: "This month",
  },
  priority: 4,
  priorityValue: 74,
  priorityReasons: [
    { label: "Strategic relevance", weight: 84 },
    { label: "Business impact", weight: 72 },
    { label: "Source credibility", weight: 80 },
  ],
  confidence: "high",
  evidenceIds: ["9002"],
  itemIds: ["9002"],
  sourceDomains: ["community.example"],
  assumptionRefs: [{ type: "profile", id: "industry", label: "Profile: B2B SaaS" }],
  limitations: "Single-source thread; confirm volume with CS notes.",
  publishedAt: EV_2.publishedAt,
  detectedAt: EV_2.fetchedAt,
  status: "new",
  feedback: null,
  relatedSignalIds: [],
  verified: true,
  sourceName: "Customer Forum",
  sourceId: 102,
  isMock: true,
};

const MOCK_SIGNALS: SignalItem[] = [SIG_1, SIG_2];

export function mockSignalsOverview(range: SignalRange): SignalsOverviewResponse {
  const days = range === "week" ? 7 : range === "90d" ? 90 : 30;
  const daily = Array.from({ length: Math.min(days, 30) }).map((_, idx, arr) => {
    const dt = new Date(Date.now() - (arr.length - 1 - idx) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const isThreatDay = idx === arr.length - 2;
    const isOppDay = idx === arr.length - 3;
    return {
      date: dt,
      opportunities: isOppDay ? 1 : 0,
      threats: isThreatDay ? 1 : 0,
      neutral: 0,
      topHeadline: isThreatDay ? SIG_1.headline : isOppDay ? SIG_2.headline : null,
    };
  });

  return {
    range,
    kpis: {
      newSignals: MOCK_SIGNALS.length,
      opportunities: 1,
      threats: 1,
      needsAttention: MOCK_SIGNALS.filter((s) => s.priority >= 4 && s.status === "new").length,
      evidenceCoveragePct: 100,
      highPriorityOpportunities: 1,
      highPriorityThreats: 1,
      deltaPct: { newSignals: null, opportunities: null, threats: null, needsAttention: null },
    },
    daily,
    previousPeriodTotal: 0,
    avgPriority: 4.5,
    verifiedPct: 100,
    topSignals: MOCK_SIGNALS,
    topOpportunities: [SIG_2],
    topThreats: [SIG_1],
    byCategory: [
      { category: "customers", count: 1 },
      { category: "competitors", count: 1 },
      { category: "market", count: 0 },
      { category: "internal", count: 0 },
    ],
    avgConfidence: "High",
    sourcesUsed: 2,
    awaitingReview: MOCK_SIGNALS.filter((s) => s.status === "new").length,
    inBriefCount: MOCK_SIGNALS.filter((s) => s.status === "in_brief").length,
    latestEvidence: [EV_1, EV_2],
    watchlist: [],
    analysisStatus: "idle",
    analysisError: null,
    analysisSteps: [],
    unanalysedItems: 0,
    lastAnalysedAt: new Date().toISOString(),
    suggestedQuestions: [
      "Which threats should we address first this week?",
      "What are our highest-priority growth opportunities?",
    ],
    countsByStatus: {
      all: MOCK_SIGNALS.length,
      new: MOCK_SIGNALS.filter((s) => s.status === "new").length,
      saved: MOCK_SIGNALS.filter((s) => s.status === "saved").length,
      in_brief: MOCK_SIGNALS.filter((s) => s.status === "in_brief").length,
      dismissed: MOCK_SIGNALS.filter((s) => s.status === "dismissed").length,
      opportunities: 1,
      threats: 1,
    },
    isMock: true,
  };
}

export function mockSignalsList(filters: SignalsListFilters): SignalsListResponse {
  const filtered = MOCK_SIGNALS.filter((s) => {
    if (filters.category?.length && !filters.category.includes(s.category)) return false;
    if (
      filters.classification &&
      filters.classification !== "all" &&
      s.classification !== filters.classification
    ) {
      return false;
    }
    if (filters.minPriority && s.priority < filters.minPriority) return false;
    if (filters.status && filters.status !== "all" && s.status !== filters.status) return false;
    if (!filters.status && s.status === "dismissed") return false;
    return true;
  });

  return {
    items: filtered,
    evidenceById: MOCK_EVIDENCE,
    nextCursor: null,
    total: filtered.length,
    countsByClassification: {
      opportunity: filtered.filter((s) => s.classification === "opportunity").length,
      threat: filtered.filter((s) => s.classification === "threat").length,
      neutral: filtered.filter((s) => s.classification === "neutral").length,
    },
    countsByCategory: {
      customers: filtered.filter((s) => s.category === "customers").length,
      competitors: filtered.filter((s) => s.category === "competitors").length,
      market: filtered.filter((s) => s.category === "market").length,
      internal: filtered.filter((s) => s.category === "internal").length,
    },
    isMock: true,
  };
}

export function mockSignalDetail(signalId: number): SignalDetailResponse {
  const sig = MOCK_SIGNALS.find((s) => s.id === signalId) ?? SIG_1;
  const evidenceItems = sig.evidenceIds
    .map((id) => MOCK_EVIDENCE[id])
    .filter((item): item is CollectedItem => Boolean(item));
  return {
    signal: sig,
    evidenceItems,
    relatedSignals: [],
    isMock: true,
  };
}

export function mockPatchSignal(signalId: number, patch: SignalPatchPayload): SignalItem {
  const sig = MOCK_SIGNALS.find((s) => s.id === signalId) ?? SIG_1;
  if (patch.status) sig.status = patch.status;
  if (patch.feedback) sig.feedback = patch.feedback;
  return { ...sig };
}

export function mockAskSignals(question: string): AskSignalsResponse {
  const match = MOCK_SIGNALS.find((s) =>
    question.toLowerCase().includes("pricing") ? s.id === 9001 : false,
  );
  if (!match) {
    return { answer: "", citations: [], suggestedQuestions: [] };
  }
  return {
    answer: `Based on collected evidence: ${match.headline}. ${match.whyItMatters}`,
    citations: [{ signalId: String(match.id), evidenceId: String(match.id), label: match.headline }],
    suggestedQuestions: [],
  };
}
