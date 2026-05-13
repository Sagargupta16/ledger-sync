"""Tests for data normalizer."""

from datetime import UTC, datetime
from decimal import Decimal

import pandas as pd
import pytest

from ledger_sync.db.models import TransactionType
from ledger_sync.ingest.normalizer import DataNormalizer, NormalizationError

# Expected values for date assertions
EXPECTED_YEAR = 2024
EXPECTED_DAY = 15


class TestDataNormalizer:
    """Test data normalization."""

    def test_normalize_date_from_datetime(self):
        """Test date normalization from datetime."""
        normalizer = DataNormalizer()
        date = datetime(EXPECTED_YEAR, 1, EXPECTED_DAY, 10, 30, 0, tzinfo=UTC)

        result = normalizer.normalize_date(date)

        assert result == date
        assert isinstance(result, datetime)

    def test_normalize_date_from_string(self):
        """Test date normalization from string."""
        normalizer = DataNormalizer()

        result = normalizer.normalize_date("2024-01-15")

        assert isinstance(result, datetime)
        assert result.year == EXPECTED_YEAR
        assert result.month == 1
        assert result.day == EXPECTED_DAY

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

    def test_bank_name_canonicalization_case_insensitive(self):
        """Bank names should be canonicalized regardless of input casing."""
        normalizer = DataNormalizer()

        assert normalizer._standardize_account("sbi bank") == "SBI bank"
        assert normalizer._standardize_account("SBI Bank") == "SBI Bank"
        assert normalizer._standardize_account("hdfc bank") == "HDFC bank"
        assert normalizer._standardize_account("HDFC BANK") == "HDFC BANK"
        assert normalizer._standardize_account("hdfc cc") == "HDFC cc"
        assert normalizer._standardize_account("Hdfc Credit Card") == "HDFC Credit Card"

    def test_bank_name_longest_match_wins(self):
        """'IDFC First Bank' should canonicalize 'IDFC First', not just 'IDFC'."""
        normalizer = DataNormalizer()

        assert normalizer._standardize_account("idfc first bank") == "IDFC First bank"
        assert normalizer._standardize_account("standard chartered") == "Standard Chartered"

    def test_bank_name_extended_coverage(self):
        """New banks beyond the original five should be canonicalized."""
        normalizer = DataNormalizer()

        assert "Yes" in normalizer._standardize_account("yes bank")
        assert "IndusInd" in normalizer._standardize_account("indusind savings")
        assert "RBL" in normalizer._standardize_account("rbl credit card")
        assert "AU Small Finance" in normalizer._standardize_account("au small finance fd")

    def test_bank_name_word_boundary(self):
        """Canonicalization should not match inside other words."""
        normalizer = DataNormalizer()

        # 'axis' inside 'maxis' or 'taxis' must not be replaced
        assert normalizer._standardize_account("taxis reimbursement") == "taxis reimbursement"
