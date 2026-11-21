import type {
  Brief,
  BriefCompareResult,
  BriefGenerationState,
  BriefLatestResponse,
  BriefSummary,
} from "./types";

const MOCK_BRIEF_V2: Brief = {
  id: "mock-brief-2",
  companyId: 1,
  companyName: "Signal Stack Demo",
  weekStart: "2026-11-16",
  weekEnd: "2026-11-22",
  generatedAt: "2026-11-16T07:00:00Z",
  version: 2,
  status: "draft",
  trigger: "scheduled",
  automationRunId: "104",
  unread: true,
  headline: "Enterprise SAML SSO blockers & rival entry pricing shift",
  stats: { signals: 14, sources: 12, newEvidence: 6, verifiedPct: 100 },
  comparison: { opportunities: 1, threats: 1, newEvidence: 4 },
  executiveSummary: [
    {
      id: "exec-1",
      signalId: "101",
      category: "customers",
      classification: "opportunity",
      priority: 5,
      headline: "Three mid-market renewals flagged SAML SSO as a hard Q2 blocker",
      fact: {
        text: "We cannot renew in Q2 without SAML SSO support and audit log exports.",
        citations: [1],
      },
      whyItMatters: {
        text: "Protects $140k of Q2 ARR and enables Pro-to-Enterprise tier upgrades.",
        citations: [1],
      },
      impactLevel: "high",
      action: { text: "Publish SAML beta timeline to top 5 accounts", actionId: "act-1" },
      confidence: "high",
    },
    {
      id: "exec-2",
      signalId: "102",
      category: "competitors",
      classification: "threat",
      priority: 4,
      headline: "Rival Inc launched a $29/seat Starter AI tier targeting SMB teams",
      fact: {
        text: "Rival Inc announced Starter AI at $29 per seat with 14-day self-serve onboarding.",
        citations: [2],
      },
      whyItMatters: {
        text: "Increases price sensitivity at the bottom of the funnel for self-serve buyers.",
        citations: [2],
      },
      impactLevel: "high",
      action: { text: "Bundle automated templates into Pro plan", actionId: "act-2" },
      confidence: "high",
    },
  ],
  sections: [
    {
      key: "customers",
      summary: {
        text: "Enterprise security requirements dominated customer conversations this week.",
        citations: [1],
      },
      items: [
        {
          id: "cust-101",
          signalId: "101",
          category: "customers",
          classification: "opportunity",
          priority: 5,
          headline: "Three mid-market renewals flagged SAML SSO as a hard Q2 blocker",
          fact: {
            text: "We cannot renew in Q2 without SAML SSO support and audit log exports.",
            citations: [1],
          },
          whyItMatters: {
            text: "Protects $140k of Q2 ARR and enables Pro-to-Enterprise tier upgrades.",
            citations: [1],
          },
          impactLevel: "high",
          action: { text: "Publish SAML beta timeline to top 5 accounts", actionId: "act-1" },
          confidence: "high",
        },
      ],
      sourcesChecked: 4,
    },
    {
      key: "competitors",
      summary: {
        text: "Rival Inc moved aggressively down-market with unbundled AI pricing.",
        citations: [2],
      },
      items: [
        {
          id: "comp-102",
          signalId: "102",
          category: "competitors",
          classification: "threat",
          priority: 4,
          headline: "Rival Inc launched a $29/seat Starter AI tier targeting SMB teams",
          fact: {
            text: "Rival Inc announced Starter AI at $29 per seat with 14-day self-serve onboarding.",
            citations: [2],
          },
          whyItMatters: {
            text: "Increases price sensitivity at the bottom of the funnel for self-serve buyers.",
            citations: [2],
          },
          impactLevel: "high",
          action: { text: "Bundle automated templates into Pro plan", actionId: "act-2" },
          confidence: "high",
        },
      ],
      sourcesChecked: 3,
    },
    {
      key: "market",
      summary: null,
      items: [],
      sourcesChecked: 3,
    },
    {
      key: "internal",
      summary: {
        text: "Q4 pipeline review file confirmed longer security-review cycles.",
        citations: [3],
      },
      items: [
        {
          id: "int-103",
          signalId: "103",
          category: "internal",
          classification: "neutral",
          priority: 3,
          headline: "Security questionnaire cycle averaged 11 days in Q4 uploads",
          fact: {
            text: "Median procurement security review expanded from 6 days to 11 days in Q4.",
            citations: [3],
          },
          whyItMatters: {
            text: "Standardising a SOC 2 trust packet shaves one week off close times.",
            citations: [3],
          },
          impactLevel: "medium",
          confidence: "medium",
        },
      ],
      sourcesChecked: 2,
    },
  ],
  opportunities: [
    {
      id: "opp-1",
      headline: "Package SAML SSO + Audit Log as Enterprise security add-on",
      explanation: {
        text: "Three renewal-critical accounts asked for SAML ahead of Q2 procurement freezes.",
        citations: [1],
      },
      impactLevel: "high",
      likelihood: "high",
      actNowBy: "2026-12-05",
      linkedActionId: "act-1",
      signalId: "101",
    },
  ],
  risks: [
    {
      id: "risk-1",
      headline: "SMB churn risk from Rival $29/seat entry tier",
      explanation: {
        text: "Reinforce onboarding velocity and workspace templates inside the Pro tier.",
        citations: [2],
      },
      impactLevel: "high",
      likelihood: "medium",
      linkedActionId: "act-2",
      signalId: "102",
    },
  ],
  actions: [
    {
      id: "act-1",
      text: "Publish SAML SSO beta timeline to top 5 renewal accounts",
      rationale: {
        text: "Directly addresses the primary Q2 renewal blocker cited in customer threads.",
        citations: [1],
      },
      owner: "Founder",
      dueDate: "2026-11-24",
      effort: "medium",
      done: false,
      linkedSignalId: "101",
      citations: [1],
      order: 0,
    },
    {
      id: "act-2",
      text: "Bundle 5 prebuilt brief templates into Pro onboarding",
      rationale: {
        text: "Offsets Rival Inc's lower-priced entry tier with faster time-to-value.",
        citations: [2],
      },
      owner: "Product",
      dueDate: "2026-11-28",
      effort: "low",
      done: false,
      linkedSignalId: "102",
      citations: [2],
      order: 1,
    },
  ],
  watch: [
    {
      id: "102",
      title: "Rival Inc Q4 enterprise rollout",
      why: {
        text: "Monitor whether Starter AI expands into multi-workspace governance features.",
        citations: [2],
      },
      expectedAt: "2026-11-30T00:00:00Z",
      sourceDomain: "rival.example",
      inWatchlist: false,
    },
  ],
  sources: [
    {
      n: 1,
      title: "Enterprise Forum: Q2 SAML SSO Thread",
      url: "https://forum.demo.example/t/saml-sso",
      domain: "forum.demo.example",
      type: "Forum / Reviews",
      publishedAt: "2026-11-15T14:00:00Z",
      fetchedAt: "2026-11-16T06:40:00Z",
      verified: true,
      usedIn: [
        { section: "Executive summary", itemId: "exec-1" },
        { section: "Customer signals", itemId: "cust-101" },
        { section: "Recommended actions", itemId: "act-1" },
      ],
    },
    {
      n: 2,
      title: "Rival Changelog: Introducing Starter AI",
      url: "https://rival.example/changelog/starter-ai",
      domain: "rival.example",
      type: "Changelog",
      publishedAt: "2026-11-14T09:00:00Z",
      fetchedAt: "2026-11-16T06:42:00Z",
      verified: true,
      usedIn: [
        { section: "Executive summary", itemId: "exec-2" },
        { section: "Competitor intelligence", itemId: "comp-102" },
      ],
    },
    {
      n: 3,
      title: "Q4_Pipeline_Review.csv",
      url: "upload://Q4_Pipeline_Review.csv",
      domain: "internal-upload",
      type: "Internal file",
      publishedAt: null,
      fetchedAt: "2026-11-15T18:00:00Z",
      verified: true,
      usedIn: [{ section: "Internal intelligence", itemId: "int-103" }],
    },
  ],
  notes: [],
  provenance: {
    steps: [
      "Crawled 12 approved sources",
      "Analysed 14 evidence records",
      "Ranked top 2 executive priorities",
    ],
    model: "llama-3.3-70b",
  },
  removedUnsupportedClaims: 1,
  capabilities: { emailConfigured: false },
  isMock: true,
};

