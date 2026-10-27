"""Settings for semantic transaction search (Titan Text Embeddings V2 on Bedrock).

Read from ``LEDGER_SYNC_`` environment variables like ``config/settings.py``,
in a module of its own so these knobs stay out of the shared settings. None of
them is required. The credentials are the chat's: ``LEDGER_SYNC_BEDROCK_API_KEY``
(bridged to ``AWS_BEARER_TOKEN_BEDROCK``) or the AWS credential chain, or a
user's own Bedrock key. Until one exists semantic search stays off and the
Transactions page says why.

Set these as real environment variables (the Vercel dashboard or the shell),
not in ``backend/.env``: ``Settings`` in ``config/settings.py`` forbids
``LEDGER_SYNC_`` keys it does not declare, so a knob placed in that file stops
the app from starting until ``Settings`` ignores extras. A value outside the
documented range also fails at import, as a bad ``Settings`` value does.
"""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class EmbeddingSettings(BaseSettings):
    """Semantic-search limits; every value has a working default."""

    # ``extra="ignore"``: the shared .env also carries every other app setting.
    model_config = SettingsConfigDict(
        env_prefix="LEDGER_SYNC_",
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Region for app-funded Titan calls; empty follows the chat's
    # LEDGER_SYNC_AI_DEFAULT_BEDROCK_REGION (us-east-1 by default). A personal
    # Bedrock key uses the region saved with it in Settings.
    embedding_region: str = ""
    # Transactions embedded per POST /api/semantic-search/index call. Titan
    # takes one text per InvokeModel call, so a batch is this many calls.
    embedding_batch_size: int = Field(default=64, ge=1, le=256)
    # Parallel InvokeModel calls within a batch (botocore pools 10 connections).
    embedding_concurrency: int = Field(default=8, ge=1, le=10)
    # Per-user cap on app-funded embedding tokens per UTC day; 0 turns it off.
    # A 7,500-row ledger is roughly 150K-750K tokens: 0.3 to 1.5 US cents.
    embedding_daily_token_limit: int = Field(default=1_000_000, ge=0)


embedding_settings = EmbeddingSettings()
