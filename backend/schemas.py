"""Pydantic models: API contracts and every LLM output shape."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Category = Literal["customers", "competitors", "market", "internal"]
SourceStatus = Literal["pending", "approved", "rejected", "paused"]


# --------------------------------------------------------------------------- #
# Companies / API I/O
# --------------------------------------------------------------------------- #
class CompanyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    website: str = Field(min_length=4, max_length=500)
    context: str = Field(default="", max_length=4000)

    @field_validator("website")
    @classmethod
    def _website_scheme(cls, value: str) -> str:
        value = value.strip()
        if not value.startswith(("http://", "https://")):
            value = "https://" + value.lstrip("/")
        return value

    @field_validator("name")
    @classmethod
    def _name_strip(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("name must not be blank")
        return value


class CompanyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    website: str | None = None
    context: str | None = Field(default=None, max_length=4000)
    summary: str | None = None
    industry: str | None = None
    business_model: str | None = None
    value_proposition: str | None = None
    positioning: str | None = None
    headquarters: str | None = None
    founded: str | None = None
    company_size: str | None = None
    primary_region: str | None = None
    primary_language: str | None = None
    products: list[dict] | None = None
    customers: list[dict] | None = None
    likely_competitors: list[dict] | None = None
    competitor_decisions: dict[str, str] | None = None
    unverified: list[str] | None = None


class CompanyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    website: str
    context: str
    created: datetime
    has_profile: bool = False


# --------------------------------------------------------------------------- #
# Research profile (Phase 2)
# --------------------------------------------------------------------------- #
class Fact(BaseModel):
    text: str = Field(description="One factual statement about the company, max 200 chars")
    evidence_url: str = Field(description="Exact URL of the fetched page that supports this fact")
    verified: bool = True


class CompetitorHint(BaseModel):
    name: str = Field(description="Competitor company name")
    website: str = Field(description="Competitor homepage URL, https://...")
    reason: str = Field(default="", description="Why this is a competitor, one sentence")


class Profile(BaseModel):
    """What the LLM returns from the research crawl."""

    summary: str = Field(description="3-4 sentence neutral description of what the company does")
    industry: str = Field(default="", description="Short sector label, e.g. 'fintech payments'")
    business_model: str = Field(default="", description="How the company makes money, or 'unclear'")
    value_proposition: str = Field(default="", description="Core value proposition stated on the site")
    positioning: str = Field(default="", description="How the company positions itself in the market")
    products: list[Fact] = Field(default_factory=list)
    customers: list[Fact] = Field(default_factory=list)
    geography: list[Fact] = Field(default_factory=list)
    differentiators: list[Fact] = Field(default_factory=list)
    growth_opportunities: list[Fact] = Field(default_factory=list)
    challenges: list[Fact] = Field(default_factory=list)
    likely_competitors: list[CompetitorHint] = Field(default_factory=list, max_length=10)
    unverified: list[str] = Field(
        default_factory=list,
        description="Inferences or claims without direct page evidence; phrased as hypotheses",
    )


class ProfilePatch(BaseModel):
    summary: str | None = None
    industry: str | None = None
    business_model: str | None = None
    value_proposition: str | None = None
    positioning: str | None = None
    unverified: list[str] | None = None


# --------------------------------------------------------------------------- #
# Interview (Phase 3)
# --------------------------------------------------------------------------- #
class InterviewQuestion(BaseModel):
    question: str = Field(description="One specific question, max 220 chars")
    topic: str = Field(
        default="",
        description="One of: Customers, Growth, Competitors, Market, Operations, Goals",
    )
    why_asking: str = Field(
        default="",
        description="One short sentence explaining which company research finding triggered this question",
    )
    evidence_urls: list[str] = Field(
        default_factory=list,
        description="1-2 exact URLs from pages_fetched that support why_asking",
    )
    suggested_answers: list[str] = Field(
        default_factory=list,
        description="Optional 0-3 short factual draft answers grounded in research; empty if unsure",
    )


class QuestionBatch(BaseModel):
    questions: list[InterviewQuestion] = Field(min_length=1, max_length=12)


class FollowUpDecision(BaseModel):
    followup: bool = Field(description="True only if the answer was too vague to be useful")
    question: str = Field(default="", description="The follow-up question if followup is true")
    topic: str = Field(default="", description="Topic label for the follow-up")
    why_asking: str = Field(default="", description="Short reason for asking the follow-up")


class QAOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    idx: int
    question: str
    answer: str | None
    skipped: bool
    is_followup: bool


# --------------------------------------------------------------------------- #
# Sources (Phase 4)
# --------------------------------------------------------------------------- #
class DiscoveredSource(BaseModel):
    name: str
    url: str
    category: Category
    reason: str = ""
    expected: str = ""
    reliability: float = Field(default=0.5, ge=0.0, le=1.0)


class DiscoveryBatch(BaseModel):
    sources: list[DiscoveredSource] = Field(default_factory=list, max_length=40)


class SourceCreate(BaseModel):
    name: str = Field(default="", max_length=300)
    url: str = Field(min_length=4, max_length=1000)
    category: Category
    source_type: str | None = None
    description: str = ""
    reason: str = ""
    expected: str = ""
    reliability: float = Field(default=0.5, ge=0.0, le=1.0)
    update_frequency: str = "weekly"
    feed_url: str | None = None
    forceAdd: bool = False


class SourcePatch(BaseModel):
    status: str | None = None
    category: Category | None = None
    relevance: float | None = Field(default=None, ge=0.0, le=1.0)
    name: str | None = None
    url: str | None = None
    type: str | None = None
    description: str | None = None
    expected: str | None = None
    update_frequency: str | None = None
    frequency: str | None = None
    maxPages: int | None = Field(default=None, ge=1, le=200)
    includePatterns: str | None = None
    excludePatterns: str | None = None


class SourceBulkPatch(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=200)
    patch: SourcePatch


class AuditDecisionItem(BaseModel):
    proposalId: str
    accepted: bool


class AuditApplyIn(BaseModel):
    decisions: list[AuditDecisionItem] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# Analysis (Phase 5)
# --------------------------------------------------------------------------- #
class Analysis(BaseModel):
    """LLM output for one crawled record. Prose only - ids and scores come from code."""

    title: str = Field(description="Short headline for this development, max 120 chars")
    summary: str = Field(description="2-3 sentence factual summary strictly from the source")
    evidence_snippet: str = Field(
        description="Verbatim substring of the source text (20-400 chars) that proves the claim"
    )
    relevance: float = Field(ge=0.0, le=1.0, description="Relevance to the company's strategy")
    impact: float = Field(ge=0.0, le=1.0, description="Size of business impact if true")
    urgency: float = Field(ge=0.0, le=1.0, description="How time-sensitive this is")
    strategic_relevance: float = Field(
        ge=0.0, le=1.0, description="Link to the founder's stated priorities"
    )
    evidence_strength: float = Field(
        ge=0.0, le=1.0, description="How directly the snippet supports the claim"
    )
    category: Literal["customers", "competitors", "market", "internal", "other"] = "other"
    signal_type: str = Field(default="news", description="e.g. launch, hire, funding, partnership")
    sentiment: Literal["positive", "neutral", "negative"] = "neutral"
    classification: Literal["opportunity", "threat", "neutral", "uncertain"] = "neutral"
    why_it_matters: str = Field(default="", description="Why this matters specifically to the company")
    recommended_action: str = Field(default="", description="Concrete recommended action for the company")
    effort: Literal["low", "medium", "high"] | None = None
    timeframe: str | None = None
    limitations: str = Field(default="")


# --------------------------------------------------------------------------- #
# Brief (Phase 6)
# --------------------------------------------------------------------------- #
class SectionProse(BaseModel):
    body: str = Field(default="", description="2-5 factual sentences drawn only from the cited records")
    record_ids: list[int] = Field(
        default_factory=list, description="Every record id the sentences rely on"
    )


class BriefAction(BaseModel):
    action: str = Field(description="Concrete next action")
    owner: str = Field(default="Founder")
    why: str = Field(default="")
    record_ids: list[int] = Field(default_factory=list)


class BriefOpportunity(BaseModel):
    opportunity: str
    evidence: str = Field(default="")
    relevance: str = Field(default="")
    impact: str = Field(default="")
    next_step: str = Field(default="")
    priority: Literal["high", "medium", "low"] = "medium"
    record_ids: list[int] = Field(default_factory=list)


class BriefRisk(BaseModel):
    risk: str
    mitigation: str = Field(default="")
    record_ids: list[int] = Field(default_factory=list)


class BriefDraft(BaseModel):
    """Prose the LLM writes. Section headings and record selection are code's job."""

    executive_summary: str = Field(description="5-8 sentences summarising only the cited records")
    executive_record_ids: list[int] = Field(default_factory=list)
    customer_signals: SectionProse = Field(default_factory=SectionProse)
    competitor_moves: SectionProse = Field(default_factory=SectionProse)
    market_shifts: SectionProse = Field(default_factory=SectionProse)
    founder_intelligence: SectionProse = Field(default_factory=SectionProse)
    strategic_implications: SectionProse = Field(default_factory=SectionProse)
    risks_watchlist: SectionProse = Field(default_factory=SectionProse)
    opportunities: list[BriefOpportunity] = Field(default_factory=list, max_length=6)
    risks: list[BriefRisk] = Field(default_factory=list, max_length=6)
    actions: list[BriefAction] = Field(default_factory=list, max_length=6)


