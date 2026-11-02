"""Exception handlers registered by ``api.main``.

Every error body carries ``detail`` (what the frontend reads first) and keeps
the keys earlier clients read (``error``, ``code``). The catch-all 500 handler
stays in ``main`` because it mirrors the app's CORS allowlist.
"""

from __future__ import annotations

import math
import time
from typing import Any

from fastapi import Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from sqlalchemy.exc import OperationalError

from ledger_sync.utils.logging import logger


def _json_safe(value: Any) -> Any:
    """Spell non-finite floats as text so an error body can always be encoded."""
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)
    if isinstance(value, dict):
        return {key: _json_safe(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_json_safe(item) for item in value]
    return value


def rate_limit_error_handler(request: Request, exc: Exception) -> Response:
    """429 with Retry-After, rate-limit headers and the app's ``detail`` error shape."""
    if not isinstance(exc, RateLimitExceeded):
        raise exc
    message = f"Rate limit exceeded: {exc.detail}"
    # ``error`` is slowapi's original key, kept for existing clients.
    response = JSONResponse(status_code=429, content={"detail": message, "error": message})
    # Written here, not by slowapi: its ``headers_enabled`` makes every limited
    # endpoint that returns a plain dict fail unless it also takes ``response``.
    item, identifiers = request.state.view_rate_limit
    reset_at, remaining = request.app.state.limiter.limiter.get_window_stats(item, *identifiers)
    response.headers["Retry-After"] = str(max(1, math.ceil(reset_at - time.time())))
    response.headers["X-RateLimit-Limit"] = str(item.amount)
    response.headers["X-RateLimit-Remaining"] = str(remaining)
    response.headers["X-RateLimit-Reset"] = str(math.ceil(reset_at))
    return response


def validation_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    """FastAPI's 422 body, with each rejected input echoed safely.

    A JSON ``NaN`` or ``Infinity`` is correctly rejected, but the default
    handler echoes that input back and strict JSON encoding cannot write it,
    so the 422 became a 500.
    """
    if not isinstance(exc, RequestValidationError):
        raise exc
    return JSONResponse(
        status_code=422, content={"detail": _json_safe(jsonable_encoder(exc.errors()))}
    )


def database_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    """Handle database errors with structured response."""
    if not isinstance(exc, OperationalError):
        raise exc
    # The wrapper is always OperationalError; the driver error underneath says
    # whether it was a refused connection, a statement timeout, a lock wait or a
    # deadlock. Class and SQLSTATE only: the message can carry the host.
    cause = exc.orig
    logger.error(
        "Database error: %s (sqlstate=%s)",
        type(cause).__name__,
        getattr(cause, "sqlstate", None),
    )
    return JSONResponse(
        status_code=503,
        content={
            "detail": "Database unavailable",
            "error": "Database unavailable",
            "code": "DB_ERROR",
        },
    )
