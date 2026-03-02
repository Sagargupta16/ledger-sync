"""FastAPI application for ledger-sync web interface."""

import secrets
import time
from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy.exc import OperationalError

from ledger_sync.api.account_classifications import (
    router as account_classifications_router,
)
from ledger_sync.api.analytics import router as analytics_router
from ledger_sync.api.analytics_v2 import router as analytics_v2_router
from ledger_sync.api.auth import router as auth_router
from ledger_sync.api.calculations import router as calculations_router
from ledger_sync.api.meta import router as meta_router
from ledger_sync.api.oauth import router as oauth_router
from ledger_sync.api.preferences import router as preferences_router
from ledger_sync.api.reports import router as reports_router
from ledger_sync.api.transactions import router as transactions_router
from ledger_sync.api.upload import router as upload_router
from ledger_sync.config.settings import settings
from ledger_sync.db.session import get_engine, init_db
from ledger_sync.schemas.transactions import HealthResponse
from ledger_sync.utils.logging import logger, setup_logging

_MiddlewareCallNext = Callable[[Request], Awaitable[Response]]

APP_VERSION = "1.0.0"

# Initialize logging
setup_logging("INFO")


def _cleanup_stale_temp_files() -> None:
    """Remove stale upload temp files older than 1 hour on startup."""
    import tempfile
    from pathlib import Path

    temp_dir = Path(tempfile.gettempdir())
    cutoff = time.time() - 3600  # 1 hour ago
    cleaned = 0
    for pattern in ("*.xlsx", "*.xls", "*.csv"):
        for f in temp_dir.glob(pattern):
            try:
                if f.stat().st_mtime < cutoff:
                    f.unlink()
                    cleaned += 1
            except OSError:
                pass
    if cleaned:
        logger.info("Cleaned up %d stale temp files", cleaned)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan: initialize database, HTTP client, and clean temp files."""
    try:
        logger.info("Initializing database...")
        init_db()
        logger.info("Database initialized successfully")
        logger.info("CORS allowed origins: %s", _cors_origins)
        _cleanup_stale_temp_files()
    except Exception as exc:
        logger.error("Database initialization failed: %s", exc)
        raise

    # Shared httpx client for OAuth calls — connection-pooled and reused
    _app.state.http_client = httpx.AsyncClient(timeout=10.0)
    yield
    await _app.state.http_client.aclose()


app = FastAPI(
    title="Ledger Sync API",
    description="Modern API for Excel ingestion and reconciliation",
    version=APP_VERSION,
    lifespan=lifespan,
)

# ─── Rate Limiting ───────────────────────────────────────────────────────────

# Register slowapi rate-limit exceeded handler (returns 429 Too Many Requests)
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)  # type: ignore[arg-type]

# ─── Middleware (order matters: last added = first executed) ──────────────────

# GZip compression — reduces JSON payload sizes by ~80%
app.add_middleware(GZipMiddleware, minimum_size=1000)


# ─── Security Headers Middleware ─────────────────────────────────────────────


@app.middleware("http")
async def add_security_headers(
    request: Request,
    call_next: _MiddlewareCallNext,
) -> Response:
    """Add security headers to all responses (OWASP best practices).

    Skips CORS preflight (OPTIONS) so CORSMiddleware can handle them cleanly.
    """
    response = await call_next(request)

    # Don't modify CORS preflight responses
    if request.method == "OPTIONS":
        return response
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "font-src 'self'; "
        "connect-src 'self' https:; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )
    if settings.environment == "production":
        response.headers["Strict-Transport-Security"] = (
            "max-age=31536000; includeSubDomains; preload"
        )
    return response


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
    """Catch-all handler — no raw tracebacks in responses.

    Returns a unique error_id for log correlation instead of leaking
    internal details.
    """
    error_id = secrets.token_hex(8)
    logger.error("Unhandled exception [%s]: %s: %s", error_id, type(exc).__name__, exc)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "code": "INTERNAL_ERROR",
            "error_id": error_id,
        },
    )


# ─── Cache-Control Middleware ────────────────────────────────────────────────


@app.middleware("http")
async def add_cache_headers(
    request: Request,
    call_next: _MiddlewareCallNext,
) -> Response:
    """Prevent browser HTTP cache from serving stale API data.

    TanStack Query handles caching client-side. If the browser also caches
    HTTP responses, a queryClient.clear() + refetch will still receive the
    old cached response from the browser, causing charts to show stale data
    after upload until the browser cache expires.
    """
    response = await call_next(request)

    if request.method == "GET":
        path = request.url.path
        if path.startswith("/api/"):
            # API data: no browser cache — TanStack Query manages freshness
            response.headers["Cache-Control"] = "no-store"
        elif path == "/health":
            response.headers["Cache-Control"] = "no-cache"

    return response


# ─── Request Timing Middleware ───────────────────────────────────────────────


@app.middleware("http")
async def add_timing_header(
    request: Request,
    call_next: _MiddlewareCallNext,
) -> Response:
    """Add X-Response-Time header for performance monitoring."""
    start = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - start) * 1000
    response.headers["X-Response-Time"] = f"{elapsed_ms:.1f}ms"
    return response


# ─── CORS (added last = outermost, so ALL responses get CORS headers) ────────

_cors_origins = list(settings.cors_origins)
if settings.frontend_url:
    _parsed = urlparse(settings.frontend_url)
    _frontend_origin = f"{_parsed.scheme}://{_parsed.netloc}"
    if _frontend_origin and _frontend_origin not in _cors_origins:
        _cors_origins.append(_frontend_origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type"],
)


# ─── Include Routers ─────────────────────────────────────────────────────────

app.include_router(auth_router)
app.include_router(oauth_router)
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


@app.get("/health/db", response_model=None)
async def health_db() -> dict[str, str] | JSONResponse:
    """Database connectivity check."""
    from sqlalchemy import text

    try:
        engine = get_engine()
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        logger.error("Database health check failed: %s", e)
        return JSONResponse(
            status_code=503,
            content={"status": "error", "database": "unavailable"},
        )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
