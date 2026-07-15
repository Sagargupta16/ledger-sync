"""Import-time canonicalization of case-variant account names.

"CC: Axis Google Flex" and "CC: AXIS Google Flex" are the same real
account; SyncEngine._canonicalize_account_casing folds every spelling of a
lowercased key onto one canonical form before hashing, so downstream
consumers (balances, net worth, classifications) see a single account.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ledger_sync.core.sync_engine import SyncEngine
from ledger_sync.db.models import Transaction, User


def _row(**overrides: Any) -> dict[str, Any]:
    row: dict[str, Any] = {
        "date": "2026-06-01",
        "amount": 250.0,
        "currency": "INR",
        "type": "Expense",
        "account": "CC: Axis Google Flex",
        "category": "Food",
        "subcategory": None,
        "note": "swiggy order",
    }
    row.update(overrides)
    return row


def _accounts(session: Session, user: User) -> set[str]:
    rows = (
        session.query(Transaction.account).filter(Transaction.user_id == user.id).distinct().all()
    )
    return {r[0] for r in rows}


def test_case_variants_within_one_batch_fold_to_first_spelling(two_user_client) -> None:
    _, session, user_a, _, _ = two_user_client
    engine = SyncEngine(session, user_id=user_a.id)

    rows = [
        _row(note="order 1"),
        _row(account="CC: AXIS Google Flex", note="order 2"),
        _row(account="cc: axis google flex", note="order 3"),
    ]
    stats = engine.import_rows(rows, file_name="june.xlsx", file_hash="hash-1")

    assert stats.inserted == 3
    assert _accounts(session, user_a) == {"CC: Axis Google Flex"}


def test_new_upload_folds_onto_existing_ledger_spelling(two_user_client) -> None:
    _, session, user_a, _, _ = two_user_client
    engine = SyncEngine(session, user_id=user_a.id)

    engine.import_rows([_row()], file_name="june.xlsx", file_hash="hash-1")
    # Second file spells the same account differently -- existing wins.
    engine.import_rows(
        [_row(account="CC: AXIS GOOGLE FLEX", note="order 2")],
        file_name="july.xlsx",
        file_hash="hash-2",
    )

    assert _accounts(session, user_a) == {"CC: Axis Google Flex"}


def test_transfer_legs_and_category_label_fold_together(two_user_client) -> None:
    _, session, user_a, _, _ = two_user_client
    engine = SyncEngine(session, user_id=user_a.id)

    engine.import_rows(
        [_row(account="Bank: SBI", note="opening")],
        file_name="june.xlsx",
        file_hash="hash-1",
    )
    engine.import_rows(
        [
            {
                "date": "2026-06-02",
                "amount": 500.0,
                "currency": "INR",
                "type": "Transfer-Out",
                "account": "bank: sbi",
                "category": "Wallet: GPay",
                "subcategory": None,
                "note": "top-up",
            }
        ],
        file_name="july.xlsx",
        file_hash="hash-2",
    )

    xfer = (
        session.query(Transaction)
        .filter(Transaction.user_id == user_a.id, Transaction.from_account.is_not(None))
        .one()
    )
    assert xfer.from_account == "Bank: SBI"
    assert xfer.account == "Bank: SBI"
    assert xfer.category == "Transfer: Bank: SBI → Wallet: GPay"


def test_folding_is_user_scoped(two_user_client) -> None:
    # "PayTM" is deliberately NOT in BANK_CANONICAL_NAMES: known bank tokens
    # (Axis, HDFC, ...) are already re-cased by _standardize_account for every
    # user, which would mask the scoping behaviour under test.
    _, session, user_a, user_b, _ = two_user_client

    SyncEngine(session, user_id=user_a.id).import_rows(
        [_row(account="Wallet: PayTM")], file_name="a.xlsx", file_hash="hash-a"
    )
    # User B's own spelling must NOT fold onto user A's canonical form.
    SyncEngine(session, user_id=user_b.id).import_rows(
        [_row(account="Wallet: PAYTM")], file_name="b.xlsx", file_hash="hash-b"
    )

    assert _accounts(session, user_a) == {"Wallet: PayTM"}
    assert _accounts(session, user_b) == {"Wallet: PAYTM"}
