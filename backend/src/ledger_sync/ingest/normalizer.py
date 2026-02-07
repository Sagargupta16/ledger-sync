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
from ledger_sync.utils.logging import logger


class NormalizationError(Exception):
    """Raised when normalization fails."""


FOOD_AND_DINING = "Food & Dining"
ENTERTAINMENT_AND_RECREATIONS = "Entertainment & Recreations"


class DataNormalizer:
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
        def shorten_url(match: re.Match) -> str:
            url = match.group(0)
            # Extract domain from URL
            domain_match = re.search(r"(?:https?://)?(?:www\.)?([^/\s]+)", url)
            if domain_match:
                return f"[{domain_match.group(1)}]"
            return url

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

    def _standardize_account(self, account: str) -> str:
        """Standardize account name for consistency.

        Args:
            account: Raw account name

        Returns:
            Standardized account name

        """
        if not account:
            return ""

        # Clean text
        account = self._clean_text(account)

        # Common account name fixes
        account_fixes = {
            "sbi bank": "SBI Bank",
            "hdfc bank": "HDFC Bank",
            "icici bank": "ICICI Bank",
            "axis bank": "Axis Bank",
            "kotak bank": "Kotak Bank",
        }

        account_lower = account.lower()
        if account_lower in account_fixes:
            return account_fixes[account_lower]

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
            return pd.to_datetime(value)
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
            "transfer-in": TransactionType.TRANSFER,
            "transfer in": TransactionType.TRANSFER,
            "transfer-out": TransactionType.TRANSFER,
            "transfer out": TransactionType.TRANSFER,
        }

        transaction_type = type_mapping.get(value_str)
        if transaction_type is None:
            msg = f"Unknown transaction type: {value}"
            raise NormalizationError(msg)

        return transaction_type

    def _extract_currency(self, row: pd.Series) -> str:
        """Extract and clean currency from row, defaulting to INR.

        Args:
            row: DataFrame row

        Returns:
            Uppercase currency string

        """
        for col in ["Currency", "currency"]:
            if col in row.index and not pd.isna(row[col]):
                return self._clean_text(str(row[col])).upper()
        return "INR"

    def _extract_subcategory(self, row: pd.Series) -> str | None:
        """Extract and clean subcategory from row.

        Args:
            row: DataFrame row

        Returns:
            Cleaned subcategory string or None

        """
        for col in ["Subcategory", "subcategory", "Sub Category"]:
            if col in row.index and not pd.isna(row[col]):
                return self._clean_text(str(row[col]))
        return None

    def _extract_note(self, row: pd.Series, column_mapping: dict[str, str]) -> str | None:
        """Extract and clean note from row with URL shortening.

        Args:
            row: DataFrame row
            column_mapping: Mapping of standard names to actual column names

        Returns:
            Cleaned note string or None

        """
        note_col = column_mapping.get("note")
        if note_col and note_col in row.index and not pd.isna(row[note_col]):
            return self._clean_note(str(row[note_col]))
        return None

    def _build_transfer_normalized(
        self,
        row: pd.Series,
        column_mapping: dict[str, str],
        raw_type: str,
        account: str,
        category: str,
        tx_type: TransactionType,
        currency: str,
        subcategory: str | None,
        note: str | None,
    ) -> dict[str, Any]:
        """Build normalized dict for a transfer transaction.

        Args:
            row: DataFrame row
            column_mapping: Mapping of standard names to actual column names
            raw_type: Lowercased raw type string
            account: Standardized account name
            category: Standardized category name
            tx_type: Normalized transaction type
            currency: Currency string
            subcategory: Optional subcategory
            note: Optional note

        Returns:
            Normalized transfer dict

        """
        if "transfer-in" in raw_type or "transfer in" in raw_type:
            # Money coming IN: category is source (from), account is destination (to)
            from_account = self._standardize_account(category)
            to_account = self._standardize_account(account)
        else:
            # Money going OUT (default): account is source (from), category is destination (to)
            from_account = self._standardize_account(account)
            to_account = self._standardize_account(category)

        return {
            "date": self.normalize_date(row[column_mapping["date"]]),
            "amount": self.normalize_amount(row[column_mapping["amount"]]),
            "currency": currency,
            "type": tx_type,
            "account": from_account,
            "from_account": from_account,
            "to_account": to_account,
            "category": f"Transfer: {from_account} → {to_account}",
            "subcategory": subcategory,
            "note": note,
            "is_transfer": True,
        }

    def normalize_row(self, row: pd.Series, column_mapping: dict[str, str]) -> dict[str, Any]:
        """Normalize a single row from Excel with full preprocessing.

        Preprocessing includes:
        - Text cleaning (whitespace, unicode, control chars)
        - Category standardization
        - Account name standardization
        - Note cleaning (URLs shortened)

        Args:
            row: DataFrame row
            column_mapping: Mapping of standard names to actual column names

        Returns:
            Dictionary of normalized values

        Raises:
            NormalizationError: If normalization fails

        """
        try:
            currency = self._extract_currency(row)
            subcategory = self._extract_subcategory(row)
            note = self._extract_note(row, column_mapping)

            # Check if this is a transfer or regular transaction
            raw_type = str(row[column_mapping["type"]]).strip().lower()
            is_transfer = any(x in raw_type for x in ["transfer", "transfer-in", "transfer-out"])

            # Standardize account and category names
            account = self._standardize_account(str(row[column_mapping["account"]]))
            category = self._standardize_category(str(row[column_mapping["category"]]))

            # Normalize the type
            tx_type = self.normalize_transaction_type(row[column_mapping["type"]])

            if is_transfer:
                normalized = self._build_transfer_normalized(
                    row,
                    column_mapping,
                    raw_type,
                    account,
                    category,
                    tx_type,
                    currency,
                    subcategory,
                    note,
                )
            else:
                # Handle regular transactions (Income/Expense)
                normalized = {
                    "date": self.normalize_date(row[column_mapping["date"]]),
                    "amount": self.normalize_amount(row[column_mapping["amount"]]),
                    "currency": currency,
                    "type": tx_type,
                    "account": account,
                    "from_account": None,
                    "to_account": None,
                    "category": category,
                    "subcategory": subcategory,
                    "note": note,
                    "is_transfer": False,
                }

        except NormalizationError:
            raise
        except (ValueError, TypeError, KeyError) as e:
            msg = f"Unexpected error normalizing row: {e}"
            raise NormalizationError(msg) from e
        else:
            return normalized

    def normalize_dataframe(
        self,
        df: pd.DataFrame,
        column_mapping: dict[str, str],
    ) -> list[dict[str, Any]]:
        """Normalize entire DataFrame.

        Args:
            df: DataFrame to normalize
            column_mapping: Column name mapping

        Returns:
            List of normalized row dictionaries

        """
        normalized_rows = []
        errors = []

        for idx, row in df.iterrows():
            try:
                normalized = self.normalize_row(row, column_mapping)
                normalized_rows.append(normalized)
            except NormalizationError as e:
                error_msg = f"Row {idx + 2}: {e}"  # +2 for Excel row number (1-indexed + header)
                errors.append(error_msg)
                logger.warning(error_msg)

        if errors:
            logger.warning(f"Skipped {len(errors)} rows due to normalization errors")

        logger.info(f"Successfully normalized {len(normalized_rows)} rows")
        return normalized_rows
