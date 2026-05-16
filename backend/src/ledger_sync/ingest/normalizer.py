"""Data normalization and preprocessing.

This module provides comprehensive data cleaning and normalization:
- Date parsing from various formats
- Amount normalization to Decimal with 2 decimal places
- Text cleaning (whitespace, unicode, special characters)
- Category and account name standardization
- Transaction type mapping
"""

import re
import unicodedata
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, ClassVar

import pandas as pd

from ledger_sync.db.models import TransactionType
from ledger_sync.ingest.normalizer_rows import NormalizeRowsMixin


class NormalizationError(Exception):
    """Raised when normalization fails."""


FOOD_AND_DINING = "Food & Dining"
ENTERTAINMENT_AND_RECREATIONS = "Entertainment & Recreations"
TRANSFER_IN = "transfer in"
TRANSFER_IN_HYPHEN = "transfer-in"
TRANSFER_OUT_HYPHEN = "transfer-out"


class DataNormalizer(NormalizeRowsMixin):
    """Normalizes and cleans raw Excel data into consistent format."""

    # Common category name corrections (typos, inconsistencies)
    CATEGORY_CORRECTIONS: ClassVar[dict[str, str]] = {
        "food & dinning": FOOD_AND_DINING,
        "food and dining": FOOD_AND_DINING,
        "food&dining": FOOD_AND_DINING,
        "entertianment": ENTERTAINMENT_AND_RECREATIONS,
        "entertainment": ENTERTAINMENT_AND_RECREATIONS,
        "entertainments": ENTERTAINMENT_AND_RECREATIONS,
        "transportation": "Transportation",
        "transport": "Transportation",
        "healthcare": "Healthcare",
        "health care": "Healthcare",
        "health": "Healthcare",
        "utilites": "Utilities",
        "utilities": "Utilities",
        "educaton": "Education",
        "education": "Education",
        "personal care": "Personal Care",
        "personalcare": "Personal Care",
        "charity": "Charity",
        "donation": "Charity",
        "donations": "Charity",
    }

    # Regex patterns for text cleaning
    MULTI_SPACE_PATTERN = re.compile(r"\s+")
    CONTROL_CHAR_PATTERN = re.compile(r"[\x00-\x1f\x7f-\x9f]")
    URL_PATTERN = re.compile(r"https?://\S+|www\.\S+")

    def _clean_text(self, text: str) -> str:
        """Clean text by removing problematic characters and normalizing whitespace.

        Args:
            text: Raw text string

        Returns:
            Cleaned text

        """
        if not text:
            return ""

        # Unicode normalization (NFKC - compatibility decomposition + canonical composition)
        text = unicodedata.normalize("NFKC", text)

        # Remove control characters (except newlines which we'll convert to spaces)
        text = self.CONTROL_CHAR_PATTERN.sub("", text)

        # Replace multiple whitespace (including newlines, tabs) with single space
        text = self.MULTI_SPACE_PATTERN.sub(" ", text)

        # Strip leading/trailing whitespace
        return text.strip()

    def _clean_note(self, note: str) -> str:
        """Clean note field with additional processing.

        Args:
            note: Raw note string

        Returns:
            Cleaned note

        """
        if not note:
            return ""

        # Basic text cleaning
        note = self._clean_text(note)

        # Optionally shorten very long URLs to just domain
        # (keeps the info but reduces noise)
        def shorten_url(match: re.Match[str]) -> str:
            url = match.group(0)
            # Extract domain from URL
            domain_match = re.search(r"(?:https?://)?(?:www\.)?([^/\s]+)", url)
            if domain_match:
                return str(f"[{domain_match.group(1)}]")
            return str(url)

        return self.URL_PATTERN.sub(shorten_url, note)

    def _standardize_category(self, category: str) -> str:
        """Standardize category name for consistency.

        Args:
            category: Raw category name

        Returns:
            Standardized category name

        """
        if not category:
            return ""

        # Clean text first
        category = self._clean_text(category)

        # Check for known corrections (case-insensitive)
        category_lower = category.lower()
        if category_lower in self.CATEGORY_CORRECTIONS:
            return self.CATEGORY_CORRECTIONS[category_lower]

        # Title case for consistency if not in corrections
        # But preserve original if it looks intentional (has mixed case)
        if category.isupper() or category.islower():
            return category.title()

        return category

    # Canonical casing for common Indian bank names. Keys are lowercased
    # tokens as they appear in the account name; the value is the display
    # form we want. Matched as whole words (case-insensitive, ignoring
    # surrounding whitespace) via _BANK_NAME_PATTERN so both
    # "sbi bank" and "SBI Bank" become "SBI Bank", and "HDFC Credit Card"
    # becomes "HDFC Credit Card" (not "hdfc Credit Card").
    BANK_CANONICAL_NAMES: ClassVar[dict[str, str]] = {
        "sbi": "SBI",
        "hdfc": "HDFC",
        "icici": "ICICI",
        "axis": "Axis",
        "kotak": "Kotak",
        "yes": "Yes",
        "idfc": "IDFC",
        "idfc first": "IDFC First",
        "indusind": "IndusInd",
        "pnb": "PNB",
        "bob": "BOB",
        "boi": "BOI",
        "canara": "Canara",
        "union": "Union",
        "federal": "Federal",
        "rbl": "RBL",
        "idbi": "IDBI",
        "citi": "Citi",
        "citibank": "Citibank",
        "hsbc": "HSBC",
        "standard chartered": "Standard Chartered",
        "dbs": "DBS",
        "au small finance": "AU Small Finance",
    }

    def _standardize_account(self, account: str) -> str:
        """Standardize account name for consistency.

        Applies canonical casing to known bank-name tokens while preserving
        the rest of the label. Case-insensitive and works whether or not
        the user wrote "bank" at the end, so "hdfc bank", "HDFC Bank",
        "HDFC CC", and "Hdfc Credit Card" all end up with "HDFC" in the
        right place.
        """
        if not account:
            return ""

        account = self._clean_text(account)

        # Sort keys longest-first so "idfc first" is matched before "idfc",
        # and "standard chartered" before "standard". Case-insensitive
        # whole-token replacement.
        for token in sorted(self.BANK_CANONICAL_NAMES, key=len, reverse=True):
            canonical = self.BANK_CANONICAL_NAMES[token]
            pattern = re.compile(rf"\b{re.escape(token)}\b", re.IGNORECASE)
            account = pattern.sub(canonical, account)

        return account

    def normalize_date(self, value: Any) -> datetime:
        """Normalize date value to datetime.

        Args:
            value: Raw date value

        Returns:
            Normalized datetime

        Raises:
            NormalizationError: If date cannot be parsed

        """
        if pd.isna(value):
            msg = "Date value is missing"
            raise NormalizationError(msg)

        if isinstance(value, datetime):
            return value

        try:
            result = pd.to_datetime(value)
            if isinstance(result, pd.Timestamp):
                return result.to_pydatetime()
            return datetime(result.year, result.month, result.day)
        except (ValueError, TypeError) as e:
            msg = f"Cannot parse date '{value}': {e}"
            raise NormalizationError(msg) from e

    def normalize_amount(self, value: Any) -> Decimal:
        """Normalize amount to Decimal.

        Args:
            value: Raw amount value

        Returns:
            Normalized Decimal amount

        Raises:
            NormalizationError: If amount cannot be converted

        """
        if pd.isna(value):
            msg = "Amount value is missing"
            raise NormalizationError(msg)

        try:
            # Convert to float first (handles pandas numeric types)
            float_value = float(value)
            # Round to 2 decimal places for consistency
            return Decimal(str(round(float_value, 2)))
        except (ValueError, InvalidOperation) as e:
            msg = f"Cannot convert amount '{value}': {e}"
            raise NormalizationError(msg) from e

    def normalize_string(self, value: Any) -> str:
        """Normalize string value with full cleaning.

        Args:
            value: Raw string value

        Returns:
            Normalized string (cleaned, lowercased)

        """
        if pd.isna(value):
            return ""

        cleaned = self._clean_text(str(value))
        return cleaned.lower()

    def normalize_string_preserve_case(self, value: Any) -> str:
        """Normalize string value while preserving case.

        Args:
            value: Raw string value

        Returns:
            Normalized string (cleaned, case preserved)

        """
        if pd.isna(value):
            return ""

        return self._clean_text(str(value))

    def normalize_transaction_type(self, value: Any) -> TransactionType:
        """Normalize transaction type (Income/Expense/Transfer).

        Args:
            value: Raw type value

        Returns:
            TransactionType enum value

        Raises:
            NormalizationError: If type cannot be determined

        """
        if pd.isna(value):
            msg = "Transaction type is missing"
            raise NormalizationError(msg)

        value_str = str(value).strip().lower()

        # Map various representations to our enum
        type_mapping = {
            "exp.": TransactionType.EXPENSE,
            "expense": TransactionType.EXPENSE,
            "expenses": TransactionType.EXPENSE,
            "income": TransactionType.INCOME,
            "transfer": TransactionType.TRANSFER,
            TRANSFER_IN_HYPHEN: TransactionType.TRANSFER,
            TRANSFER_IN: TransactionType.TRANSFER,
            TRANSFER_OUT_HYPHEN: TransactionType.TRANSFER,
            "transfer out": TransactionType.TRANSFER,
        }

        transaction_type = type_mapping.get(value_str)
        if transaction_type is None:
            msg = f"Unknown transaction type: {value}"
            raise NormalizationError(msg)

        return transaction_type
