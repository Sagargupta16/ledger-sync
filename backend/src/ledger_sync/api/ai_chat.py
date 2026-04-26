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
"""

from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.db.models import UserPreferences

router = APIRouter(prefix="/api/ai", tags=["ai"])


class BedrockChatRequest(BaseModel):
    messages: list[dict[str, str]] = Field(min_length=1)
    system_prompt: str = ""
    max_tokens: int = Field(default=1024, ge=1, le=4096)


class BedrockChatResponse(BaseModel):
    content: str


def _get_bedrock_model_region(prefs: UserPreferences) -> tuple[str, str]:
    """Return (model_id, region) from user preferences."""
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

    bedrock_messages: list[dict[str, Any]] = [
        {"role": m["role"], "content": [{"text": m["content"]}]} for m in request.messages
    ]

    kwargs: dict[str, Any] = {
        "modelId": model_id,
        "messages": bedrock_messages,
        "inferenceConfig": {"maxTokens": request.max_tokens},
    }
    if request.system_prompt:
        kwargs["system"] = [{"text": request.system_prompt}]

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

    import boto3

    try:
        client = boto3.client("bedrock-runtime", region_name=region)
        response = client.converse(**kwargs)
    except Exception as exc:
        # Surface the real boto/AWS error to the client so the UI can display
        # something actionable (bad model id, auth failure, region mismatch).
        raise HTTPException(status_code=502, detail=f"Bedrock error: {exc}") from exc

    # Converse response shape:
    # { "output": { "message": { "content": [{ "text": "..." }, ...] } }, ... }
    try:
        content_blocks = response["output"]["message"]["content"]
        text = "".join(block.get("text", "") for block in content_blocks if "text" in block)
    except (KeyError, TypeError) as exc:
        raise HTTPException(
            status_code=502, detail=f"Unexpected Bedrock response shape: {exc}"
        ) from exc

    return BedrockChatResponse(content=text)
