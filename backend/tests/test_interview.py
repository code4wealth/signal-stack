"""Phase 3 tests: question generation, skip, edit, resume, follow-up rules, persistence."""

from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import interview
from db import Base, Company, QA
from schemas import FollowUpDecision, InterviewQuestion, QuestionBatch

QUESTIONS = [
    "TEST how do you price the platform today across the different customer tiers?",
    "TEST which customer segment generates the largest share of recurring revenue?",
    "TEST who do you lose the most deals to and what is their main advantage?",
    "TEST what single go-to-market channel produced most new logos last quarter?",
    "TEST which regulation or technology shift could most change demand this year?",
    "TEST what stops a well funded entrant from copying the product in a year?",
    "TEST what internal bottleneck slows delivery of the roadmap right now?",
    "TEST what are the three priorities for the next four quarters?",
    "TEST which metric do you watch weekly to judge commercial health?",
    "TEST what development in the next six months would hurt the business most?",
    "TEST how long does a typical enterprise sales cycle take end to end?",
    "TEST which integrations are most requested by prospects who do not convert?",
]


@pytest.fixture
def engine_bundle():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    maker = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    session = maker()
    yield session, maker
    session.close()


def make_company(session, with_profile: bool = True) -> Company:
    company = Company(
        name="TEST_Beta",
        website="https://beta.test/",
        context="TEST context",
        profile={"summary": "TEST_Beta sells workflow tooling.", "industry": "software"} if with_profile else None,
    )
    session.add(company)
    session.commit()
    return company


FOLLOWUPS = [
    "Which specific customer segment pays the highest annual contract value today?",
    "What percentage of revenue came from your largest single customer last year?",
    "Which competitor won the last three deals you lost, and what did they offer?",
    "How many full-time engineers currently work on the platform?",
    "What is the average enterprise sales cycle length in days right now?",
]


def fake_llm(monkeypatch, batch_size: int = 12, followups: list[str] | None = None, followup_flag: bool = True):
    """Deterministic stand-in for llm.ask; records every call."""
    calls: list[str] = []
    followups = followups if followups is not None else FOLLOWUPS

    def ask(prompt, model_cls, **_kwargs):
        calls.append(model_cls.__name__)
        if model_cls is QuestionBatch:
            return QuestionBatch(
                questions=[InterviewQuestion(question=q) for q in QUESTIONS[:batch_size]]
            )
        if model_cls is FollowUpDecision:
            index = max(0, calls.count("FollowUpDecision") - 1)
            question = followups[min(index, len(followups) - 1)]
            return FollowUpDecision(followup=followup_flag, question=question)
        raise AssertionError(f"unexpected model {model_cls}")

    monkeypatch.setattr("llm.ask", ask)
    return calls


# --------------------------------------------------------------------------- #
# Start
# --------------------------------------------------------------------------- #
def test_start_creates_exactly_ten_questions(engine_bundle, monkeypatch) -> None:
    session, _ = engine_bundle
    company = make_company(session)
    fake_llm(monkeypatch)

    state = interview.start(session, company)

    assert len(state["questions"]) == 10
    assert state["current_idx"] == 0
    assert state["started"] is True
    assert session.query(QA).filter_by(company_id=company.id).count() == 10


def test_start_is_idempotent_and_resumes(engine_bundle, monkeypatch) -> None:
    session, _ = engine_bundle
    company = make_company(session)
    calls = fake_llm(monkeypatch)

    interview.start(session, company)
    again = interview.start(session, company)

    assert calls.count("QuestionBatch") == 1, "second start must not regenerate questions"
    assert len(again["questions"]) == 10


def test_start_requires_research_first(engine_bundle, monkeypatch) -> None:
    session, _ = engine_bundle
    company = make_company(session, with_profile=False)
    fake_llm(monkeypatch)

    with pytest.raises(interview.InterviewError, match="Run company research"):
        interview.start(session, company)


# --------------------------------------------------------------------------- #
# Answer / skip / edit
# --------------------------------------------------------------------------- #
def test_answer_advances_and_persists(engine_bundle, monkeypatch) -> None:
    session, _ = engine_bundle
    company = make_company(session)
    fake_llm(monkeypatch)
    interview.start(session, company)

    state = interview.answer(
        session,
        company,
        idx=0,
        text="We charge a per-seat subscription and most contracts run twelve months with annual uplifts.",
    )

    assert state["answered"] == 1
    assert state["current_idx"] == 1
    assert state["questions"][0]["answer"].startswith("We charge a per-seat")


def test_skip_marks_and_advances(engine_bundle, monkeypatch) -> None:
    session, _ = engine_bundle
    company = make_company(session)
    fake_llm(monkeypatch)
    interview.start(session, company)

    state = interview.answer(session, company, idx=0, text=None, skip=True)

    assert state["skipped"] == 1
    assert state["current_idx"] == 1
    assert state["questions"][0]["skipped"] is True


def test_answer_requires_text_or_skip(engine_bundle, monkeypatch) -> None:
    session, _ = engine_bundle
    company = make_company(session)
    fake_llm(monkeypatch)
    interview.start(session, company)

    with pytest.raises(interview.InterviewError, match="empty"):
        interview.answer(session, company, idx=0, text="   ")


