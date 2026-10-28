"""The admin page's app section: version, database, feature adoption, table sizes.

Counts only. Each table is checked before it is read, because Vercel can serve
new code before CI migrates and a missing table must not fail the whole page.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, inspect, select, text
from sqlalchemy.orm import Session

from ledger_sync import __version__
from ledger_sync.db.models import (
    AIUsageLog,
    BankAlert,
    ImportLog,
    MfHolding,
    NetWorthSnapshot,
    PushSubscription,
    SavedFilterView,
    Transaction,
    UploadToken,
    User,
    UserAISettings,
)

# Row counts shown on the page, in this order.
_TABLES = (
    User,
    Transaction,
    ImportLog,
    AIUsageLog,
    NetWorthSnapshot,
    MfHolding,
    BankAlert,
    PushSubscription,
    UploadToken,
    SavedFilterView,
)


def _revision(db: Session, tables: set[str]) -> str | None:
    if "alembic_version" not in tables:
        return None
    heads = list(db.scalars(text("SELECT version_num FROM alembic_version")))
    return ", ".join(sorted(str(head) for head in heads)) or None


def _distinct_users(db: Session, tables: set[str], model: Any, *where: Any) -> int | None:
    """Accounts with at least one row in *model*'s table, or None when it does not exist."""
    if model.__tablename__ not in tables:
        return None
    return int(db.scalar(select(func.count(func.distinct(model.user_id))).where(*where)) or 0)


def _features(db: Session, tables: set[str]) -> dict[str, int | None]:
    now = datetime.now(UTC).replace(tzinfo=None)
    return {
        "cas_holdings": _distinct_users(db, tables, MfHolding),
        "push_subscriptions": _distinct_users(db, tables, PushSubscription),
        "active_upload_tokens": _distinct_users(
            db, tables, UploadToken, UploadToken.revoked_at.is_(None), UploadToken.expires_at > now
        ),
        "bank_alerts": _distinct_users(db, tables, BankAlert),
        "saved_views": _distinct_users(db, tables, SavedFilterView),
        "byok_ai": _distinct_users(db, tables, UserAISettings, UserAISettings.ai_mode == "byok"),
    }


def app_section(db: Session) -> dict[str, Any]:
    tables = set(inspect(db.connection()).get_table_names())
    return {
        "version": __version__,
        "database": db.get_bind().dialect.name,
        "revision": _revision(db, tables),
        "features": _features(db, tables),
        "tables": [
            {
                "table": model.__tablename__,
                "rows": int(db.scalar(select(func.count()).select_from(model)) or 0),
            }
            for model in _TABLES
            if model.__tablename__ in tables
        ],
    }
