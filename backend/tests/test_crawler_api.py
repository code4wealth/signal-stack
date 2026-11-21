from __future__ import annotations

import time
from fastapi.testclient import TestClient

import db as db_module
import main
import safe_fetch
from db import Company, Record, Source


def _setup_confirmed_company(monkeypatch) -> tuple[int, int]:
    db_module.init_db()
    with db_module.SessionLocal() as session:
        company = Company(
            name="CrawlTestCo",
            website="https://crawltest.example",
            context="Test crawler company",
            profile={
                "_meta": {
                    "interview_completed": True,
                    "signal_stack_confirmed_at": "2026-11-20T00:00:00+00:00",
                }
            },
        )
        session.add(company)
        session.commit()
        session.refresh(company)

        src = Source(
            company_id=company.id,
            name="Example Blog",
            url="https://blog.crawltest.example/posts",
            category="market",
            source_type="webpage",
            update_frequency="daily",
            status="approved",
            health="ok",
        )
        session.add(src)
        session.commit()
        session.refresh(src)
        company_id, source_id = company.id, src.id

    def fake_fetch(url: str, *, etag=None, last_modified=None, **_kwargs):
        html = (
            "<html><head><title>New Market Report</title></head>"
            "<body><main><p>"
            + ("Signal Stack crawler verification paragraph with plenty of readable content. " * 8)
            + "</p></main></body></html>"
        )
        return safe_fetch.FetchResult(
            url=url,
            status=200,
            text=html,
            content=html.encode("utf-8"),
            content_type="text/html",
            etag='"v1"',
        )

    monkeypatch.setattr(safe_fetch, "fetch", fake_fetch)
    return company_id, source_id


def test_crawler_overview_run_logs_items_and_export(monkeypatch) -> None:
    company_id, source_id = _setup_confirmed_company(monkeypatch)
    with TestClient(main.app) as client:
        # Initial overview
        ov0 = client.get(f"/api/companies/{company_id}/crawler/overview?range=7d")
        assert ov0.status_code == 200
        b0 = ov0.json()
        assert b0["range"] == "7d"
        assert len(b0["daily"]) == 7
        assert b0["etiquette"]["respectsRobots"] is True
        assert b0["etiquette"]["delaySeconds"] > 0

        # Update maxPagesPerRun setting
        cfg_res = client.patch(
            f"/api/companies/{company_id}/crawler/settings",
            json={"maxPagesPerRun": 25},
        )
        assert cfg_res.status_code == 200
        assert cfg_res.json()["maxPagesPerRun"] == 25

        # Start crawl run
        start_res = client.post(
            f"/api/companies/{company_id}/crawler/run",
            json={"sourceIds": [source_id]},
        )
        assert start_res.status_code == 202
        run_id = start_res.json()["id"]

        # Poll until finished
        final_run = None
        for _ in range(40):
            r_res = client.get(f"/api/companies/{company_id}/crawler/runs/{run_id}")
            assert r_res.status_code == 200
            final_run = r_res.json()["run"]
            if final_run["status"] in ("completed", "partial", "failed", "cancelled"):
                break
            time.sleep(0.05)

        assert final_run is not None
        assert final_run["status"] == "completed"
        assert final_run["counts"]["new"] == 1

        # Logs
        logs_res = client.get(f"/api/companies/{company_id}/crawler/runs/{run_id}/logs")
        assert logs_res.status_code == 200
        assert len(logs_res.json()["items"]) >= 2

        # Runs list
        runs_res = client.get(f"/api/companies/{company_id}/crawler/runs?range=7d")
        assert runs_res.status_code == 200
        assert runs_res.json()["total"] >= 1

        # Items list & detail
        items_res = client.get(f"/api/companies/{company_id}/crawler/items")
        assert items_res.status_code == 200
        items = items_res.json()["items"]
        assert len(items) == 1
        item_id = items[0]["id"]

        detail_res = client.get(f"/api/companies/{company_id}/crawler/items/{item_id}")
        assert detail_res.status_code == 200
        assert detail_res.json()["contentHash"] == items[0]["contentHash"]

        # Export CSV
        csv_res = client.get(f"/api/companies/{company_id}/crawler/logs/export?range=7d")
        assert csv_res.status_code == 200
        assert "text/csv" in csv_res.headers["content-type"]
        assert "Started crawl" in csv_res.text

        # Overview reflects updated counts
        ov1 = client.get(f"/api/companies/{company_id}/crawler/overview?range=7d")
        assert ov1.status_code == 200
        assert ov1.json()["totals"]["new"] >= 1
        assert ov1.json()["runsCount"] >= 1


