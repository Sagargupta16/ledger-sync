"""Exception handlers registered by ``api.main``.

Every error body carries ``detail`` (what the frontend reads first) and keeps
the keys earlier clients read (``error``, ``code``). The catch-all 500 handler
stays in ``main`` because it mirrors the app's CORS allowlist.
"""

from __future__ import annotations

import math
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


async def rate_limit_error_handler(request: Request, exc: Exception) -> Response:
    """429 with slowapi's rate-limit headers and the app's ``detail`` error shape."""
    if not isinstance(exc, RateLimitExceeded):
        raise exc
    message = f"Rate limit exceeded: {exc.detail}"
    # ``error`` is slowapi's original key, kept for existing clients.
    response = JSONResponse(status_code=429, content={"detail": message, "error": message})
    injected: Response = request.app.state.limiter._inject_headers(
        response, request.state.view_rate_limit
    )
    return injected


async def validation_error_handler(_request: Request, exc: Exception) -> JSONResponse:
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


async def database_error_handler(_request: Request, exc: Exception) -> JSONResponse:
    """Handle database errors with structured response."""
    if not isinstance(exc, OperationalError):
        raise exc
    logger.error("Database error: %s", type(exc).__name__)
    return JSONResponse(
        status_code=503,
        content={
            "detail": "Database unavailable",
            "error": "Database unavailable",
            "code": "DB_ERROR",
        },
    )
