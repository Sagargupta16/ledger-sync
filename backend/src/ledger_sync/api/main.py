"""FastAPI application for ledger-sync web interface."""

import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError

from ledger_sync.api.account_classifications import (
    router as account_classifications_router,
)
from ledger_sync.api.analytics import router as analytics_router
from ledger_sync.api.analytics_v2 import router as analytics_v2_router
from ledger_sync.api.auth import router as auth_router
from ledger_sync.api.calculations import router as calculations_router
from ledger_sync.api.meta import router as meta_router
from ledger_sync.api.preferences import router as preferences_router
from ledger_sync.api.reports import router as reports_router
from ledger_sync.api.transactions import router as transactions_router
from ledger_sync.api.upload import router as upload_router
from ledger_sync.config.settings import settings
from ledger_sync.db.session import get_engine, init_db
from ledger_sync.schemas.transactions import HealthResponse
from ledger_sync.utils.logging import logger, setup_logging

APP_VERSION = "1.0.0"

# Initialize logging
setup_logging("INFO")


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: initialize database on startup."""
    init_db()
    yield


app = FastAPI(
    title="Ledger Sync API",
    description="Modern API for Excel ingestion and reconciliation",
    version=APP_VERSION,
    lifespan=lifespan,
)

# ─── Middleware (order matters: last added = first executed) ──────────────────

# GZip compression — reduces JSON payload sizes by ~80%
app.add_middleware(GZipMiddleware, minimum_size=1000)

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


# ─── Global Exception Handlers ──────────────────────────────────────────────


@app.exception_handler(OperationalError)
async def database_error_handler(_request: Request, exc: OperationalError) -> JSONResponse:
    """Handle database errors with structured response."""
    logger.error("Database error: %s", exc)
    return JSONResponse(
        status_code=503,
        content={"error": "Database unavailable", "code": "DB_ERROR"},
    )


@app.exception_handler(Exception)
async def generic_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    """Catch-all handler — no raw tracebacks in responses."""
    logger.error("Unhandled exception: %s: %s", type(exc).__name__, exc)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "code": "INTERNAL_ERROR",
            "detail": str(exc) if settings.environment == "development" else None,
        },
    )


# ─── Cache-Control Middleware ────────────────────────────────────────────────

# Analytics data only changes on upload — cache aggressively
_CACHEABLE_PREFIXES = (
    "/api/analytics",
    "/api/calculations",
    "/preferences",
)


@app.middleware("http")
async def add_cache_headers(request: Request, call_next):
    """Add Cache-Control headers to cacheable GET endpoints."""
    response = await call_next(request)

    if request.method == "GET":
        path = request.url.path
        if any(path.startswith(p) for p in _CACHEABLE_PREFIXES):
            # Cache for 5 minutes — TanStack Query's staleTime handles revalidation
            response.headers["Cache-Control"] = "private, max-age=300"
        elif path == "/health":
            response.headers["Cache-Control"] = "no-cache"

    return response


# ─── Request Timing Middleware ───────────────────────────────────────────────


@app.middleware("http")
async def add_timing_header(request: Request, call_next):
    """Add X-Response-Time header for performance monitoring."""
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Response-Time"] = f"{elapsed_ms:.1f}ms"
    return response


# ─── Include Routers ─────────────────────────────────────────────────────────

app.include_router(auth_router)
app.include_router(analytics_router)
app.include_router(analytics_v2_router)
app.include_router(calculations_router)
app.include_router(meta_router)
app.include_router(account_classifications_router)
app.include_router(preferences_router)
app.include_router(reports_router)
app.include_router(transactions_router)
app.include_router(upload_router)


# ─── Health Check ────────────────────────────────────────────────────────────


@app.get("/health")
async def health() -> HealthResponse:
    """Health check endpoint for load balancers and uptime monitors."""
    return HealthResponse(status="healthy", version=APP_VERSION)


@app.get("/health/db")
async def health_db() -> dict:
    """Database connectivity check."""
    from sqlalchemy import text

    try:
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return JSONResponse(
            status_code=503,
            content={"status": "error", "database": str(e)},
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
