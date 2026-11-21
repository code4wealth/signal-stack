"""Offline end-to-end pipeline test driven through real FastAPI endpoints.

Starts a local ThreadingHTTPServer serving TEST_-labelled HTML, RSS, and
robots.txt fixtures and uses a deterministic fake LLM to verify the entire
pipeline end-to-end without real internet or Groq calls.
"""

from __future__ import annotations

import http.server
import re
import socketserver
import threading
from urllib.parse import urlparse

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

import brief as brief_module
import context as context_module
import db
import main
import safe_fetch
from schemas import (
    Analysis,
    BriefAction,
    BriefDraft,
    CompetitorHint,
    DiscoveredSource,
    DiscoveryBatch,
    Fact,
    FollowUpDecision,
    InterviewQuestion,
    Profile,
    QuestionBatch,
    SectionProse,
)

EMPTY_SENTENCE = "No meaningful verified development was identified during this monitoring period."

FIXTURE_PAGES: dict[str, tuple[str, str]] = {
    "/robots.txt": ("text/plain", "User-agent: *\nAllow: /\n"),
    "/": (
        "text/html",
        """<!doctype html><html><head><title>TEST_Acme Home</title></head><body>
        <h1>TEST_Acme Workflow Platform</h1>
        <p>TEST_Acme builds automated invoice reconciliation and B2B workflow tooling for finance teams across India and Europe. Over 200 enterprise controllers rely on TEST_Acme daily to automate settlement checks and audit trails.</p>
        <nav><a href="/about">About</a> <a href="/pricing">Pricing</a></nav>
        </body></html>""",
    ),
    "/about": (
        "text/html",
        """<!doctype html><html><head><title>TEST_Acme About</title></head><body>
        <h1>About TEST_Acme</h1>
        <p>Founded in Bengaluru, TEST_Acme helps mid-market finance operations teams automate invoice reconciliation, exception routing, and monthly ERP ledger close with verified audit logs, multi-entity approvals, and automated regulatory compliance checks across India and Europe.</p>
        <p>Our engineering and customer operations teams support over two hundred enterprise finance departments running daily settlement matching, tax validation, and variance alerts.</p>
        </body></html>""",
    ),
    "/pricing": (
        "text/html",
        """<!doctype html><html><head><title>TEST_Acme Pricing</title></head><body>
        <h1>TEST_Acme Pricing</h1>
        <p>Starter plans begin at 499 USD monthly for up to ten entities with automated bank feeds and invoice matching, while Growth plans support fifty entities and automated approval routing across distributed finance controllers.</p>
        <p>Enterprise offers dedicated SLA guarantees, SOC2 audit exports, and custom ERP connectors for high-volume finance teams managing complex cross-border reconciliation.</p>
        </body></html>""",
    ),
    "/market-feed.xml": (
        "application/rss+xml",
        """<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0"><channel>
          <title>TEST_Market Regulatory Feed</title>
          <link>https://market.test/market-feed.xml</link>
          <description>TEST_Market updates</description>
          <item>
            <title>TEST_Regulator mandates e-invoice audit trails by Q3</title>
            <link>https://market.test/e-invoice-mandate</link>
            <pubDate>Thu, 19 Nov 2026 09:00:00 GMT</pubDate>
            <description>TEST_Regulator announced mandatory structured e-invoice audit trails for mid-market firms starting Q3, requiring automated reconciliation records.</description>
          </item>
          <item>
            <title>TEST_Industry survey finds 68 percent automate close</title>
            <link>https://market.test/survey-close</link>
            <pubDate>Wed, 18 Nov 2026 09:00:00 GMT</pubDate>
            <description>TEST_Industry benchmark reports 68 percent of CFOs are prioritizing automated invoice reconciliation tools this quarter.</description>
          </item>
        </channel></rss>""",
    ),
    "/e-invoice-mandate": (
        "text/html",
        """<!doctype html><html><head><title>TEST_Regulator e-invoice mandate</title></head><body>
        <article>
          <h1>TEST_Regulator mandates structured e-invoice audit trails by Q3</h1>
          <p>TEST_Regulator announced mandatory structured e-invoice audit trails for mid-market firms starting Q3, requiring automated reconciliation records, immutable content hashes, and verifiable settlement timestamps across cross-border B2B suppliers and enterprise finance teams.</p>
          <p>Compliance officers must demonstrate automated exception logs and ledger traceability before the Q3 enforcement deadline.</p>
        </article>
        </body></html>""",
    ),
    "/survey-close": (
        "text/html",
        """<!doctype html><html><head><title>TEST_Industry survey</title></head><body>
        <article>
          <h1>TEST_Industry survey finds 68 percent automate close</h1>
          <p>TEST_Industry benchmark reports 68 percent of CFOs are prioritizing automated invoice reconciliation tools this quarter to cut month-end close delays, reduce manual spreadsheet errors, and enforce consistent audit-ready ERP approvals across regional subsidiaries.</p>
          <p>Mid-market finance leaders cited regulatory e-invoicing readiness as their top software purchase trigger.</p>
        </article>
        </body></html>""",
    ),
    "/competitor-news": (
        "text/html",
        """<!doctype html><html><head><title>TEST_Rival Pricing Update</title></head><body>
        <article>
          <h1>TEST_Rival raises enterprise tier pricing by 15 percent</h1>
          <p>TEST_Rival updated its public pricing page today, increasing enterprise tier minimums by 15 percent and dropping its self-serve onboarding tier for smaller finance teams, pushing mid-market controllers to evaluate predictable reconciliation alternatives.</p>
          <p>Existing annual contracts will transition to the revised minimum seat schedule upon renewal next quarter.</p>
        </article>
        </body></html>""",
    ),
}