def test_cannot_answer_same_question_twice(engine_bundle, monkeypatch) -> None:
    session, _ = engine_bundle
    company = make_company(session)
    fake_llm(monkeypatch)
    interview.start(session, company)
    interview.answer(session, company, idx=0, text="We focus on mid-market logistics firms with 200+ trucks today.")

    with pytest.raises(interview.InterviewError, match="already answered"):
        interview.answer(session, company, idx=0, text="Trying again")


def test_edit_answer_overwrites(engine_bundle, monkeypatch) -> None:
    session, _ = engine_bundle
    company = make_company(session)
    fake_llm(monkeypatch)
    interview.start(session, company)
    interview.answer(session, company, idx=0, text="Our pricing is enterprise-only and negotiated annually per site.")

    qa_id = session.query(QA).filter_by(company_id=company.id, idx=0).one().id
    state = interview.edit_answer(session, company, qa_id, "Corrected: usage-based pricing with a platform fee.")

    assert state["questions"][0]["answer"].startswith("Corrected: usage-based")


def test_unknown_idx_and_foreign_answer_are_404_style(engine_bundle, monkeypatch) -> None:
    session, _ = engine_bundle
    company = make_company(session)
    other = make_company(session)
    fake_llm(monkeypatch)
    interview.start(session, company)

    with pytest.raises(LookupError):
        interview.answer(session, company, idx=99, text="hello")

    other_qa = QA(company_id=other.id, idx=0, question="Other?", answer="yes it is answered now")
    session.add(other_qa)
    session.commit()
    with pytest.raises(LookupError):
        interview.edit_answer(session, company, other_qa.id, "hijack")


# --------------------------------------------------------------------------- #
# Follow-up rules
# --------------------------------------------------------------------------- #
def test_vague_answer_triggers_followup(engine_bundle, monkeypatch) -> None:
    session, _ = engine_bundle
    company = make_company(session)
    fake_llm(monkeypatch, followups=["Which specific customer segment pays the highest contract value?"])

    interview.start(session, company)
    state = interview.answer(session, company, idx=0, text="Not sure, various things.")

    assert state["followups_used"] == 1
    assert state["questions"][1]["is_followup"] is True
    assert state["questions"][1]["question"].startswith("Which specific customer segment")
    assert len(state["questions"]) == 11
    # the original question 1 got shifted down
    assert state["questions"][2]["question"] == QUESTIONS[1]


def test_specific_answer_does_not_call_llm_for_followup(engine_bundle, monkeypatch) -> None:
    session, _ = engine_bundle
    company = make_company(session)
    calls = fake_llm(monkeypatch)
    interview.start(session, company)

    interview.answer(
        session,
        company,
        idx=0,
        text="Roughly 60 percent of revenue comes from EU logistics operators on 12-month contracts.",
    )

    assert "FollowUpDecision" not in calls


def test_followup_never_repeats_a_question(engine_bundle, monkeypatch) -> None:
    session, _ = engine_bundle
    company = make_company(session)
    fake_llm(monkeypatch, followups=[QUESTIONS[2]])  # deliberately a repeat of a main question
    interview.start(session, company)

    state = interview.answer(session, company, idx=0, text="Not sure.")

    assert state["followups_used"] == 0
    assert len(state["questions"]) == 10


def test_followups_capped_at_three(engine_bundle, monkeypatch) -> None:
    session, _ = engine_bundle
    company = make_company(session)
    fake_llm(monkeypatch)  # three distinct follow-ups available

    interview.start(session, company)
    for _ in range(5):
        state = interview.state(session, company)
        current = state["current_idx"]
        if current is None:
            break
        state = interview.answer(session, company, idx=current, text="Not sure.")

    assert state["followups_used"] == interview.MAX_FOLLOWUPS


# --------------------------------------------------------------------------- #
# Complete + persistence
# --------------------------------------------------------------------------- #
def test_complete_merges_answers_into_profile(engine_bundle, monkeypatch) -> None:
    session, _ = engine_bundle
    company = make_company(session)
    fake_llm(monkeypatch)
    interview.start(session, company)
    interview.answer(session, company, idx=0, text="We sell to mid-market logistics operators on annual contracts.")
    interview.answer(session, company, idx=1, text=None, skip=True)

    intelligence = interview.complete(session, company)

    assert intelligence["answered"] == 1
    assert intelligence["skipped"] == 1
    assert intelligence["founder_answers"][0]["answer"].startswith("We sell to mid-market")
    assert "completed_at" in intelligence
    session.refresh(company)
    assert company.profile["intelligence"]["answered"] == 1
    assert company.profile["summary"] == "TEST_Beta sells workflow tooling."


def test_complete_requires_answers(engine_bundle, monkeypatch) -> None:
    session, _ = engine_bundle
    company = make_company(session)
    fake_llm(monkeypatch)
    interview.start(session, company)

    with pytest.raises(interview.InterviewError, match="No answers yet"):
        interview.complete(session, company)


def test_answers_survive_a_new_session_and_engine(engine_bundle, monkeypatch) -> None:
    """AC4: persistence across a server restart, simulated with a fresh ORM session."""
    session, maker = engine_bundle
    company = make_company(session)
    fake_llm(monkeypatch)
    interview.start(session, company)
    interview.answer(session, company, idx=0, text="We win on integration depth with existing warehouse systems.")

    fresh = maker()  # same engine, brand-new session == new request after restart
    try:
        reloaded = fresh.get(Company, company.id)
        state = interview.state(fresh, reloaded)
        assert state["questions"][0]["answer"] == "We win on integration depth with existing warehouse systems."
        assert state["current_idx"] == 1
    finally:
        fresh.close()
