"""Tests for data normalizer."""

from datetime import datetime
from decimal import Decimal

import pandas as pd
import pytest

from ledger_sync.db.models import TransactionType
from ledger_sync.ingest.normalizer import DataNormalizer, NormalizationError


class TestDataNormalizer:
    """Test data normalization."""

    def test_normalize_date_from_datetime(self):
        """Test date normalization from datetime."""
        normalizer = DataNormalizer()
        date = datetime(2024, 1, 15, 10, 30, 0)

        result = normalizer.normalize_date(date)

        assert result == date
        assert isinstance(result, datetime)

    def test_normalize_date_from_string(self):
        """Test date normalization from string."""
        normalizer = DataNormalizer()

        result = normalizer.normalize_date("2024-01-15")

        assert isinstance(result, datetime)
        assert result.year == 2024
        assert result.month == 1
        assert result.day == 15

    def test_normalize_date_missing_value(self):
        """Test that missing date raises error."""
        normalizer = DataNormalizer()

        with pytest.raises(NormalizationError, match="Date value is missing"):
            normalizer.normalize_date(pd.NA)

    def test_normalize_amount_from_float(self):
        """Test amount normalization from float."""
        normalizer = DataNormalizer()

        result = normalizer.normalize_amount(100.5)

        assert result == Decimal("100.50")
        assert isinstance(result, Decimal)

    def test_normalize_amount_from_int(self):
        """Test amount normalization from int."""
        normalizer = DataNormalizer()

        result = normalizer.normalize_amount(100)

        assert result == Decimal("100.00")

    def test_normalize_amount_rounding(self):
        """Test amount rounding to 2 decimal places."""
        normalizer = DataNormalizer()

        result = normalizer.normalize_amount(100.556)

        assert result == Decimal("100.56")

    def test_normalize_string(self):
        """Test string normalization."""
        normalizer = DataNormalizer()

        result = normalizer.normalize_string("  Test String  ")

        assert result == "test string"

    def test_normalize_string_preserve_case(self):
        """Test string normalization preserving case."""
        normalizer = DataNormalizer()

        result = normalizer.normalize_string_preserve_case("  Test String  ")

        assert result == "Test String"

    def test_normalize_transaction_type_expense(self):
        """Test transaction type normalization for expense."""
        normalizer = DataNormalizer()

        result = normalizer.normalize_transaction_type("Exp.")

        assert result == TransactionType.EXPENSE

    def test_normalize_transaction_type_income(self):
        """Test transaction type normalization for income."""
        normalizer = DataNormalizer()

        result = normalizer.normalize_transaction_type("Income")

        assert result == TransactionType.INCOME

    def test_normalize_transaction_type_transfer(self):
        """Test transaction type normalization for transfer."""
        normalizer = DataNormalizer()

        result = normalizer.normalize_transaction_type("Transfer-In")

        assert result == TransactionType.TRANSFER

    def test_normalize_transaction_type_case_insensitive(self):
        """Test that transaction type is case-insensitive."""
        normalizer = DataNormalizer()

        result = normalizer.normalize_transaction_type("EXPENSE")

        assert result == TransactionType.EXPENSE

    def test_normalize_transaction_type_invalid(self):
        """Test that invalid transaction type raises error."""
        normalizer = DataNormalizer()

        with pytest.raises(NormalizationError, match="Unknown transaction type"):
            normalizer.normalize_transaction_type("InvalidType")
