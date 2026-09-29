"""Dropdown options and per-type counts for the Transactions page."""

from __future__ import annotations

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from ledger_sync.api.transactions_impl.filters import _base_transaction_query
from ledger_sync.core.query_helpers import apply_excluded_accounts_filter, excluded_accounts_for
from ledger_sync.db.models import Transaction, TransactionTag, TransactionType, User
from ledger_sync.schemas.transactions import TagFacet, TransactionFacetsResponse


def transaction_facets(db: Session, user: User) -> TransactionFacetsResponse:
    """Categories, accounts, tags and type counts from DISTINCT / GROUP BY reads."""
    base = _base_transaction_query(db, user)

    # Categories are split by whether the label is ever used on a non-transfer
    # row. Transfers carry a routing label in `category` ("Transfer: Bank: HDFC
    # -> Stocks: Groww"), which is not a spending category at all: it is a
    # per-account-pair string, so it grows with accounts^2 and swamps the real
    # list. On the reference ledger that is 118 routing labels against 17 real
    # categories, i.e. the dropdown was 87% noise. A label used by BOTH a
    # transfer and a real row counts as real, so nothing legitimate is hidden.
    category_rows = (
        base.with_entities(
            Transaction.category,
            func.min(case((Transaction.type == TransactionType.TRANSFER, 1), else_=0)).label(
                "transfer_only"
            ),
        )
        .group_by(Transaction.category)
        .all()
    )
    categories = [row[0] for row in category_rows if row[0] and not row.transfer_only]
    transfer_categories = [row[0] for row in category_rows if row[0] and row.transfer_only]

    accounts = [
        row[0] for row in base.with_entities(Transaction.account).distinct().all() if row[0]
    ]

    count_rows = base.with_entities(Transaction.type, func.count()).group_by(Transaction.type).all()
    counts: dict[TransactionType, int] = {row[0]: row[1] for row in count_rows}

    income = counts.get(TransactionType.INCOME, 0)
    expense = counts.get(TransactionType.EXPENSE, 0)
    transfer = counts.get(TransactionType.TRANSFER, 0)

    # Tag facets: distinct tags with live-transaction counts. Joins to
    # transactions so soft-deleted rows drop out, and honours the same
    # excluded-accounts preference as the other facets.
    tag_query = (
        db.query(TransactionTag.tag, func.count())
        .join(Transaction, Transaction.transaction_id == TransactionTag.transaction_id)
        .filter(
            TransactionTag.user_id == user.id,
            Transaction.is_deleted.is_(False),
        )
    )
    tag_query = apply_excluded_accounts_filter(tag_query, excluded_accounts_for(user))
    tag_rows = tag_query.group_by(TransactionTag.tag).all()
    tag_facets = [
        TagFacet(name=name, count=count)
        for name, count in sorted(tag_rows, key=lambda r: (-r[1], r[0]))
    ]

    return TransactionFacetsResponse(
        categories=sorted(categories, key=lambda s: s.lower()),
        transfer_categories=sorted(transfer_categories, key=lambda s: s.lower()),
        accounts=sorted(accounts, key=lambda s: s.lower()),
        tags=tag_facets,
        income_count=income,
        expense_count=expense,
        transfer_count=transfer,
        total_count=income + expense + transfer,
    )
