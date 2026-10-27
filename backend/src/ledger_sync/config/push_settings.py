"""Web Push settings: the VAPID key pair, its contact subject and the cron secret.

Phone alerts stay off until all three VAPID values are set. The daily alert run
also needs ``CRON_SECRET``, under the exact name Vercel reads: Vercel sends it
as ``Authorization: Bearer <CRON_SECRET>`` on every cron invocation, so it has
no ``LEDGER_SYNC_`` prefix (that spelling is accepted too).

Only names ever leave this module. The private key and the cron secret are
``SecretStr`` so a log line or repr never prints them.
"""

from pydantic import AliasChoices, Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

PUBLIC_KEY_ENV = "LEDGER_SYNC_VAPID_PUBLIC_KEY"
PRIVATE_KEY_ENV = "LEDGER_SYNC_VAPID_PRIVATE_KEY"
SUBJECT_ENV = "LEDGER_SYNC_VAPID_SUBJECT"
CRON_ENV = "CRON_SECRET"


class PushSettings(BaseSettings):
    """Read from the environment (and a local ``.env``) with the app's prefix."""

    model_config = SettingsConfigDict(
        env_prefix="LEDGER_SYNC_",
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        # The .env file also holds every other setting; only these fields are ours.
        extra="ignore",
    )

    # Base64url of the uncompressed P-256 point, the browser's applicationServerKey.
    vapid_public_key: str = ""
    # Base64url of the raw 32-byte private key (a PEM block is accepted too).
    vapid_private_key: SecretStr = SecretStr("")
    # Who push services contact about this sender: "mailto:you@example.com" or an https URL.
    vapid_subject: str = ""
    cron_secret: SecretStr = Field(
        default=SecretStr(""),
        validation_alias=AliasChoices(CRON_ENV, "LEDGER_SYNC_CRON_SECRET"),
    )

    def missing_vapid(self) -> list[str]:
        """Names of the VAPID variables that are not set, in documentation order."""
        values = {
            PUBLIC_KEY_ENV: self.vapid_public_key,
            PRIVATE_KEY_ENV: self.vapid_private_key.get_secret_value(),
            SUBJECT_ENV: self.vapid_subject,
        }
        return [name for name, value in values.items() if not value.strip()]

    def cron_ready(self) -> bool:
        return bool(self.cron_secret.get_secret_value().strip())


push_settings = PushSettings()
