"""Review-queue category fixes, and their replay on every import.

A ``change`` decision is the user's own category for one transaction. Each
import puts it back twice. Right after the categorization rules it lands on the
import row the reconciler is about to pair with the fixed row
(``category_override_matching`` predicts the pairing), so an unchanged snapshot
counts no update. After reconciliation it goes back, by public ID, on any live
row that still lost it: the reconciler can also pair rows by their shape, which
the prediction cannot see. The public ID survives every pairing, so the fix
does too. A ``keep`` decision only records the review: the source can still
recategorize that row later. Decisions are made in ``category_override_reviews``.

Transfers are never reviewed. Their category is a routing label built from the
two accounts.
"""

from __future__ import annotations

from typing import Any

import sqlalchemy as sa
from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.orm import Session

from ledger_sync.core.analytics.refresh import mark_ledger_changed
from ledger_sync.core.category_override_matching import load_fixes, match_fixes
from ledger_sync.db._models.category_overrides import DECISION_CHANGE
from ledger_sync.db.models import CategoryOverride, Transaction, TransactionType
from ledger_sync.services.ledger_dimensions import sync_transactions_dimensions


def overrides_table_ready(session: Session) -> bool:
    """Whether the table exists yet.

    Vercel can serve this code before the migration that adds the table, and an
    import must keep working on that schema: with no table there is nothing to apply.
    """
    return sa.inspect(session.connection()).has_table(CategoryOverride.__tablename__)


def apply_to_import_rows(session: Session, user_id: int, rows: list[dict[str, Any]]) -> int:
    """Put each fixed row's chosen category back on the import rows; return how many.

    Runs after the rules and category canonicalization, before validation, so
    the reconciler sees no change on a fixed row. The label the import brought
    is kept on the fix for Undo. A row the source turned into another type
    loses its fix and returns to the review queue; one turned into a transfer
    loses its fix and leaves review.
    """
    if not rows or not overrides_table_ready(session):
        return 0
    index = load_fixes(session, user_id)
    if not (index.by_uid or index.by_fingerprint or index.by_legacy_id):
        return 0
    applied = 0
    for position, fix in match_fixes(session, user_id, rows, index).items():
        row = rows[position]
        if row.get("is_transfer") or row["type"] != fix.stored_type:
            session.delete(fix.override)
            continue
        fix.override.imported_category = row["category"]
        fix.override.imported_subcategory = row.get("subcategory")
        row["category"] = fix.override.category
        row["subcategory"] = fix.override.subcategory
        applied += 1
    return applied


def _overwritten_fixes(user_id: int) -> Select[tuple[CategoryOverride, Transaction]]:
    """Each fix whose live income or expense row now carries another label."""
    return (
        select(CategoryOverride, Transaction)
        .join(
            Transaction,
            and_(
                Transaction.user_id == CategoryOverride.user_id,
                Transaction.transaction_id == CategoryOverride.transaction_id,
            ),
        )
        .where(
            CategoryOverride.user_id == user_id,
            CategoryOverride.decision == DECISION_CHANGE,
            Transaction.is_deleted.is_(False),
            Transaction.type != TransactionType.TRANSFER,
            or_(
                Transaction.category != CategoryOverride.category,
                func.coalesce(Transaction.subcategory, "")
                != func.coalesce(CategoryOverride.subcategory, ""),
            ),
        )
    )


def restore_overwritten_fixes(session: Session, user_id: int) -> int:
    """Put each fix back on a live row that lost it in reconciliation; return how many.

    Runs after both reconciliation batches and before the import commits. It
    catches the rows the reconciler paired by shape instead of the way
    ``apply_to_import_rows`` predicted, such as a spreadsheet row on its first
    backup import after its note was edited. The label that import brought is
    kept on the fix for Undo, and the rows' days are marked for analytics.
    """
    if not overrides_table_ready(session):
        return 0
    restored: list[Transaction] = []
    for override, transaction in session.execute(_overwritten_fixes(user_id)).tuples().all():
        override.imported_category = transaction.category
        override.imported_subcategory = transaction.subcategory or None
        transaction.category = override.category
        transaction.subcategory = override.subcategory
        restored.append(transaction)
    if restored:
        sync_transactions_dimensions(session, user_id, restored)
        mark_ledger_changed(session, user_id, [row.date.date() for row in restored])
    return len(restored)


def fixed_transaction_ids(session: Session, user_id: int) -> set[str]:
    """Public IDs of the user's fixed rows, for a writer that must leave their label alone."""
    if not overrides_table_ready(session):
        return set()
    return set(
        session.scalars(
            select(CategoryOverride.transaction_id).where(
                CategoryOverride.user_id == user_id,
                CategoryOverride.decision == DECISION_CHANGE,
            )
        )
    )
