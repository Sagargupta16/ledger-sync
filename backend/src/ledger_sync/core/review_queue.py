"""The review queue: recent rows nobody has reviewed yet, newest first.

Recent means the ``days`` calendar days that end on the newest reviewable row's
day, or on today when the ledger runs past today, so a user who imports once a
month still gets the latest month. A row dated after today joins the queue on
its day. Transfers and excluded accounts are left out. Each row carries up to
two suggestions from the category suggester other than its own label, and the
response lists every category in use for the picker.
"""

from __future__ import annotations

from collections import Counter
from datetime import datetime, timedelta

from sqlalchemy import ColumnElement, exists, func, select
from sqlalchemy.orm import Session

from ledger_sync.core.category_suggester import MAX_SUGGESTIONS, suggest_for_transactions
from ledger_sync.core.category_suggester import CategorySuggestion as Suggested
from ledger_sync.core.ledger_clock import ledger_now
from ledger_sync.core.query_helpers import excluded_accounts_for, ledger_criteria
from ledger_sync.db.models import TRANSACTIONS, CategoryOverride, Transaction, TransactionType, User
from ledger_sync.schemas.review_queue import (
    CategoryOption,
    CategorySuggestion,
    ReviewableType,
    ReviewItem,
    ReviewQueueResponse,
)
from ledger_sync.utils.logging import logger

_Criteria = list[ColumnElement[bool]]


def _type_name(tx_type: TransactionType) -> ReviewableType:
    return "Income" if tx_type == TransactionType.INCOME else "Expense"


def _reviewed() -> ColumnElement[bool]:
    return exists().where(
        CategoryOverride.user_id == Transaction.user_id,
        CategoryOverride.transaction_id == Transaction.transaction_id,
    )


def _count(session: Session, criteria: _Criteria) -> int:
    return session.scalar(select(func.count()).select_from(Transaction).where(*criteria)) or 0


def _category_options(session: Session, user_id: int) -> list[CategoryOption]:
    """Income and expense categories in use, most used first, subcategories likewise."""
    stmt = (
        select(Transaction.type, Transaction.category, Transaction.subcategory, func.count())
        .where(
            Transaction.user_id == user_id,
            Transaction.is_deleted.is_(False),
            Transaction.type != TransactionType.TRANSFER,
        )
        .group_by(Transaction.type, Transaction.category, Transaction.subcategory)
    )
    totals: Counter[tuple[TransactionType, str]] = Counter()
    uses: dict[tuple[TransactionType, str], Counter[str]] = {}
    for tx_type, category, subcategory, count in session.execute(stmt).tuples():
        totals[(tx_type, category)] += count
        named = uses.setdefault((tx_type, category), Counter())
        if subcategory:
            named[subcategory] += count
    options = [
        CategoryOption(
            type=_type_name(tx_type),
            category=category,
            subcategories=[name for name, _ in uses[(tx_type, category)].most_common()],
            count=count,
        )
        for (tx_type, category), count in totals.items()
    ]
    options.sort(key=lambda option: (option.type, -option.count, option.category.casefold()))
    return options


def _window(session: Session, scope: _Criteria, days: int) -> tuple[datetime, datetime] | None:
    """The window's first instant and the first instant after it; None with no rows."""
    newest = session.scalar(select(func.max(Transaction.date)).where(*scope))
    if newest is None:
        return None
    last_day = min(newest, ledger_now()).replace(hour=0, minute=0, second=0, microsecond=0)
    return last_day - timedelta(days=days - 1), last_day + timedelta(days=1)


def _newest_rows(session: Session, criteria: _Criteria, limit: int) -> list[Transaction]:
    return list(
        session.scalars(
            select(Transaction)
            .where(*criteria)
            .order_by(
                Transaction.date.desc(),
                TRANSACTIONS.c.occurred_at.desc().nulls_last(),
                Transaction.transaction_id,
            )
            .limit(limit)
        )
    )


def _suggestions(
    session: Session, user_id: int, rows: list[Transaction]
) -> dict[str, list[Suggested]]:
    """The suggester's picks per row; the queue still works when it fails."""
    if not rows:
        return {}
    try:
        return suggest_for_transactions(session, user_id, rows)
    except Exception:
        logger.warning("Review queue suggestions failed for user_id=%s", user_id, exc_info=True)
        return {}


def _item(row: Transaction, picks: list[Suggested]) -> ReviewItem:
    own = (row.category, row.subcategory or None)
    suggestions = [
        CategorySuggestion(
            category=pick.category, subcategory=pick.subcategory, confidence=pick.confidence
        )
        for pick in picks
        if (pick.category, pick.subcategory or None) != own
    ]
    return ReviewItem(
        transaction_id=row.transaction_id,
        date=row.date.date().isoformat(),
        amount=float(row.amount),
        type=_type_name(row.type),
        account=row.account,
        category=row.category,
        subcategory=row.subcategory or None,
        note=row.note or None,
        suggestions=suggestions[:MAX_SUGGESTIONS],
    )


def _empty_queue(days: int, categories: list[CategoryOption]) -> ReviewQueueResponse:
    """No reviewable row at all, so no window either."""
    return ReviewQueueResponse(
        items=[],
        remaining=0,
        reviewed=0,
        window_start=None,
        window_days=days,
        categories=categories,
    )


def build_review_queue(
    session: Session, user: User, *, limit: int, days: int
) -> ReviewQueueResponse:
    """The ``limit`` newest unreviewed rows of the window, its counts, and the options."""
    scope = [
        *ledger_criteria(user.id, excluded_accounts_for(user)),
        Transaction.type != TransactionType.TRANSFER,
    ]
    categories = _category_options(session, user.id)
    bounds = _window(session, scope, days)
    if bounds is None:
        return _empty_queue(days, categories)
    start, end = bounds
    window = [*scope, Transaction.date >= start, Transaction.date < end]
    open_rows = [*window, ~_reviewed()]
    remaining = _count(session, open_rows)
    reviewed = _count(session, [*window, _reviewed()])
    rows = _newest_rows(session, open_rows, limit)
    # Last: a failing suggester must not abort the reads above on PostgreSQL.
    picks = _suggestions(session, user.id, rows)
    return ReviewQueueResponse(
        items=[_item(row, picks.get(row.transaction_id, [])) for row in rows],
        remaining=remaining,
        reviewed=reviewed,
        window_start=start.date().isoformat(),
        window_days=days,
        categories=categories,
    )
