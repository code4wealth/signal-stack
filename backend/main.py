"""FastAPI application entrypoint.

Run from backend/:  uvicorn main:app --host 127.0.0.1 --port 8000
Docs:               http://127.0.0.1:8000/docs
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import db
from config import get_settings
from safe_fetch import FetchError
from llm import LLMError
from routes import router as api_router

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("signalstack")

settings = get_settings()

APP_VERSION = "0.1.0"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    import scheduler

    db.init_db()
    logger.info("signal stack up: db=%s model=%s", settings.database_url.split("://")[0], settings.groq_model)
    scheduler.start()
    try:
        yield
    finally:
        scheduler.shutdown()


app = FastAPI(
    title="Signal Stack",
    description="Evidence-backed company intelligence: research, interview, sources, crawl, rank, brief.",
    version=APP_VERSION,
    lifespan=lifespan,
)

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", *settings.cors_extra_origins],
    allow_origin_regex=r"https://[a-z0-9-]+\.e2b\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(FetchError)
async def _fetch_error_handler(_request: Request, exc: FetchError) -> JSONResponse:
    status = 502 if exc.kind == "fetch" else 400
    return JSONResponse(status_code=status, content={"detail": exc.as_detail()})


@app.exception_handler(LLMError)
async def _llm_error_handler(_request: Request, exc: LLMError) -> JSONResponse:
    # 503: the LLM is a dependency that is missing/unavailable, not the caller's fault.
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.exception_handler(Exception)
async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.error(
        "Unhandled error on %s %s: %s",
        request.method,
        request.url.path,
        exc.__class__.__name__,
        exc_info=(type(exc), exc, exc.__traceback__),
    )
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal server error: {exc.__class__.__name__}"},
    )


@app.get("/api/health", tags=["system"])
def health() -> dict:
    db_ok = True
    db_error = None
    try:
        with db.engine.connect() as connection:
            connection.exec_driver_sql("SELECT 1")
    except Exception as exc:  # surfaced, never swallowed
        db_ok = False
        db_error = exc.__class__.__name__

    return {
        "status": "ok" if db_ok else "degraded",
        "version": APP_VERSION,
        "database": {"ok": db_ok, "dialect": db.engine.dialect.name, "error": db_error},
        "llm": {"model": settings.groq_model, "api_key_configured": settings.has_groq_key},
        "tables": sorted(db.Base.metadata.tables.keys()),
    }


@app.get("/api/llm/healthcheck", tags=["system"])
def llm_healthcheck() -> dict:
    """One real Groq call returning validated JSON (PRD Phase 0 gate)."""
    import llm

    return llm.healthcheck()
