"""Integration tests for the GET /api/transactions/facets endpoint.

The facets endpoint replaced three full-ledger fetches on the Transactions
page. These tests lock in the behaviour the page depends on:

1. Distinct categories/accounts + per-type counts are correct.
2. Counts/options are user-scoped (no cross-user leakage).
3. Soft-deleted rows are excluded.
4. The user's excluded_accounts preference is honoured.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from ledger_sync.api.transactions import get_transaction_facets
from ledger_sync.db.models import Transaction, TransactionType, User, UserPreferences


def _add(
    session: Session,
    user_id: int,
    tx_id: str,
    tx_type: TransactionType,
    account: str,
    category: str,
    *,
    is_deleted: bool = False,
    from_account: str | None = None,
    to_account: str | None = None,
) -> None:
    session.add(
        Transaction(
            user_id=user_id,
            transaction_id=tx_id,
            date=datetime(2024, 1, 15, tzinfo=UTC),
            amount=Decimal("100.00"),
            currency="INR",
            type=tx_type,
            account=account,
            category=category,
            from_account=from_account,
            to_account=to_account,
            source_file="test.xlsx",
            last_seen_at=datetime(2024, 1, 15, tzinfo=UTC),
            is_deleted=is_deleted,
        )
    )


def _call(user: User, db: Session):
    return get_transaction_facets(user, db)


def test_facets_returns_distinct_options_and_type_counts(
    test_db_session: Session, make_user
) -> None:
    user = make_user("a@example.com")
    _add(test_db_session, user.id, "1", TransactionType.INCOME, "HDFC", "Salary")
    _add(test_db_session, user.id, "2", TransactionType.EXPENSE, "HDFC", "Food")
    _add(test_db_session, user.id, "3", TransactionType.EXPENSE, "Cash", "Food")
    _add(test_db_session, user.id, "4", TransactionType.TRANSFER, "HDFC", "Transfer")
    test_db_session.commit()

    res = _call(user, test_db_session)

    # Distinct, sorted (case-insensitive). "Transfer" is a routing label -- it
    # only ever appears on a transfer row -- so it lands in the separate list.
    assert res.categories == ["Food", "Salary"]
    assert res.transfer_categories == ["Transfer"]
    assert res.accounts == ["Cash", "HDFC"]
    assert res.income_count == 1
    assert res.expense_count == 2
    assert res.transfer_count == 1
    assert res.total_count == 4


def test_facets_are_user_scoped(test_db_session: Session, make_user) -> None:
    alice = make_user("alice@example.com")
    bob = make_user("bob@example.com")
    _add(test_db_session, alice.id, "a1", TransactionType.EXPENSE, "Alice Bank", "Food")
    _add(test_db_session, bob.id, "b1", TransactionType.EXPENSE, "Bob Bank", "Rent")
    test_db_session.commit()

    res = _call(alice, test_db_session)

    assert res.accounts == ["Alice Bank"]
    assert res.categories == ["Food"]
    assert res.total_count == 1


def test_facets_exclude_soft_deleted(test_db_session: Session, make_user) -> None:
    user = make_user("c@example.com")
    _add(test_db_session, user.id, "live", TransactionType.EXPENSE, "HDFC", "Food")
    _add(
        test_db_session,
        user.id,
        "dead",
        TransactionType.EXPENSE,
        "GhostBank",
        "GhostCategory",
        is_deleted=True,
    )
    test_db_session.commit()

    res = _call(user, test_db_session)

    assert "GhostBank" not in res.accounts
    assert "GhostCategory" not in res.categories
    assert res.expense_count == 1
    assert res.total_count == 1


def test_transfer_routing_labels_are_kept_out_of_the_category_dropdown(
    test_db_session: Session,
    make_user,
) -> None:
    """The defect: the category filter was mostly transfer routing labels.

    Transfers store a per-account-pair string in ``category`` ("Transfer: Bank:
    HDFC -> Stocks: Groww"), so the list grows with the square of the account
    count. On the reference ledger that was 118 routing labels against 17 real
    categories, i.e. the user scrolled past 87% noise to reach "Food & Dining".
    """
    user = make_user("routing@example.com")
    _add(test_db_session, user.id, "e1", TransactionType.EXPENSE, "HDFC", "Food & Dining")
    for i, route in enumerate(
        ["Transfer: HDFC -> Groww", "Transfer: SBI -> GPay", "Transfer: Groww -> SBI"]
    ):
        _add(test_db_session, user.id, f"t{i}", TransactionType.TRANSFER, "HDFC", route)
    test_db_session.commit()

    res = _call(user, test_db_session)

    assert res.categories == ["Food & Dining"]
    # Still returned, just tiered: filtering by one route stays possible.
    assert res.transfer_categories == [
        "Transfer: Groww -> SBI",
        "Transfer: HDFC -> Groww",
        "Transfer: SBI -> GPay",
    ]


def test_a_category_shared_with_a_real_row_stays_a_real_category(
    test_db_session: Session, make_user
) -> None:
    """The split must not hide a category the user genuinely spends against.

    Some ledgers reuse a plain category name on a transfer row. The rule is
    "transfer-only", not "ever a transfer", so one real row is enough to keep it.
    """
    user = make_user("shared@example.com")
    _add(test_db_session, user.id, "s1", TransactionType.EXPENSE, "HDFC", "Investment Expenses")
    _add(test_db_session, user.id, "s2", TransactionType.TRANSFER, "HDFC", "Investment Expenses")
    test_db_session.commit()

    res = _call(user, test_db_session)

    assert res.categories == ["Investment Expenses"]
    assert res.transfer_categories == []


def test_split_categories_never_overlap_and_cover_everything(
    test_db_session: Session, make_user
) -> None:
    """Partition invariant: every live category appears in exactly one list."""
    user = make_user("partition@example.com")
    _add(test_db_session, user.id, "p1", TransactionType.EXPENSE, "HDFC", "Food")
    _add(test_db_session, user.id, "p2", TransactionType.INCOME, "HDFC", "Salary")
    _add(test_db_session, user.id, "p3", TransactionType.TRANSFER, "HDFC", "Transfer: A -> B")
    _add(test_db_session, user.id, "p4", TransactionType.TRANSFER, "HDFC", "Food")
    test_db_session.commit()

    res = _call(user, test_db_session)

    assert set(res.categories) & set(res.transfer_categories) == set()
    assert set(res.categories) | set(res.transfer_categories) == {
        "Food",
        "Salary",
        "Transfer: A -> B",
    }


def test_facets_honour_excluded_accounts(test_db_session: Session, make_user) -> None:
    user = make_user("d@example.com")
    test_db_session.add(
        UserPreferences(user_id=user.id, excluded_accounts=json.dumps(["Excluded Wallet"]))
    )
    _add(test_db_session, user.id, "keep", TransactionType.EXPENSE, "HDFC", "Food")
    _add(test_db_session, user.id, "drop", TransactionType.EXPENSE, "Excluded Wallet", "Food")
    test_db_session.commit()

    res = _call(user, test_db_session)

    assert "Excluded Wallet" not in res.accounts
    assert res.accounts == ["HDFC"]
    assert res.expense_count == 1
