"""Read-only MCP server at POST /mcp for Claude Code and other MCP clients.

Connect with a ``ledger:read`` token created in Settings::

    claude mcp add --transport http ledger-sync <API>/mcp --header "Authorization: Bearer <token>"

Streamable HTTP with one JSON response per POST: no GET stream, no session and
no server-to-client requests. ``mcp_protocol`` serves the current 2026-07-28
revision (``server/discover``, ``tools/list``, ``tools/call``) and the legacy
``initialize`` handshake, ``ping`` and ``notifications/initialized``. The tools
are the in-app chat's read-only registry, run for the token's user (``mcp_tools``).

Only clients that can send a static Authorization header can connect.
claude.ai web connectors need the server to be an OAuth authorization server
(protected resource metadata and client registration), which this endpoint does
not provide. Tool results go to the model in the user's own Claude account.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Annotated, Any, NoReturn

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from ledger_sync.api.deps import DatabaseSession, cors_allowed_origins, require_token_scope
from ledger_sync.api.mcp_protocol import (
    INVALID_PARAMS,
    INVALID_REQUEST,
    PARSE_ERROR,
    McpError,
    handle_request,
)
from ledger_sync.api.rate_limit import _upload_key_func, limiter
from ledger_sync.db._models.upload_tokens import LEDGER_READ_SCOPE
from ledger_sync.db.models import User

router = APIRouter(tags=["mcp"])

McpUser = Annotated[User, Depends(require_token_scope(LEDGER_READ_SCOPE))]
# Tool arguments are a few short fields; anything near this is not a real call.
MAX_BODY_BYTES = 64 * 1024
_ORIGINS = frozenset(cors_allowed_origins())


async def _check_origin(request: Request) -> None:
    """Refuse a browser Origin we do not serve (the transport's DNS-rebinding rule)."""
    origin = request.headers.get("origin")
    if origin is not None and "*" not in _ORIGINS and origin not in _ORIGINS:
        raise HTTPException(status_code=403, detail="This origin may not call the MCP endpoint")


@limiter.limit("60/minute;1000/hour", key_func=_upload_key_func)
@limiter.limit("120/minute")
async def _rate_limit(request: Request) -> None:
    """Count every call before the token lookup, so guessed tokens are throttled too.

    Limits on the route itself would run after the token dependency and never
    see a failed lookup.
    """


async def _read_body(request: Request) -> bytes | None:
    """The body, or None once it passes MAX_BODY_BYTES, never buffering more than that."""
    try:
        declared = int(request.headers.get("content-length", "0"))
    except ValueError:
        declared = 0  # the running total below still holds the cap
    if declared > MAX_BODY_BYTES:
        return None
    body = bytearray()
    async for chunk in request.stream():
        body += chunk
        if len(body) > MAX_BODY_BYTES:
            return None
    return bytes(body)


def _reject_constant(name: str) -> NoReturn:
    """NaN and Infinity parse in Python but are not JSON."""
    raise ValueError(f"{name} is not valid JSON")


def _valid_id(value: object) -> bool:
    return isinstance(value, str) or (isinstance(value, int) and not isinstance(value, bool))


def _error(request_id: object, exc: McpError) -> JSONResponse:
    content = {"jsonrpc": "2.0", "id": request_id if _valid_id(request_id) else None}
    return JSONResponse({**content, "error": exc.body()}, status_code=exc.status)


def _envelope(message: object) -> tuple[str, dict[str, Any], bool]:
    """Method, params and whether it is a notification, for one JSON-RPC message."""
    if not isinstance(message, dict):
        raise McpError(INVALID_REQUEST, "Send one JSON-RPC message per POST, not a batch", 400)
    method = message.get("method")
    if message.get("jsonrpc") != "2.0" or not isinstance(method, str):
        raise McpError(INVALID_REQUEST, "Not a JSON-RPC 2.0 request or notification", 400)
    is_notification = "id" not in message
    if not is_notification and not _valid_id(message["id"]):
        raise McpError(INVALID_REQUEST, "The id must be a string or an integer", 400)
    params = message.get("params")
    if params is None:
        params = {}
    if not isinstance(params, dict):
        raise McpError(INVALID_PARAMS, "params must be an object", 400)
    return method, params, is_notification


def _respond(message: object, headers: Mapping[str, str], user: User, db: Session) -> Response:
    request_id = message.get("id") if isinstance(message, dict) else None
    try:
        method, params, is_notification = _envelope(message)
        if is_notification:
            # Nothing a client notifies (initialized, cancelled) needs an answer.
            return Response(status_code=202)
        result = handle_request(method, params, headers, user, db)
    except McpError as exc:
        return _error(request_id, exc)
    return JSONResponse({"jsonrpc": "2.0", "id": request_id, "result": result})


@router.post(
    "/mcp",
    # In order: Origin, then the rate limit, then the token (McpUser).
    dependencies=[Depends(_check_origin), Depends(_rate_limit)],
    responses={
        202: {"description": "Notification accepted"},
        400: {"description": "Malformed message, header mismatch or unsupported version"},
        401: {"description": "Missing, invalid, revoked or non-ledger:read token"},
        403: {"description": "Browser Origin not allowed"},
        404: {"description": "Method not found (2026-07-28 requests)"},
        413: {"description": "Message too large"},
        429: {"description": "Rate limit exceeded"},
    },
)
async def mcp_endpoint(request: Request, user: McpUser, db: DatabaseSession) -> Response:
    """One JSON-RPC request or notification per POST, answered with one JSON body.

    The token check already ran in a worker; the tool work runs in one too.
    """
    body = await _read_body(request)
    if body is None:
        return _error(None, McpError(INVALID_REQUEST, "The message is too large", 413))
    try:
        message = json.loads(body, parse_constant=_reject_constant)
    except ValueError, RecursionError:  # JSONDecodeError, UnicodeDecodeError, deep nesting
        return _error(None, McpError(PARSE_ERROR, "Parse error", 400))
    return await run_in_threadpool(_respond, message, request.headers, user, db)
