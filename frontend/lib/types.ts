export type WorkflowStepState = "done" | "current" | "locked";

export type WorkflowStatus = {
  company: WorkflowStepState;
  interview: WorkflowStepState;
  sources: WorkflowStepState;
  crawler?: WorkflowStepState;
  signals: WorkflowStepState;
  briefs: WorkflowStepState;
};

export type CompanyResearchState = "queued" | "running" | "ready" | "failed";

export type ConfidenceLevel = "high" | "medium" | "low";

export type Evidence = {
  id: string;
  url: string;
  title?: string;
  type: "webpage" | "research" | "user-provided";
  usedFor: string;
  fetchedAt: string;
  publishedAt?: string;
  snippet?: string;
  verified: boolean;
};

export type ServiceItem = {
  id: string;
  name: string;
  description: string;
  evidenceIds: string[];
  verified: boolean;
};

export type SegmentItem = {
  id: string;
  name: string;
  rationale: string;
  evidenceIds: string[];
  verified: boolean;
};

export type CompetitorDecision = "keep" | "remove" | "review";

export type CompetitorItem = {
  id: string;
  name: string;
  website: string;
  domain: string;
  reason: string;
  evidenceIds: string[];
  confidence: ConfidenceLevel;
  decision: CompetitorDecision;
};

export type LogEntry = {
  id: string;
  title: string;
  detail: string;
  at: string;
  status: "ok" | "running" | "error" | "info";
  kind: "fetch" | "extract" | "competitors" | "confirm" | "job";
};

export type CompanyDetailApi = Company & {
  profile: (Profile & {
    headquarters?: string | null;
    founded?: string | null;
    company_size?: string | null;
    primary_region?: string | null;
    primary_language?: string | null;
    competitor_decisions?: Record<string, CompetitorDecision>;
    _meta?: Profile["_meta"] & {
      researched_at?: string | null;
      confirmed_at?: string | null;
      updated_at?: string | null;
    };
  }) | null;
  research_status?: CompanyResearchState;
  research_job_id?: number | null;
  research_error?: string | null;
  workflow_status?: WorkflowStatus;
  category_counts?: Record<SourceCategory, number>;
  research_logs?: JobLog[];
};

export type CompanyRecord = {
  id: number;
  name: string;
  website: string;
  domain: string;
  context: string;
  created: string;
  industry?: string | null;
  businessModel?: string | null;
  valueProposition?: string | null;
  positioning?: string | null;
  headquarters?: string | null;
  founded?: string | null;
  size?: string | null;
  primaryRegion?: string | null;
  primaryLanguage?: string | null;
  summary: string;
  summaryUpdatedAt?: string | null;
  confirmedAt?: string | null;
  services: ServiceItem[];
  customerSegments: SegmentItem[];
  competitors: CompetitorItem[];
  evidence: Evidence[];
  researchLog: LogEntry[];
  unverified: string[];
  pagesFetchedCount: number;
  confidence: ConfidenceLevel;
  confidenceBreakdown: {
    services: number;
    customers: number;
    competitors: number;
  };
  researchStatus: CompanyResearchState;
  researchJobId: number | null;
  researchError: string | null;
  workflowStatus: WorkflowStatus;
  categoryCounts: Record<SourceCategory, number>;
  isMock?: boolean;
};

export type CompanyPatchPayload = {
  name?: string;
  website?: string;
  context?: string;
  summary?: string;
  industry?: string;
  business_model?: string;
  value_proposition?: string;
  positioning?: string;
  headquarters?: string;
  founded?: string;
  company_size?: string;
  primary_region?: string;
  primary_language?: string;
  products?: Fact[];
  customers?: Fact[];
  likely_competitors?: CompetitorHint[];
  competitor_decisions?: Record<string, CompetitorDecision>;
  unverified?: string[];
};

export type Company = {
  id: number;
  name: string;
  website: string;
  context: string;
  created: string;
  has_profile: boolean;
};

export type Fact = { text: string; evidence_url: string; verified: boolean };

export type CompetitorHint = { name: string; website: string; reason: string };

export type Profile = {
  summary?: string;
  industry?: string;
  business_model?: string;
  value_proposition?: string;
  positioning?: string;
  products?: Fact[];
  customers?: Fact[];
  geography?: Fact[];
  differentiators?: Fact[];
  growth_opportunities?: Fact[];
  challenges?: Fact[];
  likely_competitors?: CompetitorHint[];
  unverified?: string[];
  intelligence?: {
    completed_at?: string;
    answered?: number;
    skipped?: number;
    founder_answers?: { question: string; answer: string; is_followup: boolean }[];
  };
  _meta?: { pages_fetched?: string[]; fetch_failures?: string[]; model?: string };
};

