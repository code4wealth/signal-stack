"""API-level tests for Phases 2 and 3, exercised through FastAPI's TestClient.

Upstream HTTP is mocked; the LLM is mocked. Everything below the endpoint is the
real code path: routing, validation, SQLite persistence, profile validation.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

import main
import research
from safe_fetch import FetchResult
from schemas import CompetitorHint, Fact, InterviewQuestion, Profile, QuestionBatch

LONG_TEXT = "The company builds workflow software for logistics operators. " * 12


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as test_client:
        yield test_client


def create_company(client: TestClient, name: str = "TEST_Delta") -> dict:
    response = client.post(
        "/api/companies",
        json={"name": name, "website": "https://delta.test", "context": "TEST context"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_create_and_fetch_company(client) -> None:
    created = create_company(client, "TEST_Epsilon")
    assert created["website"] == "https://delta.test"
    assert created["has_profile"] is False

    fetched = client.get(f"/api/companies/{created['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["name"] == "TEST_Epsilon"


def test_create_rejects_non_domain(client) -> None:
    response = client.post(
        "/api/companies", json={"name": "TEST_Bad", "website": "https://notaurl"}
    )
    assert response.status_code == 400
    assert "not a domain" in response.json()["detail"]


def test_missing_company_returns_404_json(client) -> None:
    response = client.get("/api/companies/999999")
    assert response.status_code == 404
    assert response.json()["detail"] == "company 999999 not found"


def test_list_is_paginated(client) -> None:
    for i in range(3):
        create_company(client, f"TEST_Page{i}")
    page = client.get("/api/companies", params={"limit": 2, "offset": 0}).json()
    assert len(page["items"]) == 2
    assert page["total"] >= 3
    assert page["limit"] == 2 and page["offset"] == 0


def test_profile_before_research_is_404(client) -> None:
    company = create_company(client, "TEST_Zeta")
    response = client.get(f"/api/companies/{company['id']}/profile")
    assert response.status_code == 404


def test_research_endpoint_stores_profile(client, monkeypatch) -> None:
    company = create_company(client, "TEST_Eta")

    def fake_fetch(url, **_kwargs):
        return FetchResult(
            url=url, status=200, text=f"<html><title>Delta</title><body>{LONG_TEXT}</body></html>",
            content=b"", content_type="text/html",
        )

    monkeypatch.setattr(research.safe_fetch, "fetch", fake_fetch)
    monkeypatch.setattr(
        "llm.ask",
        lambda *a, **k: Profile(
            summary="TEST_Eta sells workflow software to logistics operators.",
            industry="software",
            products=[Fact(text="Workflow engine", evidence_url="https://delta.test/")],
            unverified=["May expand into freight forwarding"],
            likely_competitors=[CompetitorHint(name="TEST_Rival", website="https://rival.test")],
        ),
    )

    response = client.post(f"/api/companies/{company['id']}/research")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["unverified_count"] == 1
    assert research.normalise_url(body["pages_fetched"][0]) == research.normalise_url("https://delta.test/")

    stored = client.get(f"/api/companies/{company['id']}/profile").json()
    assert stored["summary"].startswith("TEST_Eta")


def test_interview_flow_through_api(client, monkeypatch) -> None:
    company = create_company(client, "TEST_Theta")

    # research first so a profile exists
    def fake_fetch(url, **_kwargs):
        return FetchResult(
            url=url, status=200, text=f"<html><body>{LONG_TEXT}</body></html>",
            content=b"", content_type="text/html",
        )

    monkeypatch.setattr(research.safe_fetch, "fetch", fake_fetch)
    monkeypatch.setattr(
        "llm.ask", lambda *a, **k: Profile(summary="TEST_Theta does routing software.", industry="software")
    )
    assert client.post(f"/api/companies/{company['id']}/research").status_code == 200

    questions = [
        "TEST which buyer persona signs the contract and who influences that decision?",
        "TEST how is the product priced across your different customer tiers today?",
        "TEST which competitor appears most often in deals that you lose?",
        "TEST what single marketing channel generates the most qualified pipeline?",
        "TEST what regulatory change would most affect your customers this year?",
        "TEST what protects the product from being copied by a well funded rival?",
        "TEST what internal constraint slows your engineering roadmap right now?",
        "TEST which three priorities matter most over the next four quarters?",
        "TEST which weekly metric tells you the business is commercially healthy?",
        "TEST what market event in the next six months would hurt you most?",
        "TEST how many days does an enterprise sales cycle take on average?",
        "TEST which integration do prospects request most often before buying?",
    ]
    monkeypatch.setattr(
        "llm.ask",
        lambda *a, **k: QuestionBatch(questions=[InterviewQuestion(question=q) for q in questions]),
    )

    start = client.post(f"/api/companies/{company['id']}/interview/start")
    assert start.status_code == 200
    state = start.json()
    assert len(state["questions"]) == 10 and state["current_idx"] == 0

    # resume: GET returns the same set
    assert client.get(f"/api/companies/{company['id']}/interview").json()["current_idx"] == 0

    # skip question 0
    skipped = client.post(
        f"/api/companies/{company['id']}/interview/answer", json={"idx": 0, "skip": True}
    )
    assert skipped.status_code == 200 and skipped.json()["skipped"] == 1

    # answer question 1 with something specific (no follow-up expected)
    answered = client.post(
        f"/api/companies/{company['id']}/interview/answer",
        json={"idx": 1, "answer": "We charge a flat annual licence per site, billed quarterly in advance."},
    )
    assert answered.status_code == 200
    assert answered.json()["answered"] == 1

    # edit that answer
    qa_id = answered.json()["questions"][1]["id"]
    edited = client.patch(f"/api/interview/answers/{qa_id}", json={"answer": "Edited: usage-based with a floor."})
    assert edited.status_code == 200
    assert edited.json()["questions"][1]["answer"] == "Edited: usage-based with a floor."

    # empty answer is rejected
    bad = client.post(f"/api/companies/{company['id']}/interview/answer", json={"idx": 2, "answer": "  "})
    assert bad.status_code == 400

    complete = client.post(f"/api/companies/{company['id']}/interview/complete")
    assert complete.status_code == 200
    assert complete.json()["intelligence"]["answered"] >= 1


def test_health_reports_six_tables(client) -> None:
    body = client.get("/api/health").json()
    assert body["status"] == "ok"
    assert body["tables"] == ["companies", "job_logs", "qa", "records", "reports", "sources"]
