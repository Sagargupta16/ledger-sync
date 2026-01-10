"""Application settings and configuration."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings."""

    model_config = SettingsConfigDict(
        env_prefix="LEDGER_SYNC_",
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Database settings
    database_url: str = "sqlite:///./ledger_sync.db"
    database_echo: bool = False

    # Application settings
    log_level: str = "INFO"
    data_dir: Path = Path("./data")

    # Column name mappings (for normalization)
    date_column_names: list[str] = ["Period", "Date", "date", "period"]
    account_column_names: list[str] = ["Accounts", "Account", "account", "accounts"]
    category_column_names: list[str] = ["Category", "category"]
    subcategory_column_names: list[str] = ["Subcategory", "subcategory", "Sub Category"]
    note_column_names: list[str] = ["Note", "note", "Notes", "notes", "Description"]
    amount_column_names: list[str] = ["Amount / INR", "Amount", "amount", "Amount/INR"]
    type_column_names: list[str] = ["Income/Expense", "Type", "type", "Transaction Type"]
    currency_column_names: list[str] = ["Currency", "currency"]

    def get_data_dir(self) -> Path:
        """Get data directory, creating it if necessary."""
        self.data_dir.mkdir(parents=True, exist_ok=True)
        return self.data_dir


# Global settings instance
settings = Settings()
