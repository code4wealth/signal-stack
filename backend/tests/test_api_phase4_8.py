"""API tests for Phases 4, 6 and 8: sources, discovery, uploads, context, reports."""

from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient

import db as db_module
import discovery
import main
from db import Record, Source
from safe_fetch import FetchFailed, FetchResult
from schemas import BriefAction, BriefDraft, DiscoveryBatch, DiscoveredSource, SectionProse
from context import RelevanceBatch, RelevanceItem


@pytest.fixture(scope="module")
def client():
    with TestClient(main.app) as test_client:
        yield test_client


@pytest.fixture
def company(client):
    response = client.post(
        "/api/companies",
        json={
            "name": "TEST_Api Co",
            "website": "https://api.test",
            "context": "University discovery and admission assistance",
        },
    )
    assert response.status_code == 201
    return response.json()


def insert_source(company_id: int, **kw) -> int:
    session = db_module.SessionLocal()
    try:
        source = Source(
            company_id=company_id,
            name=kw.get("name", "TEST source"),
            url=kw.get("url", "https://api.test/news"),
            category=kw.get("category", "market"),
            status=kw.get("status", "pending"),
            reliability=kw.get("reliability", 0.7),
        )
        session.add(source)
        session.commit()
        return source.id
    finally:
        session.close()


def insert_record(company_id: int, source_id: int, **kw) -> int:
    session = db_module.SessionLocal()
    try:
        record = Record(
            company_id=company_id,
            source_id=source_id,
            url=kw.get("url", "https://api.test/article"),
            title=kw.get("title", "TEST analysed record"),
            text="The regulator opened a consultation on admissions marketing.",
            content_hash=kw.get("content_hash", "d41d8cd98f00b204e9800998ecf8427e" + str(source_id)),
            total=kw.get("total", 71.5),
            analysis={
                "title": kw.get("title", "TEST analysed record"),
                "summary": "A consultation on admissions marketing started.",
                "evidence_snippet": "The regulator opened a consultation",
                "evidence_verbatim": True,
                "evidence_strength": 0.8,
                "strategic_relevance": 0.6,
                "source_reliability": 0.7,
            },
            scores={"total": kw.get("total", 71.5), "explanation": "Score 71.50/100 = relevance 0.80 ..."},
        )
        session.add(record)
        session.commit()
        return record.id
    finally:
        session.close()


# --------------------------------------------------------------------------- #
# Sources: approve / reject / pause / delete
# --------------------------------------------------------------------------- #
def test_source_lifecycle(client, company) -> None:
    source_id = insert_source(company["id"], name="TEST lifecycle")

    approved = client.post(f"/api/sources/{source_id}/approve")
    assert approved.status_code == 200 and approved.json()["status"] == "approved"

    paused = client.patch(f"/api/sources/{source_id}", json={"status": "paused"})
    assert paused.status_code == 200 and paused.json()["status"] == "paused"

    rejected = client.patch(f"/api/sources/{source_id}", json={"status": "rejected"})
    assert rejected.json()["status"] == "rejected"

    listed = client.get(f"/api/companies/{company['id']}/sources").json()
    assert listed["counts_by_status"]["rejected"] >= 1

    deleted = client.delete(f"/api/sources/{source_id}")
    assert deleted.status_code == 204
    assert client.delete(f"/api/sources/{source_id}").status_code == 404


def test_add_source_requires_a_real_fetch(client, company, monkeypatch) -> None:
    monkeypatch.setattr(
        discovery, "verify_candidate", lambda url: (False, "blocked: private address", url, None)
    )
    response = client.post(
        f"/api/companies/{company['id']}/sources",
        json={"name": "TEST unreachable", "url": "https://nope.test/x", "category": "market"},
    )
    assert response.status_code == 400
    assert "could not be fetched" in response.json()["detail"]