# --------------------------------------------------------------------------- #
# Competitors (Priority 2)
# --------------------------------------------------------------------------- #
class CompetitorCandidate(BaseModel):
    name: str
    website: str
    rationale: str = ""


class CompetitorCandidateList(BaseModel):
    competitors: list[CompetitorCandidate] = Field(default_factory=list, max_length=12)


class CompetitorProfile(BaseModel):
    name: str
    website: str
    positioning: str = ""
    pricing_or_offer: str = ""
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    differentiation: str = ""
    evidence_url: str = ""


class CompetitorProfileBatch(BaseModel):
    profiles: list[CompetitorProfile] = Field(default_factory=list, max_length=12)


class CrawlRunStartIn(BaseModel):
    sourceIds: list[int] | None = None


class CrawlerSettingsPatchIn(BaseModel):
    maxPagesPerRun: int | None = Field(default=None, ge=1, le=500)


class SignalPatchIn(BaseModel):
    status: Literal["new", "saved", "in_brief", "dismissed"] | None = None
    feedback: Literal["useful", "not_useful"] | None = None
    feedbackComment: str | None = Field(default=None, max_length=1000)


class SignalsBulkIn(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=200)
    patch: SignalPatchIn


class SignalsAskIn(BaseModel):
    question: str = Field(min_length=2, max_length=1200)
    quotedText: str | None = Field(default=None, max_length=600)


