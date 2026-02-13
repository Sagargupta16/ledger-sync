"""Application settings and configuration."""

import warnings
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Sentinel value to detect when no secret has been configured
_DEV_JWT_SECRET = "dev-only-secret-change-in-production-abc123"

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
    jwt_secret_key: str = _DEV_JWT_SECRET
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30  # 30 minutes (industry standard)
    jwt_refresh_token_expire_days: int = 7

    # Upload limits
    max_upload_size_bytes: int = MAX_UPLOAD_SIZE_BYTES

    # CORS settings
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

        # JWT secret must be changed from default in ANY non-development environment
        if self.jwt_secret_key == _DEV_JWT_SECRET:
            if self.environment != "development":
                issues.append(
                    "CRITICAL: jwt_secret_key is using development default. "
                    "Set LEDGER_SYNC_JWT_SECRET_KEY environment variable!"
                )

        # JWT secret should be sufficiently long
        if self.jwt_secret_key != _DEV_JWT_SECRET and len(self.jwt_secret_key) < 32:
            issues.append("WARNING: jwt_secret_key should be at least 32 characters")

        if self.environment == "production":
            # SQLite not recommended for production
            if self.database_url.startswith("sqlite"):
                issues.append(
                    "WARNING: SQLite is not recommended for production. "
                    "Consider PostgreSQL or MySQL."
                )

        return issues

    def warn_if_development_secrets(self) -> None:
        """Emit warnings if using development secrets.

        Called during startup to alert developers.
        """
        if self.jwt_secret_key == _DEV_JWT_SECRET:
            warnings.warn(
                "Using development JWT secret! Set LEDGER_SYNC_JWT_SECRET_KEY "
                "environment variable for production.",
                UserWarning,
                stacklevel=2,
            )


# Global settings instance
settings = Settings()

# Validate settings on import for any non-development environment
if settings.environment != "development":
    issues = settings.validate_production_settings()
    for issue in issues:
        if issue.startswith("CRITICAL"):
            raise RuntimeError(issue)
        warnings.warn(issue, UserWarning, stacklevel=1)
