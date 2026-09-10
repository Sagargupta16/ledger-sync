"""Tests for the upload request schema validation."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from ledger_sync.schemas.upload import (
    MAX_UPLOAD_ROWS,
    TransactionRow,
    TransactionUploadRequest,
)


def _row() -> dict:
    return {
        "date": "2024-01-15",
        "amount": 100.0,
        "currency": "INR",
        "type": "Expense",
        "account": "HDFC",
        "category": "Food",
        "subcategory": None,
        "note": None,
    }


def test_upload_request_accepts_at_most_max_rows() -> None:
    row = _row()
    payload = TransactionUploadRequest(
        file_name="test.xlsx",
        file_hash="a" * 64,
        rows=[TransactionRow(**row) for _ in range(10)],
    )
    assert len(payload.rows) == 10


def test_upload_request_rejects_over_cap() -> None:
    row_obj = TransactionRow(**_row())
    # Reuse the validated row to stay under a second even at the cap.
    with pytest.raises(ValidationError) as excinfo:
        TransactionUploadRequest(
            file_name="test.xlsx",
            file_hash="a" * 64,
            rows=[row_obj] * (MAX_UPLOAD_ROWS + 1),
        )
    assert "rows" in str(excinfo.value)


def test_upload_request_rejects_empty_rows() -> None:
    with pytest.raises(ValidationError):
        TransactionUploadRequest(
            file_name="test.xlsx",
            file_hash="a" * 64,
            rows=[],
        )


@pytest.mark.parametrize(
    "changes",
    [
        {"date": "2026-02-30"},
        {"date": "2026-01-15 garbage"},
        {"amount": "100abc"},
        {"amount": float("inf")},
        {"amount": float("nan")},
        {"amount": 10_000_000_000_000},
        {"currency": "USD"},
        {"account": " "},
        {"account": "a" * 256},
        {"category": "a" * 256},
        {"subcategory": "a" * 256},
        {"note": "a" * 10_001},
        {"type": "unknown"},
    ],
)
def test_invalid_row_is_rejected_at_request_boundary(changes: dict) -> None:
    with pytest.raises(ValidationError):
        TransactionRow(**(_row() | changes))


def test_upload_rejects_non_hex_hash_and_oversized_filename() -> None:
    for changes in ({"file_hash": "z" * 64}, {"file_name": "a" * 501}):
        with pytest.raises(ValidationError):
            TransactionUploadRequest(
                **({"file_name": "test.csv", "file_hash": "a" * 64, "rows": [_row()]} | changes)
            )


def test_row_preserves_decimal_digits_for_backend_rounding() -> None:
    row = TransactionRow(**(_row() | {"amount": "10.075", "currency": "inr"}))
    assert str(row.amount) == "10.075"
    assert row.currency == "INR"