export type InterviewStatus = "not_started" | "in_progress" | "completed";

export type TurnAnswer = {
  text?: string;
  skipped: boolean;
  quotedText?: string;
  editedAt?: string;
  answeredAt: string;
};

export type Turn = {
  id?: number;
  index: number;
  question: string;
  topic: string;
  whyAsking?: string;
  evidenceIds: string[];
  suggestedAnswers?: string[];
  isFollowup?: boolean;
  answer?: TurnAnswer;
  updatedAfterEdit?: boolean;
};

export type LearnedItem = {
  id: string;
  topic: string;
  text: string;
  sourceTurnIndex: number;
  skipped?: boolean;
};

export type Interview = {
  id: number;
  companyId: number;
  status: InterviewStatus;
  totalQuestions: number;
  currentIndex: number;
  model?: string;
  turns: Turn[];
  learned: LearnedItem[];
  regeneratedFrom?: number | null;
};

export type QAItem = {
  id: number;
  idx: number;
  question: string;
  answer: string | null;
  skipped: boolean;
  is_followup: boolean;
};

export type InterviewState = {
  company_id: number;
  started: boolean;
  questions: QAItem[];
  current_idx: number | null;
  answered: number;
  skipped: number;
  followups_used: number;
  max_followups: number;
  completed: boolean;
  id?: number;
  companyId?: number;
  status?: InterviewStatus;
  totalQuestions?: number;
  currentIndex?: number;
  model?: string | null;
  turns?: Turn[];
  learned?: LearnedItem[];
  regeneratedFrom?: number | null;
};

export type SourceCategory = "customers" | "competitors" | "market" | "internal";
export type SourceStatus = "pending" | "approved" | "rejected" | "paused";

export type SignalStackSourceStatus =
  | "needs_review"
  | "approved"
  | "rejected"
  | "failing"
  | "blocked";

export type SourceFrequency = "hourly" | "daily" | "weekly";

export type SourceScoreReason = {
  label: string;
  weight: number;
};

export type SourceSubLink = {
  name: string;
  url: string;
};

export type SourceCrawlRun = {
  at: string;
  status: string;
  recordsFound?: number;
};

export type SignalStackSource = {
  id: number;
  companyId: number;
  name: string;
  url: string;
  domain: string;
  category: SourceCategory;
  type: string;
  crawlMethod: "rss" | "sitemap" | "html";
  language?: string;
  status: SignalStackSourceStatus;
  relevanceScore: number;
  scoreReasons?: SourceScoreReason[];
  whyRecommended: string;
  evidenceIds: string[];
  discoveryConfidence: ConfidenceLevel;
  frequency: SourceFrequency;
  lastCheckedAt?: string | null;
  lastError?: string | null;
  robotsAllowed: boolean;
  isChecking?: boolean;
  subSources?: SourceSubLink[];
  isCustom: boolean;
  maxPages?: number;
  includePatterns?: string;
  excludePatterns?: string;
  lastHttpStatus?: number | null;
  recentCrawls?: SourceCrawlRun[];
};

export type AuditProposal = {
  id: string;
  action: "add" | "keep" | "remove";
  source: SignalStackSource;
  reasoning: string;
  evidenceIds: string[];
};

export type UploadedFile = {
  id: number;
  sourceId?: number;
  filename: string;
  size: number;
  type: string;
  uploadedAt?: string | null;
  status: "uploaded" | "parsing" | "analysed" | "failed";
  summary?: {
    counts?: Record<string, number>;
    label?: string;
    complaints?: string[];
    objections?: string[];
    lost_deal_reasons?: string[];
    product_requests?: string[];
  } | null;
  error?: string | null;
};

export type AddSourceValidation = {
  reachable: boolean;
  robotsAllowed: boolean;
  feedFound: boolean;
  readableText: boolean;
  detail?: string;
};

export type SignalStack = {
  sources: SignalStackSource[];
  recommendedThreshold: number;
  auditProposals?: AuditProposal[];
  discoveryStatus: "queued" | "running" | "ready" | "failed";
  discoveryStage?: string | null;
  discoveryError?: string | null;
  counts: {
    customers: number;
    competitors: number;
    market: number;
    internal: number;
    approved: number;
    needs_review: number;
    rejected: number;
    failing: number;
    blocked: number;
  };
  internalFiles: UploadedFile[];
  maxUploadBytes: number;
  allowedExtensions: string[];
  confirmedAt?: string | null;
  isMock?: boolean;
};

