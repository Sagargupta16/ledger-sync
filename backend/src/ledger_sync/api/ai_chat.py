"""Bedrock chat proxy.

Browser-direct calls to AWS Bedrock fail (no CORS, SigV4 auth required).
This endpoint proxies chat requests to Bedrock using boto3 which handles
SigV4 signing and AWS Event Stream binary parsing automatically.

Credentials come from the standard AWS credential chain (env vars,
~/.aws/credentials, IAM role, etc.) -- no stored API key needed.

Why non-streaming JSON instead of SSE:
---------------------------------------
The backend runs on Vercel via Mangum (Lambda-style adapter). Mangum
buffers the entire response before returning, so `StreamingResponse`
doesn't actually stream end-to-end -- the browser sits on "processing"
until the Bedrock stream fully drains and the serverless function
returns. For short replies this made the UI feel frozen; for long
replies it would hit Vercel's 10s Hobby timeout and silently fail.

We use `converse` (non-streaming) and return plain JSON. The UX is now
"processing... 2-5s... full reply appears" instead of "processing...
forever... nothing". Anthropic and OpenAI paths keep their browser-
direct SSE streaming since they don't go through Mangum.

Tool use:
---------
If the request includes `tools`, we pass `toolConfig` to `converse()`.
The response may contain tool_use blocks alongside text, which the
frontend will execute and feed back on the next call.
"""

from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from ledger_sync.api.ai_usage import (
    check_app_message_limit,
    check_token_limits,
    record_usage,
)
from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.config.settings import settings
from ledger_sync.db.models import UserPreferences

router = APIRouter(prefix="/api/ai", tags=["ai"])


class ContentBlock(BaseModel):
    """One content block inside a message. Mirrors Bedrock's Converse schema.

    Exactly one of text/toolUse/toolResult is populated per block. We accept
    them as an open dict so the frontend can pass them through without the
    backend needing a discriminated union.
    """

    type: str  # "text" | "tool_use" | "tool_result"
    text: str | None = None
    tool_use_id: str | None = None
    name: str | None = None
    input: dict[str, Any] | None = None
    content: list[dict[str, Any]] | None = None


class StructuredMessage(BaseModel):
    role: str  # "user" | "assistant"
    # Either `content` (simple string) or `blocks` (structured). Simple
    # strings get wrapped into a single text block before calling Bedrock.
    content: str | None = None
    blocks: list[ContentBlock] | None = None


class ToolSpec(BaseModel):
    name: str
    description: str
    parameters: dict[str, Any]


class BedrockChatRequest(BaseModel):
    messages: list[StructuredMessage] = Field(min_length=1)
    system_prompt: str = ""
    max_tokens: int = Field(default=1024, ge=1, le=4096)
    tools: list[ToolSpec] | None = None


class BedrockChatResponse(BaseModel):
    """Response envelope compatible with tool-calling.

    `blocks` mirrors the Bedrock Converse output: a list of content blocks
    that may mix text and tool_use. The frontend inspects them to decide
    whether to execute tools or display the reply.
    """

    blocks: list[dict[str, Any]]
    stop_reason: str | None = None


def _get_bedrock_model_region(prefs: UserPreferences) -> tuple[str, str]:
    """Resolve Bedrock (model_id, region) based on the user's mode.

    app_bedrock -> the model + region configured at the app level, ignoring
    any stale BYOK config rows. Users don't pick their own model here.

    byok -> the user's configured Bedrock model. They own the AWS key.
    """
    if prefs.ai_mode == "app_bedrock":
        return settings.ai_default_bedrock_model, settings.ai_default_bedrock_region

    # BYOK path
    if prefs.ai_provider != "bedrock":
        raise HTTPException(status_code=400, detail="Bedrock not configured")

    raw_model = prefs.ai_model or ""
    if "|" in raw_model:
        model, region = raw_model.rsplit("|", 1)
    else:
        model, region = raw_model, "us-east-1"

    if not model:
        raise HTTPException(status_code=400, detail="No Bedrock model configured")

    return model, region