def test_add_source_stores_verified_source_as_pending(client, company, monkeypatch) -> None:
    monkeypatch.setattr(
        discovery,
        "verify_candidate",
        lambda url: (True, "http 200", "https://ok.test/blog", "https://ok.test/feed.xml"),
    )
    response = client.post(
        f"/api/companies/{company['id']}/sources",
        json={"name": "TEST verified", "url": "https://ok.test/blog", "category": "market"},
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "pending"
    assert body["feed_url"] == "https://ok.test/feed.xml"


# --------------------------------------------------------------------------- #
# Discovery
# --------------------------------------------------------------------------- #
def test_discovery_drops_unverified_candidates(client, company, monkeypatch) -> None:
    session = db_module.SessionLocal()
    try:
        stored = session.get(db_module.Company, company["id"])
        stored.profile = {"summary": "TEST summary", "likely_competitors": []}
        session.commit()
    finally:
        session.close()

    monkeypatch.setattr(
        "llm.ask",
        lambda *a, **k: DiscoveryBatch(
            sources=[
                DiscoveredSource(name="TEST ok", url="https://ok.test/a", category="market", reliability=0.7),
                DiscoveredSource(name="TEST dead", url="https://dead.test/b", category="customers"),
                DiscoveredSource(name="TEST weird", url="ftp://bad.test/c", category="market"),
            ]
        ),
    )

    def fake_verify(url):
        if url == "https://ok.test/a":
            return True, "http 200", url, None
        return False, "fetch failed: timeout", url, None

    monkeypatch.setattr(discovery, "verify_candidate", fake_verify)

    response = client.post(f"/api/companies/{company['id']}/sources/discover")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["created_count"] == 1
    assert body["dropped_count"] == 2
    assert body["created"][0]["url"] == "https://ok.test/a"
    assert body["created"][0]["category"] == "market"


def test_discovery_needs_a_profile(client) -> None:
    fresh = client.post("/api/companies", json={"name": "TEST NoProfile", "website": "https://np.test"}).json()
    response = client.post(f"/api/companies/{fresh['id']}/sources/discover")
    assert response.status_code == 400
    assert "research" in response.json()["detail"].lower()


# --------------------------------------------------------------------------- #
# Context reassessment
# --------------------------------------------------------------------------- #
def test_context_reassess_flags_low_relevance_without_deleting(client, company, monkeypatch) -> None:
    keep = insert_source(company["id"], name="TEST keep", url="https://keep.test/a")
    drop = insert_source(company["id"], name="TEST drop", url="https://drop.test/b")

    monkeypatch.setattr(
        "llm.ask",
        lambda *a, **k: RelevanceBatch(
            items=[
                RelevanceItem(source_id=keep, relevance=0.9, reason="Directly about international recruitment."),
                RelevanceItem(source_id=drop, relevance=0.15, reason="Only about domestic admissions."),
                RelevanceItem(source_id=999999, relevance=0.5, reason="invented id"),
            ]
        ),
    )
    monkeypatch.setattr(discovery, "discover", lambda db, c: {
        "created_count": 0, "dropped_count": 0, "counts_by_category": {}, "created": [], "dropped": []
    })

    response = client.post(
        f"/api/companies/{company['id']}/context/reassess",
        json={"context": "International student recruitment and overseas education consultancy"},
    )
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["new_context"].startswith("International student recruitment")
    assert body["scored"] == 2, "invented source id must be ignored"
    assert [item["source_id"] for item in body["recommended_removal"]] == [drop]

    session = db_module.SessionLocal()
    try:
        assert session.get(Source, drop) is not None, "reassessment must never auto-delete"
        assert session.get(Source, drop).relevance == 0.15
        assert session.get(Source, drop).relevance_reason.startswith("Only about domestic")
        assert session.get(db_module.Company, company["id"]).context.startswith("International")
    finally:
        session.close()


def test_context_reassess_rejects_empty_context(client, company) -> None:
    response = client.post(f"/api/companies/{company['id']}/context/reassess", json={"context": "  "})
    assert response.status_code == 422  # min_length validation


# --------------------------------------------------------------------------- #
# Documents
# --------------------------------------------------------------------------- #
def test_upload_txt_is_labelled_user_provided(client, company) -> None:
    response = client.post(
        f"/api/companies/{company['id']}/documents",
        files={"file": ("meeting-notes.txt", b"Founder notes: pipeline is concentrated on three university partners.", "text/plain")},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["label"] == "user-provided"
    assert body["filename"] == "meeting-notes.txt"

    listed = client.get(f"/api/companies/{company['id']}/documents").json()
    assert listed["total"] == 1


def test_upload_rejects_wrong_extension_and_binary(client, company) -> None:
    pdf = client.post(
        f"/api/companies/{company['id']}/documents",
        files={"file": ("deck.pdf", b"%PDF-1.4 not allowed", "application/pdf")},
    )
    assert pdf.status_code == 400 and "only .txt and .csv" in pdf.json()["detail"]

    binary = client.post(
        f"/api/companies/{company['id']}/documents",
        files={"file": ("bin.txt", b"\x00\x01\x02binary", "text/plain")},
    )
    assert binary.status_code == 400


def test_upload_rejects_oversize(client, company) -> None:
    payload = b"x" * (2 * 1024 * 1024 + 10)
    response = client.post(
        f"/api/companies/{company['id']}/documents",
        files={"file": ("big.txt", payload, "text/plain")},
    )
    assert response.status_code == 400 and "2 MB" in response.json()["detail"]


def test_upload_rejects_duplicate(client, company) -> None:
    payload = b"Duplicate document body that is comfortably longer than forty characters."
    first = client.post(f"/api/companies/{company['id']}/documents", files={"file": ("dup.txt", payload, "text/plain")})
    assert first.status_code == 201
    second = client.post(f"/api/companies/{company['id']}/documents", files={"file": ("dup2.txt", payload, "text/plain")})
    assert second.status_code == 400 and "already uploaded" in second.json()["detail"]


def test_upload_csv_is_parsed_into_labelled_rows(client, company) -> None:
    csv_bytes = b"customer,arr,renewal\nTEST_One,12000,2026-04\nTEST_Two,9000,2026-07\n"
    response = client.post(
        f"/api/companies/{company['id']}/documents",
        files={"file": ("pipeline.csv", csv_bytes, "text/csv")},
    )
    assert response.status_code == 201, response.text
    assert response.json()["characters"] > 40


# --------------------------------------------------------------------------- #
# Reports
# --------------------------------------------------------------------------- #
def test_report_generation_requires_records(client, company) -> None:
    fresh = client.post("/api/companies", json={"name": "TEST NoRecords", "website": "https://nr.test"}).json()
    response = client.post(f"/api/companies/{fresh['id']}/reports/generate")
    assert response.status_code == 400
    assert "No analysed records" in response.json()["detail"]


def test_report_roundtrip_citations_export_and_actions(client, company, monkeypatch) -> None:
    source_id = insert_source(company["id"], name="TEST report source", url="https://rep.test/feed",
                              category="market", status="approved")
    record_id = insert_record(company["id"], source_id)

    def fake_ask(prompt, model_cls, **_kwargs):
        return BriefDraft(
            executive_summary="One verified development: a regulator opened a consultation.",
            executive_record_ids=[record_id, 987654],
            market_shifts=SectionProse(body="The regulator opened a consultation.", record_ids=[record_id]),
            customer_signals=SectionProse(body="", record_ids=[]),
            competitor_moves=SectionProse(body="", record_ids=[]),
            founder_intelligence=SectionProse(body="", record_ids=[]),
            strategic_implications=SectionProse(body="Review admissions marketing claims.", record_ids=[record_id]),
            risks_watchlist=SectionProse(body="", record_ids=[]),
            actions=[BriefAction(action="Draft a response to the consultation", record_ids=[record_id])],
        )

    monkeypatch.setattr("llm.ask", fake_ask)

    created = client.post(f"/api/companies/{company['id']}/reports/generate")
    assert created.status_code == 201, created.text
    report = created.json()
    report_id = report["id"]

    citations = {rid for section in report["content"]["sections"] for rid in section["record_ids"]}
    assert citations == {record_id}, "invented citation ids must be stripped"

    session = db_module.SessionLocal()
    try:
        assert session.get(Record, list(citations)[0]) is not None
        assert session.get(db_module.Report, report_id) is not None
    finally:
        session.close()

    history = client.get(f"/api/companies/{company['id']}/reports").json()
    assert any(item["id"] == report_id for item in history["items"])

    export = client.get(f"/api/reports/{report_id}/export")
    assert export.status_code == 200
    assert "attachment; filename=" in export.headers["content-disposition"]
    assert "## Executive Summary" in export.text
    assert "No meaningful verified development was identified during this monitoring period." in export.text

    toggled = client.patch(f"/api/reports/{report_id}/actions/0", json={"done": True})
    assert toggled.status_code == 200
    assert toggled.json()["actions"][0]["done"] is True

    stored = client.get(f"/api/reports/{report_id}").json()
    assert stored["content"]["actions"][0]["done"] is True

    bad_index = client.patch(f"/api/reports/{report_id}/actions/9", json={"done": True})
    assert bad_index.status_code == 404


def test_intelligence_and_signal_detail_expose_explanation(client, company) -> None:
    source_id = insert_source(company["id"], name="TEST intel source", url="https://intel.test/feed",
                              category="market", status="approved")
    record_id = insert_record(company["id"], source_id, title="TEST intel record", total=64.0)

    intel = client.get(f"/api/companies/{company['id']}/intelligence").json()
    match = next(item for item in intel["items"] if item["id"] == record_id)
    assert match["explanation"]
    assert match["scores"]["total"] == 64.0

    signal = client.get(f"/api/signals/{record_id}")
    assert signal.status_code == 200
    assert signal.json()["evidence_verbatim"] is True


def test_job_logs_endpoint_lists_automation_runs(client, company) -> None:
    session = db_module.SessionLocal()
    try:
        session.add(db_module.JobLog(company_id=company["id"], job="weekly", status="ok", detail='{"report_id": 1}'))
        session.commit()
    finally:
        session.close()

    logs = client.get(f"/api/companies/{company['id']}/job-logs").json()
    assert any(item["job"] == "weekly" for item in logs["items"])
