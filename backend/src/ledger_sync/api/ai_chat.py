"""Bedrock chat proxy.

Browser-direct calls to AWS Bedrock fail (no CORS, SigV4 auth required).
This endpoint proxies chat requests to Bedrock using boto3 which handles
SigV4 signing and AWS Event Stream binary parsing automatically.

App mode uses server credentials. BYOK Bedrock requires the user's stored bearer
key and never falls back to shared credentials when that key is missing.

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

import json
from typing import Literal

from fastapi import APIRouter, HTTPException, Request

from ledger_sync.api.ai_chat_bedrock import (
    BedrockInvocationError,
    _build_bedrock_config,
    _build_converse_kwargs,
    _call_bedrock,
    _check_server_credential_path,
    _extract_content_blocks,
    _from_bedrock_blocks,
    _get_bedrock_model_region,
    _resolve_user_bearer,
)
from ledger_sync.api.ai_chat_schemas import BedrockChatRequest, BedrockChatResponse
from ledger_sync.api.ai_usage import (
    complete_usage,
    release_usage,
    reserve_usage,
)
from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.api.rate_limit import limiter, user_limiter
from ledger_sync.config.settings import settings
from ledger_sync.services.ai_settings import get_ai_settings

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post(
    "/bedrock/chat",
    responses={
        400: {"description": "Bedrock not configured or no preferences found"},
        502: {"description": "Bedrock returned an error or unexpected response shape"},
        503: {"description": "Bedrock is not configured on the server"},
    },
)
# Two-layer rate limit. Per-user (30/min) is the primary throttle; IP-keyed
# (60/min) protects the auth path against unauthenticated floods and gives a
# safety net when a token is missing/malformed.
@user_limiter.limit("30/minute")
@limiter.limit("60/minute")
def bedrock_chat_proxy(
    request: Request,  # unused in body; slowapi requires a `request: Request` parameter
    current_user: CurrentUser,
    payload: BedrockChatRequest,
    session: DatabaseSession,
) -> BedrockChatResponse:
    """Call Bedrock Converse API and return the full assistant reply."""
    ai_settings = get_ai_settings(session, current_user.id)
    if not ai_settings:
        raise HTTPException(status_code=400, detail="No preferences found")

    model_id, region = _get_bedrock_model_region(ai_settings)

    # BYOK Bedrock: if the user stored their own Bedrock API key (bearer
    # token), the call is signed with THEIR key -- they pay AWS directly and
    # the app's shared-key message cap does not apply (their own token caps
    # do). A missing key or legacy placeholder cannot spend shared credentials.
    user_bearer = _resolve_user_bearer(ai_settings, session)
    funding_source: Literal["app", "personal"] = "personal" if user_bearer else "app"

    if user_bearer is None:
        # Server-credential path. Pre-flight: if no auth mechanism is
        # reachable, give a clear error instead of letting boto3 surface its
        # misleading "model identifier is invalid" exception (which is what
        # it says when it can't sign the request).
        _check_server_credential_path()
        model_id = settings.ai_default_bedrock_model
        region = settings.ai_default_bedrock_region

    converse_kwargs = _build_converse_kwargs(payload, model_id)
    # One UTF-8 byte per input token plus framing is a conservative estimate
    # without a provider call or model-specific tokenizer dependency.
    estimated_input = (
        len(json.dumps(converse_kwargs, ensure_ascii=False, allow_nan=False).encode()) + 1024
    )

    # Explicit, finite timeouts + bounded retries. Without this boto3 inherits
    # botocore's 60s connect / 60s read defaults, which on Vercel's 10s
    # serverless ceiling means a slow Bedrock dependency hangs the function
    # until the platform kills it (see the module docstring). Cap below the
    # platform limit so we fail fast with a clean 502 instead.
    bedrock_config = _build_bedrock_config()
    user_id = current_user.id
    reservation_id = reserve_usage(
        session,
        user_id,
        model_id,
        estimated_input + payload.max_tokens,
        funding_source=funding_source,
    )
    try:
        response = _call_bedrock(region, bedrock_config, user_bearer, converse_kwargs)
    except BedrockInvocationError as exc:
        if not exc.billable:
            release_usage(session, user_id, reservation_id)
        raise

    # Record usage from Bedrock's reported counters. Bedrock exposes these
    # in `usage: {inputTokens, outputTokens, totalTokens}` on converse().
    usage = response.get("usage") or {}
    input_tokens = usage.get("inputTokens")
    output_tokens = usage.get("outputTokens")
    complete_usage(
        session,
        user_id,
        reservation_id,
        input_tokens=(
            input_tokens if type(input_tokens) is int and input_tokens >= 0 else estimated_input
        ),
        output_tokens=(
            output_tokens
            if type(output_tokens) is int and output_tokens >= 0
            else payload.max_tokens
        ),
    )
    content_blocks = _extract_content_blocks(response)

    return BedrockChatResponse(
        blocks=_from_bedrock_blocks(content_blocks),
        stop_reason=response.get("stopReason"),
    )
