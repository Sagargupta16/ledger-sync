"""Titan embedding failures as user-facing messages and HTTP errors.

Codes are the provider's own (botocore ``ClientError`` codes) plus the three
this feature adds: ``TimeBudget``, ``ProviderUnavailable`` and
``UnexpectedResponse``. Messages never carry the text that was embedded or any key.
"""

from __future__ import annotations

import logging
from collections.abc import Iterable

from fastapi import HTTPException

from ledger_sync.core.embeddings import EmbedFailure

logger = logging.getLogger(__name__)

_THROTTLED = frozenset({"ThrottlingException", "ServiceQuotaExceededException"})
_REFUSED = frozenset(
    {
        "AccessDeniedException",
        "UnrecognizedClientException",
        "InvalidSignatureException",
        "ExpiredTokenException",
        "NoCredentialsError",
        "PartialCredentialsError",
    }
)
_UNAVAILABLE_MODEL = frozenset(
    {"ValidationException", "ResourceNotFoundException", "ModelNotReadyException"}
)


def failure_message(failures: Iterable[EmbedFailure]) -> str:
    codes = {failure.code for failure in failures}
    if codes & _THROTTLED:
        return "Bedrock is throttling embedding calls. Wait a minute, then resume."
    if codes & _REFUSED:
        return (
            "Bedrock refused the credentials for Titan Text Embeddings V2. Check the key "
            "and that the model is enabled in this region."
        )
    if codes & _UNAVAILABLE_MODEL:
        return "Bedrock rejected the request: Titan Text Embeddings V2 may not be enabled here."
    if codes == {"TimeBudget"}:
        return "The batch ran out of time. The remaining rows stay pending."
    return "Bedrock could not embed some rows. They stay pending; try again shortly."


def provider_error(failures: list[EmbedFailure]) -> HTTPException:
    """429 for throttling, 502 otherwise; logs provider codes, never text or keys."""
    codes = sorted({failure.code for failure in failures})
    logger.warning("Titan embedding failed with provider codes %s", codes)
    status = 429 if _THROTTLED.intersection(codes) else 502
    return HTTPException(status_code=status, detail=failure_message(failures))
