"""The in-app chat tool registry served as MCP tools, run read-only for one user.

Every tool in ``ai_tools_impl`` is listed with the argument schema its Pydantic
model generates, and a call is validated by that same model, so MCP clients and
the in-app chat can never drift apart. The one addition is ``get_today``: the
in-app chat puts the India date in its prompt, and an MCP client has only its
own clock. Calls run inside ``_read_only``: the tools only read, and the guard
makes sure a future change cannot write either.
"""

from __future__ import annotations

import json
import logging
import secrets
import time
from collections.abc import Iterator
from contextlib import contextmanager
from functools import cache
from typing import Any

from fastapi.encoders import jsonable_encoder
from pydantic import ValidationError
from sqlalchemy import event, select, text
from sqlalchemy.orm import Session

from ledger_sync.api.ai_tools_impl import REGISTRY, ToolSpec
from ledger_sync.api.ai_tools_impl.schemas import ToolArguments
from ledger_sync.core.ledger_clock import ledger_today_iso
from ledger_sync.db.models import User, UserPreferences

logger = logging.getLogger(__name__)

# Hints for the client only; _read_only is the guarantee.
_ANNOTATIONS = {"readOnlyHint": True, "openWorldHint": False}


class InvalidToolCallError(Exception):
    """tools/call named no registered tool, or its arguments are not an object."""


def _exec_get_today(user: User, db: Session, _args: dict[str, Any]) -> dict[str, Any]:
    """Today in India and the fiscal year's start month, April when never set."""
    start_month = db.scalar(
        select(UserPreferences.fiscal_year_start_month).where(UserPreferences.user_id == user.id)
    )
    return {
        "today": ledger_today_iso(),
        "time_zone": "India Standard Time (UTC+05:30)",
        "fiscal_year_start_month": start_month or 4,
    }


_GET_TODAY = ToolSpec(
    name="get_today",
    description=(
        "Today's date in India (YYYY-MM-DD) and the month the user's fiscal year starts "
        "(1-12). Call it before building a date range for today, this month, the last few "
        "days or the current fiscal year."
    ),
    arguments_model=ToolArguments,
    execute=_exec_get_today,
)


def _tools() -> dict[str, ToolSpec]:
    """The chat registry in registration order, then the MCP-only clock."""
    return {**REGISTRY, _GET_TODAY.name: _GET_TODAY}


@cache
def tool_definitions() -> tuple[dict[str, Any], ...]:
    """Every tool in a stable order, so clients can cache the list."""
    return tuple(
        {
            "name": spec.name,
            "description": spec.description,
            # The model's class name and docstring describe Python, not the tool.
            "inputSchema": {
                key: value
                for key, value in spec.schema.items()
                if key not in ("title", "description")
            },
            "annotations": _ANNOTATIONS,
        }
        for spec in _tools().values()
    )


def _refuse_write(*_args: object) -> None:
    raise PermissionError("MCP tools are read-only")


@contextmanager
def _read_only(db: Session) -> Iterator[None]:
    """Run the block in a fresh transaction that cannot write and never commits.

    The token check committed its own transaction; rolling back here ends any
    read since, so PostgreSQL can mark the next transaction READ ONLY before its
    first query. A flush or commit raises on every dialect, and the closing
    rollback discards anything the block did.
    """
    db.rollback()
    event.listen(db, "before_flush", _refuse_write)
    event.listen(db, "before_commit", _refuse_write)
    try:
        if db.get_bind().dialect.name == "postgresql":
            db.execute(text("SET TRANSACTION READ ONLY"))
        yield
    finally:
        event.remove(db, "before_flush", _refuse_write)
        event.remove(db, "before_commit", _refuse_write)
        db.rollback()


def _tool_error(message: str) -> dict[str, Any]:
    """A tool execution error, shown to the model so it can correct the call."""
    return {"content": [{"type": "text", "text": message}], "isError": True}


def _describe(exc: ValidationError) -> str:
    problems = "; ".join(
        f"{'.'.join(str(part) for part in error['loc']) or 'arguments'}: {error['msg']}"
        for error in exc.errors(include_input=False, include_url=False, include_context=False)
    )
    return f"Invalid arguments: {problems}"


def _run(
    spec: ToolSpec, user: User, db: Session, arguments: dict[str, Any], request_id: str
) -> tuple[dict[str, Any], str, int]:
    """The CallToolResult body, plus an outcome label and level for the log."""
    try:
        validated = spec.validate_arguments(arguments)
    except ValidationError as exc:
        return _tool_error(_describe(exc)), "invalid arguments", logging.INFO
    failed = _tool_error(f"Tool {spec.name} failed unexpectedly (error id {request_id}).")
    try:
        with _read_only(db):
            result = spec.execute(user, db, validated)
    except ValueError as exc:
        # Usually the tool refusing its input (pydantic errors included); the
        # logged type tells that apart from a stored value that would not convert.
        message = f"Tool {spec.name} could not be completed. Check the arguments."
        return _tool_error(message), f"rejected ({type(exc).__name__})", logging.WARNING
    except Exception as exc:
        return failed, type(exc).__name__, logging.ERROR
    try:
        body = json.dumps(
            jsonable_encoder(result), ensure_ascii=False, allow_nan=False, separators=(",", ":")
        )
    except ValueError as exc:  # NaN or Infinity in a result is a defect, not the model's
        return failed, f"unencodable result ({type(exc).__name__})", logging.ERROR
    return {"content": [{"type": "text", "text": body}], "isError": False}, "ok", logging.INFO


def call_tool(user: User, db: Session, name: object, arguments: object) -> dict[str, Any]:
    """Run one tool for *user* and return the body of an MCP CallToolResult.

    Each call is logged once with a request id, the tool, the outcome and the
    duration. Never the arguments or the result: both carry financial data, and
    so can a database error's message, so failures log the exception type only.
    """
    spec = _tools().get(name) if isinstance(name, str) else None
    if spec is None:
        raise InvalidToolCallError(f"Unknown tool: {name}")
    if arguments is None:
        arguments = {}
    if not isinstance(arguments, dict):
        raise InvalidToolCallError("Tool arguments must be a JSON object")

    request_id = secrets.token_hex(8)
    # Read once, before the guard's rollback expires the user.
    user_id = user.id
    started = time.perf_counter()
    result, outcome, level = _run(spec, user, db, arguments, request_id)
    logger.log(
        level,
        "MCP tools/call %s for user %s: %s in %.0f ms [%s]",
        spec.name,
        user_id,
        outcome,
        (time.perf_counter() - started) * 1000,
        request_id,
    )
    return result
