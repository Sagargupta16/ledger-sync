"""Titan Text Embeddings V2 calls for semantic search.

Titan takes one text per InvokeModel call, so a batch fans out over a small
thread pool sharing one client (boto3 clients are thread-safe). Nothing here
touches the database: callers commit a usage reservation before calling and
record the outcome after, so no transaction stays open across a provider call.

Every text gets an outcome. ``Embedded`` carries the vector and Bedrock's own
token count. ``EmbedFailure.billable`` says whether the provider may have
processed (and charged) the call, using the chat proxy's error taxonomy.
"""

from __future__ import annotations

import json
import time
from collections.abc import Sequence
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any, Protocol

import numpy as np
from numpy.typing import NDArray

TITAN_V2_MODEL_ID = "amazon.titan-embed-text-v2:0"
#: On-demand price per 1M input tokens in us-east-1 (aws.amazon.com/bedrock/pricing,
#: read 2026-10-26; Mumbai lists 0.024). Titan bills input tokens only.
TITAN_V2_USD_PER_1M_TOKENS = 0.02
#: No call starts after this many seconds, so a batch fits one serverless request.
BATCH_TIME_BUDGET_SECONDS = 4.5

# Provider codes returned before inference ran, so nothing was billed.
_NOT_INVOKED = frozenset(
    {
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
)


class BedrockRuntime(Protocol):
    """The one bedrock-runtime operation this module uses."""

    def invoke_model(self, **kwargs: Any) -> Any: ...


@dataclass(frozen=True, slots=True)
class Embedded:
    vector: NDArray[np.float32]
    input_tokens: int


@dataclass(frozen=True, slots=True)
class EmbedFailure:
    code: str
    billable: bool


type EmbedOutcome = Embedded | EmbedFailure


def estimate_tokens(text: str) -> int:
    """Reservation estimate: one token per UTF-8 byte (Titan averages ~4.7 characters)."""
    return max(1, len(text.encode("utf-8")))


def usd_cost(input_tokens: int) -> float:
    return round(max(input_tokens, 0) * TITAN_V2_USD_PER_1M_TOKENS / 1_000_000, 8)


def _parse(payload: Any, text: str, dimensions: int) -> EmbedOutcome:
    vector = payload.get("embedding") if isinstance(payload, dict) else None
    if not isinstance(vector, list) or len(vector) != dimensions:
        return EmbedFailure(code="UnexpectedResponse", billable=True)
    array = np.asarray(vector, dtype=np.float32)
    if not np.isfinite(array).all():
        return EmbedFailure(code="UnexpectedResponse", billable=True)
    tokens = payload.get("inputTextTokenCount")
    if type(tokens) is not int or tokens < 0:
        tokens = estimate_tokens(text)
    return Embedded(vector=array, input_tokens=tokens)


def _invoke(client: BedrockRuntime, text: str, dimensions: int) -> Any:
    body = json.dumps({"inputText": text, "dimensions": dimensions, "normalize": True})
    response = client.invoke_model(
        modelId=TITAN_V2_MODEL_ID,
        body=body,
        contentType="application/json",
        accept="application/json",
    )
    return json.loads(response["body"].read())


def _failure(exc: Exception) -> EmbedFailure:
    """Whether Bedrock may have processed (and billed) the call that raised *exc*."""
    from botocore.exceptions import (  # type: ignore[import-untyped]
        ClientError,
        ConnectTimeoutError,
        EndpointConnectionError,
        NoCredentialsError,
        ParamValidationError,
        PartialCredentialsError,
    )

    if isinstance(exc, ClientError):
        code = str(exc.response.get("Error", {}).get("Code", "")) or "ClientError"
        return EmbedFailure(code=code, billable=code not in _NOT_INVOKED)
    before_send = (
        NoCredentialsError,
        PartialCredentialsError,
        ParamValidationError,
        ConnectTimeoutError,
        EndpointConnectionError,
    )
    if isinstance(exc, before_send):
        # Raised before the request reached Bedrock.
        return EmbedFailure(code=type(exc).__name__, billable=False)
    # A read timeout or a dropped connection after sending: Bedrock may have
    # processed the call, so its usage stays counted.
    return EmbedFailure(code="ProviderUnavailable", billable=True)


def embed_one(client: BedrockRuntime, text: str, *, dimensions: int) -> EmbedOutcome:
    """Embed *text* (normalized to unit length) and classify any failure."""
    try:
        payload = _invoke(client, text, dimensions)
    except Exception as exc:
        return _failure(exc)
    return _parse(payload, text, dimensions)


def embed_many(
    client: BedrockRuntime,
    texts: Sequence[str],
    *,
    dimensions: int,
    concurrency: int,
    time_budget: float = BATCH_TIME_BUDGET_SECONDS,
) -> list[EmbedOutcome]:
    """One outcome per text, in order; texts past the time budget are not sent."""
    deadline = time.monotonic() + time_budget

    def attempt(text: str) -> EmbedOutcome:
        if time.monotonic() >= deadline:
            return EmbedFailure(code="TimeBudget", billable=False)
        return embed_one(client, text, dimensions=dimensions)

    if len(texts) <= 1:
        return [attempt(text) for text in texts]
    with ThreadPoolExecutor(max_workers=min(concurrency, len(texts))) as pool:
        return list(pool.map(attempt, texts))