export type SignalStackSourcePatch = {
  status?: SignalStackSourceStatus;
  name?: string;
  url?: string;
  category?: SourceCategory;
  type?: string;
  frequency?: SourceFrequency;
  maxPages?: number;
  includePatterns?: string;
  excludePatterns?: string;
};

export type Source = {
  id: number;
  name: string;
  url: string;
  feed_url: string | null;
  category: SourceCategory;
  source_type?: string;
  description?: string;
  update_frequency?: string;
  status: SourceStatus;
  health: string;
  reliability: number;
  relevance: number | null;
  relevance_reason: string | null;
  reason: string;
  expected: string;
  last_checked: string | null;
  last_ok: string | null;
  last_error: string | null;
  created: string | null;
};

export type Scores = {
  relevance?: number;
  impact?: number;
  urgency?: number;
  credibility?: number;
  recency?: number;
  novelty?: number;
  total?: number;
  explanation?: string;
  weights?: Record<string, number>;
};

export type Signal = {
  id: number;
  url: string;
  title: string;
  published: string | null;
  discovered: string | null;
  content_hash: string;
  is_update: boolean;
  total: number;
  scores: Scores | null;
  explanation: string | null;
  summary: string | null;
  evidence_snippet: string | null;
  evidence_verbatim: boolean | null;
  evidence_strength: number | null;
  source_reliability: number | null;
  strategic_relevance: number | null;
  classification?: "opportunity" | "threat" | "neutral" | "uncertain";
  corroborated?: boolean;
  related_records?: {
    id: number;
    title: string;
    source_id: number | null;
    source_name: string;
    total: number;
    overlap_terms: number;
  }[];
  source: { id: number; name: string; category: string } | null;
  text_preview: string;
};

export type BriefSection = {
  key: string;
  heading: string;
  body: string;
  record_ids: number[];
};

export type BriefAction = {
  action: string;
  owner: string;
  why: string;
  record_ids: number[];
  done: boolean;
};

export type BriefOpportunity = {
  opportunity: string;
  evidence: string;
  relevance: string;
  impact: string;
  next_step: string;
  priority: "high" | "medium" | "low";
  record_ids: number[];
};

export type BriefRisk = {
  risk: string;
  mitigation: string;
  record_ids: number[];
};

export type ReportContent = {
  company: { id: number; name: string; website: string };
  generated_at: string;
  sections: BriefSection[];
  top_signals: { id: number; title: string; url: string; total: number; category: string }[];
  opportunities?: BriefOpportunity[];
  risks?: BriefRisk[];
  actions: BriefAction[];
  counts: { records: number; sources: number; by_category: Record<string, number> };
  record_index: { id: number; url: string; title: string }[];
  dropped_actions: number;
  model: string;
};

export type Report = {
  id: number;
  company_id: number;
  created: string;
  content: ReportContent;
  markdown?: string;
};

export type ReportListItem = {
  id: number;
  created: string;
  generated_at: string | null;
  actions: number;
  top_signal: string | null;
};

export type JobLog = {
  id: number;
  job: string;
  status: string;
  at: string;
  detail: string;
};

export type CrawlSummary = {
  company_id: number;
  sources_checked: number;
  new_records: number;
  updated_records: number;
  duplicates: number;
  errors: number;
  not_modified?: number;
  message?: string;
  per_source?: { source_id: number; url: string; status: string; error?: string }[];
};

export type DiscoveryResult = {
  company_id: number;
  created: { id: number; name: string; url: string; category: string }[];
  created_count: number;
  dropped: { url: string; reason: string }[];
  dropped_count: number;
  counts_by_category: Record<string, number>;
};

export type ReassessResult = {
  company_id: number;
  previous_context: string;
  new_context: string;
  scored: number;
  changed_count?: number;
  updated: {
    source_id: number;
    name: string;
    category: string;
    previous_relevance: number | null;
    relevance: number;
    reason: string;
    changed: boolean;
  }[];
  recommended_removal: { source_id: number; name: string; relevance: number; reason: string; action: string }[];
  discovery: { created_count?: number; dropped_count?: number; error?: string } | null;
  profile_comparison?: {
    previous_context: string;
    new_context: string;
    explanation: string;
    sources_scored: number;
    recommended_removal_count: number;
    new_candidates_count: number;
  };
};

export type AnalysisResult = {
  company_id: number;
  considered: number;
  analysed: number;
  failed: number;
  evidence_flagged: number;
  cap_per_run: number;
};

