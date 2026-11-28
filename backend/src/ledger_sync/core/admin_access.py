"""Which accounts are the owner's: admins, accounts without the app AI cap,
and accounts allowed to spend the app's AI credentials.

The lists are emails from settings (LEDGER_SYNC_ADMIN_EMAILS,
LEDGER_SYNC_AI_UNLIMITED_EMAILS and LEDGER_SYNC_AI_APP_EMAILS), matched
without case against the stored ``User.email``. Sign-in stores only a
provider-verified address and the column is unique, so a listed email names
exactly one account. An admin also has no app AI cap.
"""

from __future__ import annotations

from ledger_sync.config.settings import settings


def _listed(email: str | None, addresses: list[str]) -> bool:
    if not email or not addresses:
        return False
    return email.strip().casefold() in {address.strip().casefold() for address in addresses}


def is_admin_email(email: str | None) -> bool:
    return _listed(email, settings.admin_emails)


def has_unlimited_ai(email: str | None) -> bool:
    return is_admin_email(email) or _listed(email, settings.ai_unlimited_emails)


#: The detail of the 403 an account outside LEDGER_SYNC_AI_APP_EMAILS gets.
APP_AI_NOT_ALLOWED = (
    "The app's shared AI is for invited accounts. Save your own key in "
    "Settings > AI Assistant to use the assistant."
)


def can_use_app_ai(email: str | None) -> bool:
    """May this account spend the app's Bedrock credentials (chat, Smart search)?"""
    if "*" in settings.ai_app_emails:
        return True
    return has_unlimited_ai(email) or _listed(email, settings.ai_app_emails)