export function mockLatestBrief(companyId: number): BriefLatestResponse {
  return {
    brief: { ...MOCK_BRIEF_V2, companyId },
    prerequisites: { ready: true, signalsCount: 14, completedCrawls: 3 },
    capabilities: { emailConfigured: false },
    isMock: true,
  };
}

export function mockBriefById(companyId: number, briefId: string): Brief {
  return {
    ...MOCK_BRIEF_V2,
    id: briefId,
    companyId,
    unread: false,
    isArchived: briefId === "mock-brief-1",
    version: briefId === "mock-brief-1" ? 1 : 2,
  };
}

export function mockBriefList(): { items: BriefSummary[]; nextCursor: string | null; total: number } {
  return {
    items: [
      {
        id: "mock-brief-2",
        weekStart: "2026-11-16",
        weekEnd: "2026-11-22",
        status: "draft",
        signals: 14,
        actionsDonePct: 0,
        trigger: "scheduled",
        version: 2,
      },
      {
        id: "mock-brief-1",
        weekStart: "2026-11-09",
        weekEnd: "2026-11-15",
        status: "sent",
        signals: 10,
        actionsDonePct: 80,
        trigger: "scheduled",
        version: 1,
      },
    ],
    nextCursor: null,
    total: 2,
  };
}

export function mockBriefGeneration(): BriefGenerationState {
  return { status: "idle", steps: [], briefId: "mock-brief-2" };
}

export function mockBriefCompare(a: string, b: string): BriefCompareResult {
  return {
    briefA: { id: a, version: 1, weekStart: "2026-11-09" },
    briefB: { id: b, version: 2, weekStart: "2026-11-16" },
    added: ["Three mid-market renewals flagged SAML SSO as a hard Q2 blocker"],
    removed: ["Competitor paused EMEA partner program"],
    unchanged: ["Rival Inc launched a $29/seat Starter AI tier targeting SMB teams"],
  };
}