class _FixtureHandler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802
        path = urlparse(self.path).path or "/"
        entry = FIXTURE_PAGES.get(path)
        if entry is None:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Not found")
            return
        content_type, body = entry
        payload = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, format, *args):  # noqa: A002
        return


class _ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


@pytest.fixture()
def local_fixture_server(monkeypatch):
    server = _ThreadingHTTPServer(("127.0.0.1", 0), _FixtureHandler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    allowed_hosts = {"public.test", "market.test", "rival.test"}
    orig_resolve = safe_fetch.dns_resolve

    def fake_resolve(host: str) -> list[str]:
        if host.lower() in allowed_hosts:
            return ["93.184.216.34"]
        return orig_resolve(host)

    def local_request_once(
        method: str,
        url: str,
        *,
        headers: dict[str, str],
        timeout: float,
        max_bytes: int,
    ) -> tuple[int, dict[str, str], bytes]:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        if host not in allowed_hosts:
            raise safe_fetch.FetchFailed(f"unexpected host in offline test: {host}", url=url)
        target = f"http://127.0.0.1:{port}{parsed.path or '/'}"
        if parsed.query:
            target = f"{target}?{parsed.query}"
        req_headers = {**headers, "Host": host, "User-Agent": safe_fetch.settings.user_agent}
        with httpx.Client(timeout=timeout, follow_redirects=False) as client:
            response = client.request(method, target, headers=req_headers)
            content = response.content[:max_bytes]
            return response.status_code, dict(response.headers), content

    monkeypatch.setattr(safe_fetch, "dns_resolve", fake_resolve)
    monkeypatch.setattr(safe_fetch, "_request_once", local_request_once)

    try:
        yield port
    finally:
        server.shutdown()
        server.server_close()


def _install_fake_llm(monkeypatch):
    def fake_ask(prompt: str, model_cls, **_kwargs):
        if model_cls is Profile:
            return Profile(
                summary="TEST_Acme builds automated invoice reconciliation and B2B workflow tooling.",
                industry="B2B fintech workflow",
                business_model="B2B SaaS subscription",
                value_proposition="Automated invoice reconciliation and ERP audit trails.",
                positioning="Mid-market and enterprise finance operations",
                products=[Fact(text="Automated invoice reconciliation platform", evidence_url="https://public.test/")],
                customers=[Fact(text="Finance operations teams", evidence_url="https://public.test/about")],
                geography=[Fact(text="India and Europe", evidence_url="https://public.test/")],
                differentiators=[Fact(text="SOC2 audit exports and ERP connectors", evidence_url="https://public.test/pricing")],
                growth_opportunities=[Fact(text="Mid-market finance automation demand", evidence_url="https://public.test/about")],
                challenges=[Fact(text="Enterprise onboarding cycles", evidence_url="https://public.test/pricing")],
                likely_competitors=[
                    CompetitorHint(
                        name="TEST_Rival",
                        website="https://rival.test/competitor-news",
                        reason="Public pricing overlap in enterprise reconciliation",
                    )
                ],
                unverified=[],
            )
        if model_cls is QuestionBatch:
            topics = [
                ("Customers", "Which finance personas buy TEST_Acme first?"),
                ("Operations", "Which ERP integrations are hardest to maintain?"),
                ("Market", "What compliance deadline drives Q3 adoption?"),
                ("Competitors", "Where do buyers compare TEST_Acme against TEST_Rival?"),
                ("Growth", "Which enterprise tier features unlock expansion revenue?"),
                ("Goals", "What reconciliation SLA matters most to controllers?"),
                ("Customers", "How long does onboarding take for multi-entity buyers?"),
                ("Operations", "Which audit log exports do external auditors request?"),
                ("Market", "Which regional e-invoicing mandates matter next quarter?"),
                ("Goals", "What metric defines success over the next 90 days?"),
            ]
            return QuestionBatch(
                questions=[
                    InterviewQuestion(
                        question=f"TEST Q{i + 1}: {q}",
                        topic=topic,
                        why_asking=f"Based on researched TEST_Acme evidence for {topic.lower()}.",
                        evidence_urls=["https://public.test/"],
                    )
                    for i, (topic, q) in enumerate(topics)
                ]
            )
        if model_cls is FollowUpDecision:
            return FollowUpDecision(followup=False, question="", topic="", why_asking="")
        if model_cls is DiscoveryBatch:
            return DiscoveryBatch(
                sources=[
                    DiscoveredSource(
                        name="TEST_Market Regulatory Feed",
                        url="https://market.test/market-feed.xml",
                        category="market",
                        reason="Tracks e-invoice regulatory mandates.",
                        expected="Regulatory announcements and industry surveys.",
                        reliability=0.9,
                    )
                ]
            )
        if model_cls is Analysis:
            match = re.search(r"<untrusted_source[^>]*>\n(.*?)\n</untrusted_source>", prompt, re.S)
            raw_text = (match.group(1) if match else "").strip()
            snippet = raw_text[:80].strip() if raw_text else "TEST_evidence"
            return Analysis(
                title="TEST_Signal: " + (snippet[:40] or "Verified development"),
                summary="Verified development grounded in fetched TEST_ fixture text.",
                evidence_snippet=snippet,
                relevance=0.85,
                impact=0.8,
                urgency=0.75,
                strategic_relevance=0.82,
                evidence_strength=0.9,
                category="market",
                classification="opportunity",
                why_it_matters="Directly relevant to TEST_Acme mid-market positioning.",
                recommended_action="Prepare compliance outreach.",
                effort="low",
                timeframe="this week",
            )
        if model_cls is BriefDraft:
            # Parse real record IDs present in prompt JSON lines ("id": 123)
            ids = [int(m.group(1)) for m in re.finditer(r'"id":\s*(\d+)', prompt)]
            first_id = ids[0] if ids else 1
            second_id = ids[1] if len(ids) > 1 else first_id
            return BriefDraft(
                executive_summary="TEST_Acme faces regulatory tailwinds and competitor pricing shifts.",
                executive_record_ids=[first_id, second_id] if first_id != second_id else [first_id],
                # Leave customer_signals empty so PRD empty-category sentence is enforced
                customer_signals=SectionProse(body="", record_ids=[]),
                competitor_moves=SectionProse(
                    body="TEST_Rival raised enterprise tier pricing by 15 percent.",
                    record_ids=[first_id],
                ),
                market_shifts=SectionProse(
                    body="TEST_Regulator mandated e-invoice audit trails.",
                    record_ids=[second_id],
                ),
                founder_intelligence=SectionProse(body="", record_ids=[]),
                strategic_implications=SectionProse(
                    body="Highlight predictable pricing against TEST_Rival.",
                    record_ids=[first_id],
                ),
                risks_watchlist=SectionProse(
                    body="Watch compliance timeline enforcement in Q3.",
                    record_ids=[second_id],
                ),
                actions=[
                    BriefAction(
                        action="Publish e-invoicing compliance comparison guide",
                        owner="Founder",
                        why="Captures buyers evaluating alternatives after TEST_Rival price hike.",
                        record_ids=[first_id],
                    )
                ],
            )
        if model_cls is context_module.RelevanceBatch:
            src_ids = [int(m.group(1)) for m in re.finditer(r'"source_id":\s*(\d+)', prompt)]
            return context_module.RelevanceBatch(
                items=[
                    context_module.RelevanceItem(
                        source_id=sid,
                        relevance=0.85,
                        reason="Still relevant to EU e-invoicing compliance context.",
                    )
                    for sid in src_ids
                ]
            )
        raise AssertionError(f"Unexpected LLM schema in offline E2E test: {model_cls}")

    monkeypatch.setattr("llm.ask", fake_ask)


def test_offline_full_pipeline_e2e(local_fixture_server, monkeypatch) -> None:
    _install_fake_llm(monkeypatch)

    with TestClient(main.app) as client:
        # 1. Create company
        created = client.post(
            "/api/companies",
            json={
                "name": "TEST_Acme",
                "website": "https://public.test/",
                "context": "TEST context: finance reconciliation software",
            },
        )
        assert created.status_code == 201, created.text
        company_id = created.json()["id"]

        # 2. Research company site against local HTTP fixture server
        researched = client.post(f"/api/companies/{company_id}/research")
        assert researched.status_code == 200, researched.text
        res_body = researched.json()
        assert "https://public.test/" in res_body["pages_fetched"]
        assert len(res_body["pages_fetched"]) >= 2

        # 3. Interview start / answer / skip / edit / complete
        started_iv = client.post(f"/api/companies/{company_id}/interview/start")
        assert started_iv.status_code == 200, started_iv.text
        ans0 = client.post(
            f"/api/companies/{company_id}/interview/answer",
            json={"idx": 0, "answer": "TEST answer: mid-market CFOs in India and Europe."},
        )
        assert ans0.status_code == 200, ans0.text
        qa_rows = ans0.json()["questions"]
        qa0_id = qa_rows[0]["id"]

        # Edit answer 0
        edited = client.patch(
            f"/api/interview/answers/{qa0_id}",
            json={"answer": "TEST edited answer: mid-market controllers automating close."},
        )
        assert edited.status_code == 200, edited.text

        # Skip question 1
        skipped = client.post(
            f"/api/companies/{company_id}/interview/answer",
            json={"idx": 1, "skip": True},
        )
        assert skipped.status_code == 200, skipped.text

        completed_iv = client.post(f"/api/companies/{company_id}/interview/complete")
        assert completed_iv.status_code == 200, completed_iv.text

        # 4. Discover sources & approve
        discovered = client.post(f"/api/companies/{company_id}/sources/discover")
        assert discovered.status_code == 200, discovered.text
        disc_data = discovered.json()
        assert disc_data["created_count"] >= 2

        for src in disc_data["created"]:
            approved = client.post(f"/api/sources/{src['id']}/approve")
            assert approved.status_code == 200, approved.text
            assert approved.json()["status"] == "approved"

        # 5. First crawl -> verify fetches complete and URL/timestamp/hash persisted
        crawl1 = client.post(f"/api/companies/{company_id}/crawl")
        assert crawl1.status_code == 200, crawl1.text
        crawl1_data = crawl1.json()
        assert crawl1_data["new_records"] >= 2
        assert crawl1_data["errors"] == 0

        with db.SessionLocal() as session:
            records = session.scalars(select(db.Record).where(db.Record.company_id == company_id)).all()
            assert len(records) >= 2
            real_record_ids = {r.id for r in records}
            for rec in records:
                assert rec.url.startswith("https://")
                assert rec.discovered is not None
                assert rec.content_hash and len(rec.content_hash) == 64

        # 6. Second crawl -> assert 0 new records (deduplication works)
        crawl2 = client.post(f"/api/companies/{company_id}/crawl")
        assert crawl2.status_code == 200, crawl2.text
        assert crawl2.json()["new_records"] == 0

        # 7. Analyse & rank -> check non-empty ranking explanations
        analysed = client.post(f"/api/companies/{company_id}/analyse")
        assert analysed.status_code == 200, analysed.text
        assert analysed.json()["analysed"] >= 2

        intel = client.get(f"/api/companies/{company_id}/intelligence")
        assert intel.status_code == 200, intel.text
        intel_items = intel.json()["items"]
        assert len(intel_items) >= 2
        for item in intel_items:
            assert item["total"] > 0
            assert (item["explanation"] or "").strip() != ""
            assert (item["scores"] or {}).get("explanation", "").strip() != ""

        # 8. Generate brief -> verify cited record IDs & exact empty-category sentence
        gen_report = client.post(f"/api/companies/{company_id}/reports/generate")
        assert gen_report.status_code == 201, gen_report.text
        report_data = gen_report.json()
        report_id = report_data["id"]

        sections = report_data["content"]["sections"]
        assert len(sections) == 11
        for sec in sections:
            assert set(sec["record_ids"]) <= real_record_ids
        customer_sec = next(s for s in sections if s["key"] == "customer_signals")
        assert customer_sec["body"] == EMPTY_SENTENCE
        assert customer_sec["record_ids"] == []

        # Also verify Brief v2 API response includes executiveOverview & real citations
        brief_v2 = client.get(f"/api/companies/{company_id}/briefs/latest")
        assert brief_v2.status_code == 200, brief_v2.text
        assert brief_v2.json()["brief"] is not None
        assert brief_v2.json()["brief"]["executiveOverview"]["text"]

        # 9. Export Markdown
        exported = client.get(f"/api/reports/{report_id}/export")
        assert exported.status_code == 200, exported.text
        assert "text/markdown" in exported.headers["content-type"]
        md_text = exported.text
        assert "# Monday Morning Brief — TEST_Acme" in md_text
        assert EMPTY_SENTENCE in md_text
        for heading in brief_module.SECTION_HEADINGS:
            assert f"## {heading}" in md_text

        # 10. Upload CSV internal document (marked user-provided)
        csv_bytes = (
            b"account,feedback,impact\n"
            b"TEST_Buyer_1,Need automated e-invoice export for Q3 audit compliance,high\n"
            b"TEST_Buyer_2,Multi-entity reconciliation report saves 12 hours weekly,medium\n"
        )
        uploaded = client.post(
            f"/api/companies/{company_id}/internal/upload",
            files={"file": ("test_feedback.csv", csv_bytes, "text/csv")},
            data={"document_type": "customer_feedback"},
        )
        assert uploaded.status_code == 201, uploaded.text
        assert uploaded.json()["label"] == "user-provided"
        assert uploaded.json()["records_created"] == 1

        # 11. Monthly source audit
        audited = client.post(f"/api/companies/{company_id}/source-audit")
        assert audited.status_code == 200, audited.text
        assert audited.json()["checked"] >= 2

        # 12. Context reassess
        reassessed = client.post(
            f"/api/companies/{company_id}/context/reassess",
            json={"context": "TEST context: expanding into EU e-invoicing compliance", "run_discovery": False},
        )
        assert reassessed.status_code == 200, reassessed.text
        assert "EU e-invoicing" in reassessed.json()["new_context"]
        assert reassessed.json()["scored"] >= 2
