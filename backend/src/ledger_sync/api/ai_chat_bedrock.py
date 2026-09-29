"""Bedrock plumbing for the chat proxy: model/credential resolution and invocation.

Extracted from ``api/ai_chat.py`` so the router keeps only the route. The
error taxonomy lives here: ``BedrockInvocationError.billable`` tells the route
whether a failed call may have consumed quota (keep the reservation) or
provably did not (release it).
"""

from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import HTTPException

from ledger_sync.api.ai_chat_schemas import BedrockChatRequest, StructuredMessage
from ledger_sync.api.deps import DatabaseSession
from ledger_sync.config.settings import settings
from ledger_sync.core.encryption import DecryptionError, decrypt_api_key
from ledger_sync.db._models.ai_settings import UserAISettings
from ledger_sync.services.ai_settings import (
    LEGACY_BEDROCK_PLACEHOLDER,
    rewrap_stored_ai_key,
)

logger = logging.getLogger(__name__)


def _get_bedrock_model_region(ai_settings: UserAISettings) -> tuple[str, str]:
    """Resolve Bedrock (model_id, region) based on the user's mode.

    app_bedrock -> the model + region configured at the app level, ignoring
    any stale BYOK config rows. Users don't pick their own model here.

    byok -> the user's configured Bedrock model. They own the AWS key.
    """
    if ai_settings.ai_mode == "app_bedrock":
        return settings.ai_default_bedrock_model, settings.ai_default_bedrock_region

    # BYOK path
    if ai_settings.ai_provider != "bedrock":
        raise HTTPException(status_code=400, detail="Bedrock not configured")

    raw_model = ai_settings.ai_model or ""
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


def _resolve_user_bearer(ai_settings: UserAISettings, session: DatabaseSession) -> str | None:
    if ai_settings.ai_mode != "byok" or ai_settings.ai_provider != "bedrock":
        return None
    if not ai_settings.ai_api_key_encrypted:
        raise HTTPException(
            status_code=400,
            detail="Enter a personal Bedrock key or select App Bedrock mode for shared access.",
        )
    try:
        candidate, needs_reencrypt = decrypt_api_key(ai_settings.ai_api_key_encrypted)
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
        rewrap_stored_ai_key(session, ai_settings, candidate)
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
