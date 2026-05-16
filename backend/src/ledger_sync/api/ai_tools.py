"""AI tool-calling registry and HTTP endpoints.

The implementation is split across `ai_tools_impl/` modules which register
themselves into the shared REGISTRY on import. This file is the thin
HTTP-facing facade.

Design principles:
- All tools are read-only. Mutations go through explicit user actions.
- Every tool is user-scoped via CurrentUser. A tool can never see another
  user's data regardless of what arguments the LLM passes.
- Date params are optional YYYY-MM-DD strings.
- Results are capped to prevent a runaway LLM from exfiltrating the whole
  DB or blowing the token budget.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ledger_sync.api.ai_tools_impl import REGISTRY  # noqa: F401 - triggers registration
from ledger_sync.api.deps import CurrentUser, DatabaseSession

router = APIRouter(prefix="/api/ai/tools", tags=["ai-tools"])


class ToolExecuteRequest(BaseModel):
    name: str = Field(min_length=1)
    arguments: dict[str, Any] = Field(default_factory=dict)


def tool_specs() -> list[dict[str, Any]]:
    """Return provider-neutral tool descriptors (used by manifest + tests)."""
    return [
        {"name": t.name, "description": t.description, "parameters": t.schema}
        for t in REGISTRY.values()
    ]


@router.get("")
def list_tools(_current_user: CurrentUser) -> dict[str, Any]:
    """List available tool schemas. Auth required so anonymous browsers
    can't enumerate what tools the app supports."""
    return {"tools": tool_specs()}


@router.post("/execute")
def execute_tool(
    current_user: CurrentUser,
    request: ToolExecuteRequest,
    session: DatabaseSession,
) -> dict[str, Any]:
    """Execute a registered tool against the current user's data."""
    spec = REGISTRY.get(request.name)
    if spec is None:
        raise HTTPException(404, f"Unknown tool: {request.name}")
    try:
        result = spec.execute(current_user, session, request.arguments)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(400, f"Tool {request.name} failed: {exc}") from exc
    return {"name": request.name, "result": result}
