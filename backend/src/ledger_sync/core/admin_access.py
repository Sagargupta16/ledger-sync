"""Which accounts are the owner's: admins, and accounts without the app AI cap.

Both lists are emails from settings (LEDGER_SYNC_ADMIN_EMAILS and
LEDGER_SYNC_AI_UNLIMITED_EMAILS), matched without case against the stored
``User.email``. Sign-in stores only a provider-verified address and the column
is unique, so a listed email names exactly one account. An admin also has no
app AI cap.
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
