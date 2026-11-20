"""Ensure unhandled exceptions inside FastAPI endpoints return JSON {detail}, never empty 5xx."""

from __future__ import annotations

import logging

from fastapi.testclient import TestClient

import main


def test_unhandled_exception_returns_json_detail_and_logs_traceback(caplog) -> None:
    route_path = "/api/_test-boom"

    def boom():
        raise RuntimeError("simulated unexpected crash")

    main.app.add_api_route(route_path, boom, methods=["GET"])
    try:
        with caplog.at_level(logging.ERROR, logger="signalstack"):
            with TestClient(main.app, raise_server_exceptions=False) as client:
                response = client.get(route_path)

        assert response.status_code == 500
        assert response.headers["content-type"].startswith("application/json")
        body = response.json()
        assert body == {"detail": "Internal server error: RuntimeError"}
        assert any("Unhandled error on GET /api/_test-boom" in rec.message for rec in caplog.records)
        assert any(rec.exc_info is not None for rec in caplog.records)
    finally:
        main.app.router.routes[:] = [
            route for route in main.app.router.routes if getattr(route, "path", None) != route_path
        ]
