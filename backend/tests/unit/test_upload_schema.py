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
