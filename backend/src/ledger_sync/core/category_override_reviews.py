"""Review-queue decisions: keep a row's category, move it, or undo the review.

Each decision commits as one unit with the row's relabel and the analytics
mark for its day. Imports replay a ``change`` decision through
``category_overrides``; a ``keep`` only records that the row was reviewed.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.core.analytics.refresh import lock_analytics_user, mark_ledger_changed
from ledger_sync.core.import_labels import canonicalize_categories
from ledger_sync.db._models.category_overrides import DECISION_CHANGE, DECISION_KEEP
from ledger_sync.db.models import CategoryOverride, Transaction, TransactionType
from ledger_sync.services.ledger_dimensions import sync_transaction_dimensions

_Label = tuple[str, str | None]


class TransactionNotFoundError(LookupError):
    """No live transaction with this ID belongs to the user."""


class TransferNotReviewableError(ValueError):
    """A transfer's category is a routing label built from its two accounts."""


def _label(transaction: Transaction) -> _Label:
    return (transaction.category, transaction.subcategory or None)


def _reviewable(session: Session, user_id: int, transaction_id: str) -> Transaction:
    transaction = session.scalar(
        select(Transaction).where(
            Transaction.user_id == user_id,
            Transaction.transaction_id == transaction_id,
            Transaction.is_deleted.is_(False),
        )
    )
    if transaction is None:
        raise TransactionNotFoundError(transaction_id)
    if transaction.type == TransactionType.TRANSFER:
        raise TransferNotReviewableError(
            "Transfers take their category from their two accounts, so they are not reviewed."
        )
    return transaction


def _existing(session: Session, user_id: int, transaction_id: str) -> CategoryOverride | None:
    return session.scalar(
        select(CategoryOverride).where(
            CategoryOverride.user_id == user_id,
            CategoryOverride.transaction_id == transaction_id,
        )
    )


def _relabel(session: Session, transaction: Transaction, label: _Label) -> None:
    """Rewrite one row's label and dimension IDs and invalidate its day."""
    transaction.category, transaction.subcategory = label
    sync_transaction_dimensions(session, transaction)
    mark_ledger_changed(session, transaction.user_id, [transaction.date.date()])


def _target(
    session: Session, user_id: int, category: str | None, subcategory: str | None
) -> _Label | None:
    """The label a change asks for, with its category in the stored spelling."""
    if category is None:
        return None
    row = {"category": category}
    canonicalize_categories(session, user_id, [row])
    return (row["category"], subcategory or None)


def _first_review(user_id: int, transaction_id: str, label: _Label) -> CategoryOverride:
    return CategoryOverride(
        user_id=user_id,
        transaction_id=transaction_id,
        decision=DECISION_KEEP,
        category=label[0],
        subcategory=label[1],
        imported_category=label[0],
        imported_subcategory=label[1],
    )


def _decide(
    session: Session, transaction: Transaction, override: CategoryOverride, target: _Label | None
) -> None:
    """Keep the row (``target`` None) or move it to ``target``.

    A keep never moved the row, so a keep decision follows the row's label,
    which is still the import's. Keeping a fixed row leaves its fix. Choosing
    the label a row already has is a keep, except on a fixed row: there it
    replaces the fix, so the next import cannot bring the old one back.
    """
    current = _label(transaction)
    if override.decision == DECISION_KEEP:
        override.category, override.subcategory = current
        override.imported_category, override.imported_subcategory = current
    if target is None:
        return
    if target != current:
        _relabel(session, transaction, target)
    if target != current or override.decision == DECISION_CHANGE:
        override.decision = DECISION_CHANGE
        override.category, override.subcategory = target


def record_review(
    session: Session,
    user_id: int,
    transaction_id: str,
    *,
    category: str | None,
    subcategory: str | None = None,
) -> CategoryOverride:
    """Keep the row's label (``category`` None) or move it, in one committed unit."""
    lock_analytics_user(session, user_id)
    transaction = _reviewable(session, user_id, transaction_id)
    target = _target(session, user_id, category, subcategory)
    override = _existing(session, user_id, transaction_id)
    if override is None:
        override = _first_review(user_id, transaction_id, _label(transaction))
        session.add(override)
    _decide(session, transaction, override, target)
    override.reviewed_at = datetime.now(UTC)
    session.commit()
    return override


def undo_review(session: Session, user_id: int, transaction_id: str) -> bool:
    """Forget a review; a moved row gets back the label its import gave it."""
    lock_analytics_user(session, user_id)
    override = _existing(session, user_id, transaction_id)
    if override is None:
        session.commit()
        return False
    if override.decision == DECISION_CHANGE:
        transaction = session.scalar(
            select(Transaction).where(
                Transaction.user_id == user_id,
                Transaction.transaction_id == transaction_id,
                Transaction.is_deleted.is_(False),
                Transaction.type != TransactionType.TRANSFER,
            )
        )
        restored = (override.imported_category, override.imported_subcategory or None)
        if transaction is not None and _label(transaction) != restored:
            _relabel(session, transaction, restored)
    session.delete(override)
    session.commit()
    return True
