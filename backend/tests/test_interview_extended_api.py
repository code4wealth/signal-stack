from __future__ import annotations

from fastapi.testclient import TestClient

import db
import main
from schemas import FollowUpDecision, InterviewQuestion, QuestionBatch


def test_extended_interview_endpoints(monkeypatch) -> None:
    import llm

    topics_questions = [
        "What makes your core workflow impossible for buyers to replicate in spreadsheets?",
        "Which exact buyer persona signs the annual contract in mid-market accounts?",
        "How do you structure expansion pricing across seats and usage tiers?",
        "Which inbound or outbound channel drives the highest pipeline conversion rate?",
        "Who do your account executives lose competitive bake-offs against most often?",
        "Which regulatory compliance mandates are accelerating customer procurement?",
        "What proprietary telemetry gives your product a durable data advantage?",
        "Where is your engineering or onboarding team currently bottlenecked?",
        "Which single north-star retention metric matters most over twelve months?",
        "What sudden competitive shift in the next six months would hurt pipeline most?",
    ]

    def fake_ask(prompt: str, schema, **kwargs):
        if schema is QuestionBatch:
            return QuestionBatch(
                questions=[
                    InterviewQuestion(
                        question=q,
                        topic="Customers" if i % 2 == 0 else "Growth",
                        why_asking="Found on your homepage.",
                        evidence_urls=["https://acme.example"],
                        suggested_answers=["Mid-market B2B buyers."],
                    )
                    for i, q in enumerate(topics_questions)
                ]
            )
        if schema is FollowUpDecision:
            return FollowUpDecision(followup=False, question="")
        raise AssertionError(f"Unexpected schema {schema}")

    monkeypatch.setattr(llm, "ask", fake_ask)

    with TestClient(main.app) as client:
        company = client.post(
            "/api/companies",
            json={"name": "TEST_Acme Co", "website": "https://acme.example", "context": "B2B tools"},
        ).json()
        cid = company["id"]

        try:
            client.patch(
                f"/api/companies/{cid}",
                json={"summary": "Acme builds verified B2B workflows."},
            )

            started = client.post(f"/api/companies/{cid}/interview/start")
            assert started.status_code == 200
            body = started.json()
            assert body["status"] == "in_progress"
            assert body["totalQuestions"] == 10
            assert len(body["turns"]) == 10
            assert body["turns"][0]["topic"] == "Customers"
            assert body["turns"][0]["whyAsking"] == "Found on your homepage."
            assert body["turns"][0]["suggestedAnswers"] == ["Mid-market B2B buyers."]

            answered = client.post(
                f"/api/companies/{cid}/interview/answer",
                json={
                    "turnIndex": 0,
                    "text": "We sell annual contracts to mid-market engineering leaders in North America.",
                    "quotedText": "impossible for buyers",
                },
            )
            assert answered.status_code == 200
            ans_body = answered.json()
            assert ans_body["currentIndex"] == 1
            assert ans_body["turns"][0]["answer"]["quotedText"] == "impossible for buyers"
            assert len(ans_body["learned"]) == 1
            assert ans_body["learned"][0]["sourceTurnIndex"] == 0

            skipped = client.post(
                f"/api/companies/{cid}/interview/skip",
                json={"turnIndex": 1},
            )
            assert skipped.status_code == 200
            skip_body = skipped.json()
            assert skip_body["turns"][1]["answer"]["skipped"] is True
            assert skip_body["currentIndex"] == 2

            edited = client.patch(
                f"/api/companies/{cid}/interview/answers/0",
                json={"text": "Updated: we sell multi-year enterprise contracts globally."},
            )
            assert edited.status_code == 200
            edit_body = edited.json()
            assert edit_body["regeneratedFrom"] == 1
            assert edit_body["turns"][0]["answer"]["editedAt"] is not None
            assert "multi-year enterprise" in edit_body["learned"][0]["text"]

            reset_res = client.post(f"/api/companies/{cid}/interview/reset")
            assert reset_res.status_code == 200
            reset_body = reset_res.json()
            assert reset_body["status"] == "not_started"
            assert reset_body["turns"] == []
            assert reset_body["learned"] == []
        finally:
            with db.SessionLocal() as session:
                row = session.get(db.Company, cid)
                if row is not None:
                    session.delete(row)
                    session.commit()