def test_crawler_items_returned_before_analysis_with_pagination_and_filters(monkeypatch) -> None:
    """Reproduces post-crawl empty panel: records must be returned newest-first right after crawl, before analysis."""
    from datetime import datetime, timezone

    db_module.init_db()
    with db_module.SessionLocal() as session:
        company = Company(
            name="MultiCrawlCo",
            website="https://multicrawl.example",
            context="Multi-source crawl test",
            profile={
                "_meta": {
                    "interview_completed": True,
                    "signal_stack_confirmed_at": "2026-11-20T00:00:00+00:00",
                }
            },
        )
        session.add(company)
        session.commit()
        session.refresh(company)

        sources = [
            Source(
                company_id=company.id,
                name="Customer Forum",
                url="https://forum.multicrawl.example/feed",
                feed_url="https://forum.multicrawl.example/rss.xml",
                category="customers",
                source_type="rss",
                update_frequency="daily",
                status="approved",
                health="ok",
            ),
            Source(
                company_id=company.id,
                name="Rival Changelog",
                url="https://rival.multicrawl.example/changelog",
                feed_url="https://rival.multicrawl.example/rss.xml",
                category="competitors",
                source_type="rss",
                update_frequency="daily",
                status="approved",
                health="ok",
            ),
            Source(
                company_id=company.id,
                name="Market Wire",
                url="https://wire.multicrawl.example/news",
                feed_url="https://wire.multicrawl.example/rss.xml",
                category="market",
                source_type="rss",
                update_frequency="daily",
                status="approved",
                health="ok",
            ),
        ]
        session.add_all(sources)
        session.commit()
        for s in sources:
            session.refresh(s)
        company_id = company.id

    # Build 30 distinct items across 3 RSS feeds + homepages (10 per source: 1 homepage + 9 feed articles -> cap 10)
    def fake_fetch(url: str, *, etag=None, last_modified=None, **_kwargs):
        if url.endswith("/rss.xml"):
            host = url.split("/")[2]
            entries = "".join(
                f"<item><title>Feed Story {host} #{i}</title>"
                f"<link>https://{host}/post/{i}</link>"
                f"<description>{'Readable feed summary content for Signal Stack verification. ' * 8}</description></item>"
                for i in range(1, 10)
            )
            xml = f'<?xml version="1.0"?><rss version="2.0"><channel><title>{host}</title>{entries}</channel></rss>'
            return safe_fetch.FetchResult(
                url=url, status=200, text=xml, content=xml.encode("utf-8"), content_type="application/xml"
            )
        html = (
            f"<html><head><title>Page for {url}</title></head>"
            "<body><main><p>"
            + (f"Unique body text for {url}. " * 16)
            + "</p></main></body></html>"
        )
        return safe_fetch.FetchResult(
            url=url, status=200, text=html, content=html.encode("utf-8"), content_type="text/html"
        )

    monkeypatch.setattr(safe_fetch, "fetch", fake_fetch)

    with TestClient(main.app) as client:
        # Budget 30 so all 3 sources can store up to 8 feed + 1 root items = 27 items; bump maxPagesPerRun to 60
        cfg_res = client.patch(f"/api/companies/{company_id}/crawler/settings", json={"maxPagesPerRun": 60})
        assert cfg_res.status_code == 200

        start_res = client.post(f"/api/companies/{company_id}/crawler/run", json={})
        assert start_res.status_code == 202
        run_id = start_res.json()["id"]

        final_run = None
        for _ in range(60):
            r_res = client.get(f"/api/companies/{company_id}/crawler/runs/{run_id}")
            assert r_res.status_code == 200
            final_run = r_res.json()["run"]
            if final_run["status"] in ("completed", "partial", "failed", "cancelled"):
                break
            time.sleep(0.05)

        assert final_run is not None
        assert final_run["status"] == "completed"
        expected_total = final_run["counts"]["new"]
        assert expected_total >= 27

        # Verify records in DB have analysis=None (unanalysed)
        with db_module.SessionLocal() as session:
            db_records = session.query(Record).filter_by(company_id=company_id).all()
            assert len(db_records) == expected_total
            assert all(r.analysis is None for r in db_records)

        # Page 1 (default limit=25)
        p1 = client.get(f"/api/companies/{company_id}/crawler/items")
        assert p1.status_code == 200
        b1 = p1.json()
        assert b1["total"] == expected_total
        assert len(b1["items"]) == 25
        assert b1["nextCursor"] is not None

        # Verify required fields & newest-first ordering
        for it in b1["items"]:
            assert it["title"]
            assert it["domain"]
            assert it["category"] in ("customers", "competitors", "market")
            assert it["fetchedAt"]
            assert it["url"].startswith("https://")
        timestamps = [it["fetchedAt"] for it in b1["items"]]
        assert timestamps == sorted(timestamps, reverse=True)

        # Page 2 via cursor
        p2 = client.get(f"/api/companies/{company_id}/crawler/items?cursor={b1['nextCursor']}")
        assert p2.status_code == 200
        b2 = p2.json()
        assert b2["total"] == expected_total
        assert len(b2["items"]) == expected_total - 25
        assert b2["nextCursor"] is None

        # Explicit "all" filters and dd-mm-yyyy date filter must not exclude records or 500
        today_dmy = datetime.now(timezone.utc).strftime("%d-%m-%Y")
        all_res = client.get(
            f"/api/companies/{company_id}/crawler/items?category=all&change=all&dateFrom={today_dmy}&dateTo={today_dmy}"
        )
        assert all_res.status_code == 200
        assert all_res.json()["total"] == expected_total
        assert len(all_res.json()["items"]) == 25

