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
};

export type SourceCategory = "customers" | "competitors" | "market" | "internal";
export type SourceStatus = "pending" | "approved" | "rejected" | "paused";

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