def _to_bedrock_message(msg: StructuredMessage) -> dict[str, Any]:
    """Convert our wire format to Bedrock's converse message format."""
    if msg.blocks is not None:
        bedrock_blocks: list[dict[str, Any]] = []
        for b in msg.blocks:
            if b.type == "text" and b.text is not None:
                bedrock_blocks.append({"text": b.text})
            elif b.type == "tool_use":
                bedrock_blocks.append(
                    {
                        "toolUse": {
                            "toolUseId": b.tool_use_id,
                            "name": b.name,
                            "input": b.input or {},
                        }
                    }
                )
            elif b.type == "tool_result":
                bedrock_blocks.append(
                    {
                        "toolResult": {
                            "toolUseId": b.tool_use_id,
                            "content": b.content or [],
                        }
                    }
                )
        return {"role": msg.role, "content": bedrock_blocks}
    # Simple string content -- wrap in a text block
    return {"role": msg.role, "content": [{"text": msg.content or ""}]}


def _from_bedrock_blocks(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert Bedrock output blocks to our wire format (same as input)."""
    out: list[dict[str, Any]] = []
    for b in blocks:
        if "text" in b:
            out.append({"type": "text", "text": b["text"]})
        elif "toolUse" in b:
            tu = b["toolUse"]
            out.append(
                {
                    "type": "tool_use",
                    "tool_use_id": tu.get("toolUseId"),
                    "name": tu.get("name"),
                    "input": tu.get("input", {}),
                }
            )
    return out


@router.post("/bedrock/chat", response_model=BedrockChatResponse)
def bedrock_chat_proxy(
    current_user: CurrentUser,
    request: BedrockChatRequest,
    session: DatabaseSession,
) -> BedrockChatResponse:
    """Call Bedrock Converse API and return the full assistant reply."""
    result = session.execute(
        select(UserPreferences).where(UserPreferences.user_id == current_user.id)
    )
    prefs = result.scalar_one_or_none()
    if not prefs:
        raise HTTPException(status_code=400, detail="No preferences found")

    model_id, region = _get_bedrock_model_region(prefs)

    bedrock_messages = [_to_bedrock_message(m) for m in request.messages]

    kwargs: dict[str, Any] = {
        "modelId": model_id,
        "messages": bedrock_messages,
        "inferenceConfig": {"maxTokens": request.max_tokens},
    }
    if request.system_prompt:
        kwargs["system"] = [{"text": request.system_prompt}]

    if request.tools:
        kwargs["toolConfig"] = {
            "tools": [
                {
                    "toolSpec": {
                        "name": t.name,
                        "description": t.description,
                        "inputSchema": {"json": t.parameters},
                    }
                }
                for t in request.tools
            ]
        }

    # Pre-flight: if no auth mechanism is reachable, give a clear error instead
    # of letting boto3 surface its misleading "model identifier is invalid"
    # exception (which is what it says when it can't sign the request).
    has_bearer = bool(os.environ.get("AWS_BEARER_TOKEN_BEDROCK"))
    has_sigv4 = bool(os.environ.get("AWS_ACCESS_KEY_ID")) or bool(os.environ.get("AWS_PROFILE"))
    if not has_bearer and not has_sigv4:
        raise HTTPException(
            status_code=503,
            detail=(
                "Bedrock is not configured on the server. Set "
                "LEDGER_SYNC_BEDROCK_API_KEY (or AWS_BEARER_TOKEN_BEDROCK) "
                "in the backend environment."
            ),
        )

    # Gate by mode:
    #   app_bedrock -> count messages, enforce app-wide daily cap
    #   byok        -> the user owns the bill; only their optional per-user
    #                  token caps apply.
    if prefs.ai_mode == "app_bedrock":
        check_app_message_limit(session, current_user.id)
    else:
        check_token_limits(session, current_user.id)

    import boto3

    try:
        client = boto3.client("bedrock-runtime", region_name=region)
        response = client.converse(**kwargs)
    except Exception as exc:
        # Surface the real boto/AWS error to the client so the UI can display
        # something actionable (bad model id, auth failure, region mismatch).
        raise HTTPException(status_code=502, detail=f"Bedrock error: {exc}") from exc

    try:
        content_blocks = response["output"]["message"]["content"]
    except (KeyError, TypeError) as exc:
        raise HTTPException(
            status_code=502, detail=f"Unexpected Bedrock response shape: {exc}"
        ) from exc

    # Record usage from Bedrock's reported counters. Bedrock exposes these
    # in `usage: {inputTokens, outputTokens, totalTokens}` on converse().
    usage = response.get("usage") or {}
    record_usage(
        session,
        current_user.id,
        provider="bedrock",
        model=model_id,
        input_tokens=int(usage.get("inputTokens") or 0),
        output_tokens=int(usage.get("outputTokens") or 0),
        tool_rounds=1,
    )

    return BedrockChatResponse(
        blocks=_from_bedrock_blocks(content_blocks),
        stop_reason=response.get("stopReason"),
    )
