"""Identity encoding must preserve field boundaries and transfer destinations."""

from datetime import UTC, datetime
from decimal import Decimal

from ledger_sync.ingest.hash_id import TransactionHasher


def _fields() -> dict:
    return {
        "date": datetime(2026, 1, 1, tzinfo=UTC),
        "amount": Decimal("100.00"),
        "account": "Cash",
        "note": "memo",
        "category": "Food",
        "subcategory": None,
        "tx_type": "Expense",
        "user_id": 1,
    }


def test_delimiters_cannot_move_between_hash_fields() -> None:
    hasher = TransactionHasher()
    first = dict(_fields(), note="memo|food", category="travel")
    second = dict(_fields(), note="memo", category="food|travel")
    assert hasher.generate_transaction_id(**first) != hasher.generate_transaction_id(**second)


def test_legacy_encoding_is_available_only_explicitly() -> None:
    hasher = TransactionHasher()
    first = dict(_fields(), note="memo|food", category="travel")
    second = dict(_fields(), note="memo", category="food|travel")
    assert hasher.generate_transaction_id(**first, version=1) == hasher.generate_transaction_id(
        **second, version=1
    )
    assert hasher.generate_transaction_id(**first) != hasher.generate_transaction_id(
        **first, version=1
    )


def test_transfer_destination_is_explicit_identity() -> None:
    fields = dict(_fields(), tx_type="Transfer", category="Transfer")
    hasher = TransactionHasher()
    assert hasher.generate_transaction_id(
        **fields, to_account="Savings"
    ) != hasher.generate_transaction_id(**fields, to_account="Investment")


def test_currency_is_explicit_identity() -> None:
    hasher = TransactionHasher()
    assert hasher.generate_transaction_id(**_fields(), currency="INR") != (
        hasher.generate_transaction_id(**_fields(), currency="USD")
    )
