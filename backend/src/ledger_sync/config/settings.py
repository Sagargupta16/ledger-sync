"""Application settings and configuration."""

import os
import secrets
import warnings
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Maximum upload file size (50 MB)
MAX_UPLOAD_SIZE_BYTES: int = 50 * 1024 * 1024


class Settings(BaseSettings):
    """Application settings.

    Configuration is loaded from environment variables with LEDGER_SYNC_ prefix.
    A .env file in the project root can also be used for local development.

    Critical settings for production:
    - LEDGER_SYNC_JWT_SECRET_KEY: Must be a strong random string (min 32 chars)
    - LEDGER_SYNC_DATABASE_URL: Production database connection string

    """

    model_config = SettingsConfigDict(
        env_prefix="LEDGER_SYNC_",
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Environment
    environment: str = "development"  # development, staging, production

    # Database settings
    database_url: str = "sqlite:///./ledger_sync.db"
    database_echo: bool = False

    # Application settings
    log_level: str = "INFO"
    data_dir: Path = Path("./data")

    # JWT Authentication settings
    # SECURITY: Set LEDGER_SYNC_JWT_SECRET_KEY in production!
    jwt_secret_key: str = ""
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30  # 30 minutes (industry standard)
    jwt_refresh_token_expire_days: int = 7

    # Upload limits
    max_upload_size_bytes: int = MAX_UPLOAD_SIZE_BYTES

    # OAuth settings — set client ID and secret for each provider to enable.
    # Google: https://console.cloud.google.com/apis/credentials
    google_client_id: str = ""
    google_client_secret: str = ""
    # GitHub: https://github.com/settings/developers
    github_client_id: str = ""
    github_client_secret: str = ""

    # Frontend URL for OAuth redirect callbacks.
    # Dev: http://localhost:5173 | Prod: your actual frontend URL.
    frontend_url: str = "http://localhost:5173"

    # AI / Bedrock settings. If LEDGER_SYNC_BEDROCK_API_KEY is set, it's
    # injected into AWS_BEARER_TOKEN_BEDROCK below so boto3 picks it up.
    # This lets all app secrets share the LEDGER_SYNC_ prefix on Vercel.
    bedrock_api_key: str = ""
    # Default Bedrock model used by users in "app_bedrock" mode (the app
    # picks so we can control cost/latency). Override via env var if needed.
    # Haiku is the cheap default; operators can switch to Sonnet/Opus when
    # willing to absorb the bill.
    ai_default_bedrock_model: str = "us.anthropic.claude-haiku-4-5-20251001-v1:0"
    ai_default_bedrock_region: str = "us-east-1"
    # Hard cap per user per day in "app_bedrock" mode, counted in user
    # messages (one outer send, regardless of how many tool rounds it
    # spawns). Users who want more switch to BYOK. Make it generous enough
    # for normal finance Q&A without being a blank check.
    ai_daily_message_limit: int = 10

    # CORS settings — override with LEDGER_SYNC_CORS_ORIGINS env var (JSON array).
    # Defaults include localhost origins for development only.
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:5174",
    ]

    # Column name mappings (for normalization)
    date_column_names: list[str] = ["Period", "Date", "date", "period"]
    account_column_names: list[str] = ["Accounts", "Account", "account", "accounts"]
    category_column_names: list[str] = ["Category", "category"]
    subcategory_column_names: list[str] = ["Subcategory", "subcategory", "Sub Category"]
    note_column_names: list[str] = ["Note", "note", "Notes", "notes", "Description"]
    amount_column_names: list[str] = ["Amount / INR", "Amount", "amount", "Amount/INR"]
    type_column_names: list[str] = [
        "Income/Expense",
        "Type",
        "type",
        "Transaction Type",
    ]
    currency_column_names: list[str] = ["Currency", "currency"]

    def get_data_dir(self) -> Path:
        """Get data directory, creating it if necessary."""
        self.data_dir.mkdir(parents=True, exist_ok=True)
        return self.data_dir

    def validate_production_settings(self) -> list[str]:
        """Validate critical settings for non-development deployment.

        Returns:
            List of warning/error messages (empty if all OK)

        """
        issues: list[str] = []

        # JWT secret must be explicitly configured in ANY non-development environment
        if not self.jwt_secret_key:
            if self.environment != "development":
                issues.append(
                    "CRITICAL: jwt_secret_key is not configured. "
                    "Set LEDGER_SYNC_JWT_SECRET_KEY environment variable!"
                )

        # JWT secret should be sufficiently long
        if self.jwt_secret_key and len(self.jwt_secret_key) < 32:
            issues.append("CRITICAL: jwt_secret_key must be at least 32 characters")

        if self.environment in ("staging", "production"):
            # SQLite not suitable for multi-user production
            if self.database_url.startswith("sqlite"):
                issues.append(
                    "CRITICAL: SQLite is not suitable for production. "
                    "Use PostgreSQL: set LEDGER_SYNC_DATABASE_URL."
                )

        return issues

    def warn_if_development_secrets(self) -> None:
        """Emit warnings if using development secrets.

        Called during startup to alert developers.
        """
        if not self.jwt_secret_key:
            warnings.warn(
                "Using auto-generated JWT secret! Set LEDGER_SYNC_JWT_SECRET_KEY "
                "environment variable for production.",
                UserWarning,
                stacklevel=2,
            )


# Global settings instance
settings = Settings()

# Bridge LEDGER_SYNC_BEDROCK_API_KEY -> AWS_BEARER_TOKEN_BEDROCK.
# boto3 1.39+ reads the AWS_ env var natively for Bedrock API-key auth, but
# we want Vercel users to store the value under the LEDGER_SYNC_ prefix along
# with the rest of the app's secrets. Only override if the AWS_ var isn't
# already set by the deployment platform (so explicit AWS config still wins).
if settings.bedrock_api_key and not os.environ.get("AWS_BEARER_TOKEN_BEDROCK"):
    os.environ["AWS_BEARER_TOKEN_BEDROCK"] = settings.bedrock_api_key

# In development, auto-generate a random secret so tokens work without config.
# This is NOT used in production — the startup validator blocks non-dev
# environments that haven't set LEDGER_SYNC_JWT_SECRET_KEY.
if settings.environment == "development" and not settings.jwt_secret_key:
    settings.jwt_secret_key = secrets.token_urlsafe(48)

# Validate settings on import for any non-development environment
if settings.environment != "development":
    _issues = settings.validate_production_settings()
    for _issue in _issues:
        if _issue.startswith("CRITICAL"):
            raise RuntimeError(_issue)
        warnings.warn(_issue, UserWarning, stacklevel=1)
