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
import logging
import os
from typing import Any, Literal, Self

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, JsonValue, model_validator
from sqlalchemy import select

from ledger_sync.api.ai_usage import (
    complete_usage,
    release_usage,
    reserve_usage,
)
from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.api.preferences_ai import LEGACY_BEDROCK_PLACEHOLDER, rewrap_stored_ai_key
from ledger_sync.api.rate_limit import limiter, user_limiter
from ledger_sync.config.settings import settings
from ledger_sync.core.encryption import DecryptionError, decrypt_api_key
from ledger_sync.db.models import UserPreferences

router = APIRouter(prefix="/api/ai", tags=["ai"])
logger = logging.getLogger(__name__)

MAX_CHAT_BYTES = 262_144
MAX_JSON_DEPTH = 12


class ChatModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class ToolResultContent(ChatModel):
    text: str | None = Field(default=None, min_length=1, max_length=65_536)
    json_data: JsonValue = Field(default=None, alias="json")

    @model_validator(mode="after")
    def validate_content(self) -> Self:
        if (self.text is not None) == ("json_data" in self.model_fields_set):
            raise ValueError("Tool result must contain exactly one of text or json")
        return self


class ContentBlock(ChatModel):
    """A bounded text, tool-use, or tool-result block."""

    type: Literal["text", "tool_use", "tool_result"]
    text: str | None = Field(default=None, min_length=1, max_length=65_536)
    tool_use_id: str | None = Field(
        default=None, min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$"
    )
    name: str | None = Field(default=None, min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    input: dict[str, JsonValue] | None = Field(default=None, max_length=20)
    content: list[ToolResultContent] | None = Field(default=None, min_length=1, max_length=16)

    @model_validator(mode="after")
    def validate_shape(self) -> Self:
        present = {
            name
            for name in ("text", "tool_use_id", "name", "input", "content")
            if getattr(self, name) is not None
        }
        required = {
            "text": {"text"},
            "tool_use": {"tool_use_id", "name", "input"},
            "tool_result": {"tool_use_id", "content"},
        }
        if present != required[self.type]:
            raise ValueError(f"Invalid fields for {self.type} block")
        return self


class StructuredMessage(ChatModel):
    role: Literal["user", "assistant"]
    content: str | None = Field(default=None, min_length=1, max_length=65_536)
    blocks: list[ContentBlock] | None = Field(default=None, min_length=1, max_length=32)

    @model_validator(mode="after")
    def validate_message(self) -> Self:
        if (self.content is None) == (self.blocks is None):
            raise ValueError("Message must contain exactly one of content or blocks")
        for block in self.blocks or []:
            if block.type == "tool_use" and self.role != "assistant":
                raise ValueError("Only assistant messages may contain tool_use")
            if block.type == "tool_result" and self.role != "user":
                raise ValueError("Only user messages may contain tool_result")
        return self


class ToolSpec(ChatModel):
    name: str = Field(min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    description: str = Field(min_length=1, max_length=4096)
    parameters: dict[str, JsonValue] = Field(max_length=32)

    @model_validator(mode="after")
    def validate_schema(self) -> Self:
        if self.parameters.get("type") != "object":
            raise ValueError("Tool parameters must be an object schema")
        return self


def _check_json_depth(value: Any, depth: int = 0) -> None:
    if depth > MAX_JSON_DEPTH:
        raise ValueError("Chat JSON nesting is too deep")
    if isinstance(value, dict):
        for child in value.values():
            _check_json_depth(child, depth + 1)
    elif isinstance(value, list):
        for child in value:
            _check_json_depth(child, depth + 1)


class BedrockChatRequest(ChatModel):
    messages: list[StructuredMessage] = Field(min_length=1, max_length=100)
    system_prompt: str = Field(default="", max_length=32_768)
    max_tokens: int = Field(default=1024, ge=1, le=4096)
    tools: list[ToolSpec] | None = Field(default=None, max_length=32)

    @model_validator(mode="after")
    def validate_size(self) -> Self:
        value = self.model_dump(by_alias=True, exclude_none=True)
        _check_json_depth(value)
        if len(json.dumps(value, ensure_ascii=False, allow_nan=False).encode()) > MAX_CHAT_BYTES:
            raise ValueError("Chat history is too large; start a new conversation")
        return self


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
                            "content": [
                                item.model_dump(by_alias=True, exclude_unset=True)
                                for item in b.content or []
                            ],
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


def _build_converse_kwargs(payload: BedrockChatRequest, model_id: str) -> dict[str, Any]:
    kwargs: dict[str, Any] = {
        "modelId": model_id,
        "messages": [_to_bedrock_message(message) for message in payload.messages],
        "inferenceConfig": {"maxTokens": payload.max_tokens},
    }
    if payload.system_prompt:
        kwargs["system"] = [{"text": payload.system_prompt}]
    if payload.tools:
        kwargs["toolConfig"] = {
            "tools": [
                {
                    "toolSpec": {
                        "name": tool.name,
                        "description": tool.description,
                        "inputSchema": {"json": tool.parameters},
                    }
                }
                for tool in payload.tools
            ]
        }
    return kwargs


def _resolve_user_bearer(prefs: UserPreferences, session: DatabaseSession) -> str | None:
    if prefs.ai_mode != "byok" or prefs.ai_provider != "bedrock":
        return None
    if not prefs.ai_api_key_encrypted:
        raise HTTPException(
            status_code=400,
            detail="Enter a personal Bedrock key or select App Bedrock mode for shared access.",
        )
    try:
        candidate, needs_reencrypt = decrypt_api_key(prefs.ai_api_key_encrypted)
    except DecryptionError as exc:
        raise HTTPException(
            status_code=400,
            detail="Stored Bedrock key cannot be decrypted -- re-enter it in Settings.",
        ) from exc
    if not candidate.strip() or candidate.strip() == LEGACY_BEDROCK_PLACEHOLDER:
        raise HTTPException(
            status_code=400,
            detail="Enter a personal Bedrock key or select App Bedrock mode for shared access.",
        )
    if needs_reencrypt:
        rewrap_stored_ai_key(session, prefs, candidate)
    return candidate


def _check_server_credential_path() -> None:
    has_bearer = bool(os.environ.get("AWS_BEARER_TOKEN_BEDROCK"))
    has_sigv4 = bool(os.environ.get("AWS_ACCESS_KEY_ID")) or bool(os.environ.get("AWS_PROFILE"))
    if not has_bearer and not has_sigv4:
        raise HTTPException(
            status_code=503,
            detail=(
                "Bedrock is not configured on the server. Set "
                "LEDGER_SYNC_BEDROCK_API_KEY (or AWS_BEARER_TOKEN_BEDROCK) "
                "in the backend environment, or paste your own Bedrock "
                "API key in Settings > AI Assistant."
            ),
        )


def _build_bedrock_config() -> Any:
    from botocore.config import Config  # type: ignore[import-untyped]

    return Config(
        connect_timeout=3,
        read_timeout=8,
        # A retry may duplicate billable inference without an idempotency key.
        retries={"total_max_attempts": 1, "mode": "standard"},
    )


def _create_bedrock_client(region: str, config: Any, user_bearer: str | None) -> Any:
    import boto3

    if user_bearer is None:
        return boto3.client("bedrock-runtime", region_name=region, config=config)

    from botocore import UNSIGNED  # type: ignore[import-untyped]
    from botocore.config import Config

    unsigned_config = config.merge(Config(signature_version=UNSIGNED))
    client = boto3.client("bedrock-runtime", region_name=region, config=unsigned_config)

    def _attach_bearer(request: Any, **_kwargs: Any) -> None:
        request.headers["Authorization"] = f"Bearer {user_bearer}"

    client.meta.events.register("request-created.bedrock-runtime", _attach_bearer)
    return client


def _call_bedrock(
    region: str,
    config: Any,
    user_bearer: str | None,
    converse_kwargs: dict[str, Any],
) -> dict[str, Any]:
    from botocore.exceptions import (  # type: ignore[import-untyped]
        ClientError,
        NoCredentialsError,
        ParamValidationError,
        PartialCredentialsError,
    )

    try:
        client = _create_bedrock_client(region, config, user_bearer)
    except Exception as exc:
        # Client setup cannot consume inference quota, including credential
        # resolution and personal bearer registration failures.
        raise BedrockInvocationError(
            "Bedrock client setup failed before inference. "
            "Check the configured key, model, and region.",
            billable=False,
        ) from exc

    try:
        response: dict[str, Any] = client.converse(**converse_kwargs)
        return response
    except (NoCredentialsError, PartialCredentialsError, ParamValidationError) as exc:
        raise BedrockInvocationError(
            "Bedrock credentials or request configuration are invalid. "
            "Check the configured key, model, and region.",
            billable=False,
        ) from exc
    except ClientError as exc:
        code = str(exc.response.get("Error", {}).get("Code", ""))
        not_invoked = code in {
            "AccessDeniedException",
            "UnrecognizedClientException",
            "InvalidSignatureException",
            "ExpiredTokenException",
            "ValidationException",
            "ResourceNotFoundException",
            "ThrottlingException",
            "ServiceQuotaExceededException",
            "ModelNotReadyException",
        }
        logger.warning("Bedrock invocation failed with provider code %s", code)
        raise BedrockInvocationError(
            "Bedrock rejected the request. Check the configured key, model, and region "
            "or retry after the model is ready or provider throttling clears.",
            billable=not not_invoked,
        ) from exc
    except Exception as exc:
        raise BedrockInvocationError(
            "Bedrock could not complete the request. Usage remains reserved because "
            "the provider may have processed it. Try again after the UTC quota reset "
            "or check the provider status.",
            billable=True,
        ) from exc


class BedrockInvocationError(HTTPException):
    def __init__(self, detail: str, *, billable: bool) -> None:
        super().__init__(status_code=502, detail=detail)
        self.billable = billable


def _extract_content_blocks(response: dict[str, Any]) -> list[dict[str, Any]]:
    try:
        content_blocks: list[dict[str, Any]] = response["output"]["message"]["content"]
        return content_blocks
    except (KeyError, TypeError) as exc:
        raise HTTPException(
            status_code=502, detail=f"Unexpected Bedrock response shape: {exc}"
        ) from exc


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
    result = session.execute(
        select(UserPreferences).where(UserPreferences.user_id == current_user.id)
    )
    prefs = result.scalar_one_or_none()
    if not prefs:
        raise HTTPException(status_code=400, detail="No preferences found")

    model_id, region = _get_bedrock_model_region(prefs)

    # BYOK Bedrock: if the user stored their own Bedrock API key (bearer
    # token), the call is signed with THEIR key -- they pay AWS directly and
    # the app's shared-key message cap does not apply (their own token caps
    # do). A missing key or legacy placeholder cannot spend shared credentials.
    user_bearer = _resolve_user_bearer(prefs, session)
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