class AnswerCardRowOut(BaseModel):
    label: str
    value: str
    category: Literal["customers", "competitors", "market", "internal"] | None = None


class AnswerCardOut(BaseModel):
    title: str
    rows: list[AnswerCardRowOut] = Field(default_factory=list, max_length=6)


class SignalsAskLLMOut(BaseModel):
    answer: str
    cited_record_ids: list[int] = Field(default_factory=list)
    suggested_questions: list[str] = Field(default_factory=list, max_length=4)
    answer_card: AnswerCardOut | None = None
    recommendation: str | None = None


class MisfirePolicyIn(BaseModel):
    policy: Literal["run_late", "skip"] = "run_late"
    graceSeconds: int = Field(default=1800, ge=60, le=86400)


class RetryPolicyIn(BaseModel):
    max: int = Field(default=1, ge=0, le=3)
    delaySeconds: int = Field(default=120, ge=10, le=3600)


class DeliveryPolicyIn(BaseModel):
    email: bool = False
    recipients: list[str] = Field(default_factory=list, max_length=20)


class ScheduleDraftIn(BaseModel):
    jobType: Literal["crawl", "analysis", "weekly_brief", "source_audit"]
    name: str = Field(min_length=2, max_length=160)
    enabled: bool = True
    frequency: Literal["hourly", "daily", "weekly", "monthly", "custom"]
    cron: str | None = Field(default=None, max_length=120)
    timezone: str = Field(default="UTC", max_length=64)
    daysOfWeek: list[int] | None = None
    timeOfDay: str | None = Field(default=None, max_length=16)
    intervalHours: int | None = Field(default=None, ge=1, le=24)
    dayOfMonth: int | str | None = None
    dependsOn: str | None = Field(default=None, max_length=64)
    misfire: MisfirePolicyIn = Field(default_factory=MisfirePolicyIn)
    retries: RetryPolicyIn = Field(default_factory=RetryPolicyIn)
    noOverlap: bool = True
    delivery: DeliveryPolicyIn | None = None
    options: dict | None = None


class SchedulePatchIn(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    enabled: bool | None = None
    frequency: Literal["hourly", "daily", "weekly", "monthly", "custom"] | None = None
    cron: str | None = Field(default=None, max_length=120)
    timezone: str | None = Field(default=None, max_length=64)
    daysOfWeek: list[int] | None = None
    timeOfDay: str | None = Field(default=None, max_length=16)
    intervalHours: int | None = Field(default=None, ge=1, le=24)
    dayOfMonth: int | str | None = None
    dependsOn: str | None = Field(default=None, max_length=64)
    misfire: MisfirePolicyIn | None = None
    retries: RetryPolicyIn | None = None
    noOverlap: bool | None = None
    delivery: DeliveryPolicyIn | None = None
    options: dict | None = None
    pausedUntil: str | None = None


class OverrideDraftIn(BaseModel):
    scheduleId: int | None = None
    type: Literal["pause", "skip", "reschedule", "run_once", "blackout"]
    startsAt: str
    endsAt: str | None = None
    newTime: str | None = None
    reason: str | None = Field(default=None, max_length=500)


class BriefNoteIn(BaseModel):
    sectionKey: str = Field(min_length=1, max_length=64)
    text: str = Field(max_length=2000)


class BriefPatchIn(BaseModel):
    status: Literal["draft", "ready", "sent"] | None = None
    removeItemIds: list[str] | None = None
    notes: list[BriefNoteIn] | None = None


class BriefActionPatchIn(BaseModel):
    done: bool | None = None
    owner: str | None = Field(default=None, max_length=120)
    dueDate: str | None = Field(default=None, max_length=40)
    order: int | None = Field(default=None, ge=0, le=100)


class BriefActionCreateIn(BaseModel):
    text: str = Field(min_length=2, max_length=500)
    owner: str = Field(default="Founder", max_length=120)
    dueDate: str | None = Field(default=None, max_length=40)
    effort: Literal["low", "medium", "high"] = "medium"


class BriefEmailIn(BaseModel):
    to: str = Field(min_length=3, max_length=254)


class BriefFeedbackIn(BaseModel):
    useful: bool
    comment: str | None = Field(default=None, max_length=1000)




