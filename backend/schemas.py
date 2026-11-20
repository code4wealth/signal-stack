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
    products: list[Fact] = Field(default_factory=list)
    customers: list[Fact] = Field(default_factory=list)
    geography: list[Fact] = Field(default_factory=list)
    differentiators: list[Fact] = Field(default_factory=list)
    likely_competitors: list[CompetitorHint] = Field(default_factory=list, max_length=10)
    unverified: list[str] = Field(
        default_factory=list,
        description="Inferences or claims without direct page evidence; phrased as hypotheses",
    )


class ProfilePatch(BaseModel):
    summary: str | None = None
    industry: str | None = None
    business_model: str | None = None
    unverified: list[str] | None = None


# --------------------------------------------------------------------------- #
# Interview (Phase 3)
# --------------------------------------------------------------------------- #
class InterviewQuestion(BaseModel):
    question: str = Field(description="One specific question, max 220 chars")


class QuestionBatch(BaseModel):
    questions: list[InterviewQuestion] = Field(min_length=1, max_length=12)


class FollowUpDecision(BaseModel):
    followup: bool = Field(description="True only if the answer was too vague to be useful")
    question: str = Field(default="", description="The follow-up question if followup is true")


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
    name: str = Field(min_length=1, max_length=300)
    url: str = Field(min_length=4, max_length=1000)
    category: Category
    reason: str = ""
    expected: str = ""
    reliability: float = Field(default=0.5, ge=0.0, le=1.0)
    feed_url: str | None = None


class SourcePatch(BaseModel):
    status: SourceStatus | None = None
    category: Category | None = None
    relevance: float | None = Field(default=None, ge=0.0, le=1.0)
    name: str | None = None
    expected: str | None = None


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


# --------------------------------------------------------------------------- #
# Brief (Phase 6)
# --------------------------------------------------------------------------- #
class SectionProse(BaseModel):
    body: str = Field(description="2-5 factual sentences drawn only from the cited records")
    record_ids: list[int] = Field(
        default_factory=list, description="Every record id the sentences rely on"
    )


class BriefAction(BaseModel):
    action: str = Field(description="Concrete next action")
    owner: str = Field(default="Founder")
    why: str = Field(default="")
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
    actions: list[BriefAction] = Field(default_factory=list, max_length=6)
