"""Bedrock streaming proxy.

Browser-direct calls to AWS Bedrock fail (no CORS, SigV4 auth required).
This endpoint proxies chat requests to Bedrock using boto3 which handles
SigV4 signing and AWS Event Stream binary parsing automatically.

Credentials come from the standard AWS credential chain (env vars,
~/.aws/credentials, IAM role, etc.) -- no stored API key needed.
"""

from __future__ import annotations

import json
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import select

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.db.models import UserPreferences

router = APIRouter(prefix="/api/ai", tags=["ai"])


class BedrockChatRequest(BaseModel):
    messages: list[dict[str, str]] = Field(min_length=1)
    system_prompt: str = ""
    max_tokens: int = Field(default=1024, ge=1, le=4096)


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


@router.post("/bedrock/chat")
def bedrock_chat_proxy(
    current_user: CurrentUser,
    request: BedrockChatRequest,
    session: DatabaseSession,
) -> StreamingResponse:
    """Stream a Bedrock converse-stream response as SSE."""
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

    return StreamingResponse(
        _stream_bedrock(region, kwargs),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


async def _stream_bedrock(
    region: str,
    kwargs: dict[str, Any],
) -> AsyncGenerator[bytes, None]:
    import boto3

    try:
        client = boto3.client("bedrock-runtime", region_name=region)
        response = client.converse_stream(**kwargs)
    except Exception as exc:
        error_msg = str(exc)
        yield f"data: {json.dumps({'error': error_msg})}\n\n".encode()
        return

    try:
        for event in response.get("stream", []):
            if "contentBlockDelta" in event:
                delta = event["contentBlockDelta"].get("delta", {})
                text = delta.get("text")
                if text:
                    yield f"data: {json.dumps({'token': text})}\n\n".encode()
    except Exception as exc:
        yield f"data: {json.dumps({'error': str(exc)})}\n\n".encode()

    yield b"data: [DONE]\n\n"