export type DocumentInsights = {
  complaints: string[];
  objections: string[];
  lost_deal_reasons: string[];
  product_requests: string[];
  counts: Record<string, number>;
  label: string;
};

export type DocumentItem = {
  record_id: number;
  source_id: number;
  filename: string;
  document_type?: string;
  characters: number;
  discovered: string | null;
  analysed: boolean;
  insights?: DocumentInsights;
};

export type CompetitorProfile = {
  name: string;
  website: string;
  positioning: string;
  pricing_or_offer: string;
  strengths: string[];
  weaknesses: string[];
  differentiation: string;
  evidence_url: string;
};

export type CompanyOverview = {
  company_id: number;
  sources_by_category: Record<string, { approved: number; pending: number; paused: number; rejected: number; total: number }>;
  records_total: number;
  records_analysed: number;
  latest_crawl: { id: number; status: string; at: string; detail: string } | null;
  latest_report: { id: number; created: string; actions: number } | null;
  latest_automation: { job: string; status: string; at: string } | null;
  scheduler_enabled: boolean;
};

export type CrawlDiagnostics = {
  failing_sources: Source[];
  total_duplicates_logged: number;
  duplicate_entries: { source_id: number; source_name: string; url: string; title: string; at: string }[];
  history: {
    id: number;
    status: string;
    at: string;
    sources_checked: number;
    new_records: number;
    updated_records: number;
    duplicates: number;
    errors: number;
  }[];
};

// ---------------------------------------------------------------------------
// Crawler Monitor (Step 4)
// ---------------------------------------------------------------------------

export type CrawlRange = "7d" | "30d" | "90d";

export type CrawlRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "cancelled";

export type SourceCrawlResultStatus =
  | "success"
  | "not_modified"
  | "partial"
  | "failed"
  | "blocked";

export type SourceCrawlResult = {
  sourceId: number;
  sourceName: string;
  domain: string;
  category: SourceCategory;
  status: SourceCrawlResultStatus;
  httpStatus?: number | null;
  itemsNew: number;
  itemsChanged: number;
  durationMs: number;
  error?: string | null;
};

export type CrawlRun = {
  id: number;
  companyId: number;
  trigger: "manual" | "scheduled";
  status: CrawlRunStatus;
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
  sourcesTotal: number;
  sourcesDone: number;
  currentSourceDomain?: string | null;
  counts: {
    new: number;
    changed: number;
    unchanged: number;
    failed: number;
    blocked: number;
  };
  perSource?: SourceCrawlResult[];
};

export type CrawlLogLine = {
  id: number;
  runId: number;
  ts: string;
  level: "info" | "warn" | "error" | "success";
  sourceDomain?: string | null;
  message: string;
};

export type CollectedItem = {
  id: number;
  sourceId: number;
  sourceName?: string;
  domain?: string;
  category: SourceCategory;
  title: string;
  url: string;
  publishedAt?: string | null;
  publishedAtMethod?: "metadata" | "rss" | "heuristic" | null;
  fetchedAt: string;
  change: "new" | "changed" | "unchanged";
  contentHash: string;
  excerpt?: string;
  diff?: {
    before: string;
    after: string;
  };
};

export type CrawlerCoverageRow = {
  category: SourceCategory;
  approved: number;
  checked: number;
  newItems: number;
};

export type CrawlerOverview = {
  range: CrawlRange;
  totals: {
    new: number;
    changed: number;
    failed: number;
    deltaPct: {
      new: number | null;
      changed: number | null;
      failed: number | null;
    };
  };
  daily: {
    date: string;
    new: number;
    changed: number;
    failed: number;
    sourcesChecked: number;
  }[];
  activeRun?: CrawlRun | null;
  lastRun?: CrawlRun | null;
  recentRuns?: CrawlRun[];
  runsCount?: number;
  nextRunAt?: string | null;
  budget?: {
    pagesUsed: number;
    pagesLimit: number;
    period: string;
  } | null;
  etiquette: {
    respectsRobots: boolean;
    delaySeconds: number;
    userAgent: string;
    blockedByRobots: number;
  };
  health: {
    healthyPct: number;
    failing: number;
    stale: number;
    windowCrawls: number;
  };
  coverage: CrawlerCoverageRow[];
  allTimeCoverage?: CrawlerCoverageRow[];
  quickRecheck: {
    sourceId: string;
    name: string;
    domain: string;
    lastCheckedAt?: string | null;
    status: string;
  }[];
  isMock?: boolean;
};

export type CollectedItemsFilters = {
  category?: SourceCategory | "all";
  change?: "new" | "changed" | "unchanged" | "all";
  sourceId?: number;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
};

