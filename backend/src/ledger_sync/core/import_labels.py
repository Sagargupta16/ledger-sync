"""Canonical upload labels resolved from small dimensions, with legacy fallback."""

from typing import Any

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from ledger_sync.db.models import LedgerAccount, LedgerAccountAlias, LedgerCategory, Transaction
from ledger_sync.ingest.normalizer import format_transfer_category


def canonicalize_accounts(session: Session, user_id: int, rows: list[dict[str, Any]]) -> None:
    """Fold known source aliases without scanning the transaction history."""
    canonical = dict(
        session.execute(
            select(LedgerAccountAlias.source_key, LedgerAccount.name)
            .join(
                LedgerAccount,
                and_(
                    LedgerAccount.id == LedgerAccountAlias.account_id,
                    LedgerAccount.user_id == LedgerAccountAlias.user_id,
                ),
            )
            .where(LedgerAccountAlias.user_id == user_id)
        )
        .tuples()
        .all()
    )
    fields = ("account", "from_account", "to_account")
    requested = {row[field].lower() for row in rows for field in fields if row.get(field)}
    if requested - canonical.keys():
        # Compatibility with legacy writers/fixtures that have no dimension IDs.
        # Fully migrated known accounts never need this query.
        legacy = session.execute(
            select(Transaction.account, Transaction.from_account, Transaction.to_account)
            .where(
                Transaction.user_id == user_id,
                or_(
                    Transaction.account_id.is_(None),
                    and_(
                        Transaction.from_account.is_not(None), Transaction.from_account_id.is_(None)
                    ),
                    and_(Transaction.to_account.is_not(None), Transaction.to_account_id.is_(None)),
                ),
            )
            .distinct()
        )
        for values in legacy:
            for name in values:
                if name:
                    canonical.setdefault(name.lower(), name)
    for row in rows:
        for field in fields:
            if row.get(field):
                row[field] = canonical.setdefault(row[field].lower(), row[field])
        if row.get("is_transfer"):
            row["category"] = format_transfer_category(row["from_account"], row["to_account"])


def canonicalize_categories(session: Session, user_id: int, rows: list[dict[str, Any]]) -> None:
    """Preserve the stored spelling of ordinary categories before reconciliation."""
    canonical = dict(
        session.execute(
            select(LedgerCategory.key, LedgerCategory.name).where(LedgerCategory.user_id == user_id)
        )
        .tuples()
        .all()
    )
    requested = {
        row["category"].lower()
        for row in rows
        if row.get("category") and not row.get("is_transfer")
    }
    if requested - canonical.keys():
        for name in session.scalars(
            select(Transaction.category)
            .where(Transaction.user_id == user_id, Transaction.category_id.is_(None))
            .distinct()
        ):
            canonical.setdefault(name.lower(), name)
    for row in rows:
        if row.get("category") and not row.get("is_transfer"):
            row["category"] = canonical.setdefault(row["category"].lower(), row["category"])
