"""Integration tests for the GET /api/calculations/income-facets endpoint.

The endpoint feeds the Settings income-classification audit, which reconciles
the four exact-match ``*_income_categories`` preference lists against the
buckets the ledger actually carries. The audit is only as trustworthy as this
response, so these tests lock in:

1. One row per ``(category, subcategory)`` income bucket with count + sum.
2. Income only -- expenses and transfers never appear.
3. User scoping, soft-delete exclusion, and the excluded-accounts preference.
4. Null subcategory coalescing to the same label the rest of the app uses
   ("Other"), so a key the UI shows can be matched.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from ledger_sync.api.calculations import get_income_facets
from ledger_sync.db.models import Transaction, TransactionType, UserPreferences

if TYPE_CHECKING:
    from collections.abc import Callable

    from sqlalchemy.orm import Session

    from ledger_sync.db.models import User


def _add(
    session: Session,
    user_id: int,
    tx_id: str,
    tx_type: TransactionType,
    category: str,
    subcategory: str | None,
    amount: str = "100.00",
    *,
    account: str = "HDFC",
    is_deleted: bool = False,
) -> None:
    session.add(
        Transaction(
            user_id=user_id,
            transaction_id=tx_id,
            date=datetime(2024, 1, 15, tzinfo=UTC),
            amount=Decimal(amount),
            currency="INR",
            type=tx_type,
            account=account,
            category=category,
            subcategory=subcategory,
            source_file="test.xlsx",
            last_seen_at=datetime(2024, 1, 15, tzinfo=UTC),
            is_deleted=is_deleted,
        )
    )


def _by_key(response: dict) -> dict[str, dict]:
    return {f"{f['category']}::{f['subcategory']}": f for f in response["facets"]}


def test_groups_income_by_category_and_subcategory(
    test_db_session: Session, test_user: User
) -> None:
    _add(test_db_session, test_user.id, "1", TransactionType.INCOME, "Salary", "Basic", "50000.00")
    _add(test_db_session, test_user.id, "2", TransactionType.INCOME, "Salary", "Basic", "50000.00")
    _add(test_db_session, test_user.id, "3", TransactionType.INCOME, "Salary", "Bonus", "10000.00")
    _add(
        test_db_session,
        test_user.id,
        "4",
        TransactionType.INCOME,
        "Refunds & Cashbacks",
        "Deposit Return",
        "200.00",
    )
    test_db_session.commit()

    facets = _by_key(get_income_facets(test_user, test_db_session))

    assert set(facets) == {
        "Salary::Basic",
        "Salary::Bonus",
        "Refunds & Cashbacks::Deposit Return",
    }
    assert facets["Salary::Basic"] == {
        "category": "Salary",
        "subcategory": "Basic",
        "total": 100000.0,
        "count": 2,
    }
    assert facets["Refunds & Cashbacks::Deposit Return"]["total"] == 200.0
    assert facets["Refunds & Cashbacks::Deposit Return"]["count"] == 1


def test_excludes_expenses_and_transfers(test_db_session: Session, test_user: User) -> None:
    _add(test_db_session, test_user.id, "in", TransactionType.INCOME, "Salary", "Basic")
    _add(test_db_session, test_user.id, "out", TransactionType.EXPENSE, "Food", "Groceries")
    _add(test_db_session, test_user.id, "mv", TransactionType.TRANSFER, "Transfer", "Internal")
    test_db_session.commit()

    facets = _by_key(get_income_facets(test_user, test_db_session))

    assert set(facets) == {"Salary::Basic"}


def test_is_user_scoped(
    test_db_session: Session, test_user: User, make_user: Callable[[str], User]
) -> None:
    other = make_user("other@example.com")
    _add(test_db_session, test_user.id, "a1", TransactionType.INCOME, "Salary", "Basic")
    _add(test_db_session, other.id, "b1", TransactionType.INCOME, "Freelance", "Consulting")
    test_db_session.commit()

    facets = _by_key(get_income_facets(test_user, test_db_session))

    assert set(facets) == {"Salary::Basic"}


def test_excludes_soft_deleted(test_db_session: Session, test_user: User) -> None:
    _add(test_db_session, test_user.id, "live", TransactionType.INCOME, "Salary", "Basic")
    _add(
        test_db_session,
        test_user.id,
        "dead",
        TransactionType.INCOME,
        "Ghost",
        "Removed",
        is_deleted=True,
    )
    test_db_session.commit()

    facets = _by_key(get_income_facets(test_user, test_db_session))

    assert set(facets) == {"Salary::Basic"}


def test_honours_excluded_accounts(test_db_session: Session, test_user: User) -> None:
    test_db_session.add(
        UserPreferences(user_id=test_user.id, excluded_accounts=json.dumps(["Excluded Wallet"]))
    )
    _add(test_db_session, test_user.id, "keep", TransactionType.INCOME, "Salary", "Basic")
    _add(
        test_db_session,
        test_user.id,
        "drop",
        TransactionType.INCOME,
        "Gift",
        "Cash Gift",
        account="Excluded Wallet",
    )
    test_db_session.commit()

    facets = _by_key(get_income_facets(test_user, test_db_session))

    assert set(facets) == {"Salary::Basic"}


def test_coalesces_null_subcategory_to_other(test_db_session: Session, test_user: User) -> None:
    # The audit matches on "Category::Subcategory" strings built from these
    # labels, so they must agree with /categories/master's coalescing.
    # (``category`` is NOT NULL in the schema; only ``subcategory`` is
    # nullable, so only that side is exercisable here.)
    _add(test_db_session, test_user.id, "1", TransactionType.INCOME, "Salary", None)
    _add(test_db_session, test_user.id, "2", TransactionType.INCOME, "Salary", "Basic")
    test_db_session.commit()

    facets = _by_key(get_income_facets(test_user, test_db_session))

    assert set(facets) == {"Salary::Other", "Salary::Basic"}


def test_sign_flipped_correction_row_does_not_shrink_its_bucket(
    test_db_session: Session, test_user: User
) -> None:
    # Income is stored positive; a negative correction row would otherwise
    # subtract from the bucket and understate the money at stake.
    _add(test_db_session, test_user.id, "1", TransactionType.INCOME, "Salary", "Basic", "-500.00")
    test_db_session.commit()

    facets = _by_key(get_income_facets(test_user, test_db_session))

    assert facets["Salary::Basic"]["total"] == 500.0
