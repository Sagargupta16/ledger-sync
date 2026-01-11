"""Data normalization."""

from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

import pandas as pd

from ledger_sync.db.models import TransactionType, TransferType
from ledger_sync.utils.logging import logger


class NormalizationError(Exception):
    """Raised when normalization fails."""

    pass


class DataNormalizer:
    """Normalizes raw Excel data into consistent format."""

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
            raise NormalizationError("Date value is missing")

        if isinstance(value, datetime):
            return value

        try:
            return pd.to_datetime(value)
        except Exception as e:
            raise NormalizationError(f"Cannot parse date '{value}': {e}")

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
            raise NormalizationError("Amount value is missing")

        try:
            # Convert to float first (handles pandas numeric types)
            float_value = float(value)
            # Round to 2 decimal places for consistency
            return Decimal(str(round(float_value, 2)))
        except (ValueError, InvalidOperation) as e:
            raise NormalizationError(f"Cannot convert amount '{value}': {e}")

    def normalize_string(self, value: Any) -> str:
        """Normalize string value.

        Args:
            value: Raw string value

        Returns:
            Normalized string (lowercased, trimmed)
        """
        if pd.isna(value):
            return ""

        return str(value).strip().lower()

    def normalize_string_preserve_case(self, value: Any) -> str:
        """Normalize string value while preserving case.

        Args:
            value: Raw string value

        Returns:
            Normalized string (trimmed only)
        """
        if pd.isna(value):
            return ""

        return str(value).strip()

    def normalize_transaction_type(self, value: Any) -> TransactionType:
        """Normalize transaction type (Income/Expense only).

        Args:
            value: Raw type value

        Returns:
            TransactionType enum value

        Raises:
            NormalizationError: If type cannot be determined or is a transfer
        """
        if pd.isna(value):
            raise NormalizationError("Transaction type is missing")

        value_str = str(value).strip().lower()

        # Map various representations to our enum
        type_mapping = {
            "exp.": TransactionType.EXPENSE,
            "expense": TransactionType.EXPENSE,
            "expenses": TransactionType.EXPENSE,
            "income": TransactionType.INCOME,
        }

        transaction_type = type_mapping.get(value_str)
        if transaction_type is None:
            # Check if it's a transfer
            if any(x in value_str for x in ["transfer", "transfer-in", "transfer-out"]):
                raise NormalizationError(
                    f"Transfer type detected, use normalize_transfer_type: {value}"
                )
            raise NormalizationError(f"Unknown transaction type: {value}")

        return transaction_type

    def normalize_transfer_type(self, value: Any) -> TransferType:
        """Normalize transfer type (Transfer-In/Transfer-Out).

        Args:
            value: Raw type value

        Returns:
            TransferType enum value

        Raises:
            NormalizationError: If type cannot be determined
        """
        if pd.isna(value):
            raise NormalizationError("Transfer type is missing")

        value_str = str(value).strip().lower()

        # Map various representations to our enum
        type_mapping = {
            "transfer-in": TransferType.TRANSFER_IN,
            "transfer in": TransferType.TRANSFER_IN,
            "transfer-out": TransferType.TRANSFER_OUT,
            "transfer out": TransferType.TRANSFER_OUT,
            "transfer": TransferType.TRANSFER_OUT,  # Default to OUT
        }

        transfer_type = type_mapping.get(value_str)
        if transfer_type is None:
            raise NormalizationError(f"Unknown transfer type: {value}")

        return transfer_type

    def normalize_row(self, row: pd.Series, column_mapping: dict[str, str]) -> dict[str, Any]:
        """Normalize a single row from Excel.

        Args:
            row: DataFrame row
            column_mapping: Mapping of standard names to actual column names

        Returns:
            Dictionary of normalized values

        Raises:
            NormalizationError: If normalization fails
        """
        try:
            # Get currency (optional, defaults to INR)
            currency_col = None
            for col in ["Currency", "currency"]:
                if col in row.index:
                    currency_col = col
                    break

            currency = "INR"
            if currency_col and not pd.isna(row[currency_col]):
                currency = self.normalize_string_preserve_case(row[currency_col]).upper()

            # Get optional fields
            subcategory = None
            for col in ["Subcategory", "subcategory", "Sub Category"]:
                if col in row.index and not pd.isna(row[col]):
                    subcategory = self.normalize_string_preserve_case(row[col])
                    break

            note = None
            note_col = column_mapping.get("note")
            if note_col and note_col in row.index and not pd.isna(row[note_col]):
                note = self.normalize_string_preserve_case(row[note_col])

            # Check if this is a transfer or regular transaction
            raw_type = str(row[column_mapping["type"]]).strip().lower()
            is_transfer = any(x in raw_type for x in ["transfer", "transfer-in", "transfer-out"])

            account = self.normalize_string_preserve_case(row[column_mapping["account"]])
            category = self.normalize_string_preserve_case(row[column_mapping["category"]])

            if is_transfer:
                # Handle transfers
                transfer_type = self.normalize_transfer_type(row[column_mapping["type"]])

                # Determine from/to accounts
                if transfer_type == TransferType.TRANSFER_IN:
                    # Money coming IN: category is source, account is destination
                    from_account = category
                    to_account = account
                elif transfer_type == TransferType.TRANSFER_OUT:
                    # Money going OUT: account is source, category is destination
                    from_account = account
                    to_account = category
                else:
                    from_account = account
                    to_account = category

                normalized = {
                    "date": self.normalize_date(row[column_mapping["date"]]),
                    "amount": self.normalize_amount(row[column_mapping["amount"]]),
                    "currency": currency,
                    "type": transfer_type,
                    "from_account": from_account,
                    "to_account": to_account,
                    "category": f"Transfer: {from_account} → {to_account}",
                    "subcategory": subcategory,
                    "note": note,
                    "is_transfer": True,
                }
            else:
                # Handle regular transactions (Income/Expense)
                tx_type = self.normalize_transaction_type(row[column_mapping["type"]])

                normalized = {
                    "date": self.normalize_date(row[column_mapping["date"]]),
                    "amount": self.normalize_amount(row[column_mapping["amount"]]),
                    "currency": currency,
                    "type": tx_type,
                    "account": account,
                    "category": category,
                    "subcategory": subcategory,
                    "note": note,
                    "is_transfer": False,
                }

            return normalized

        except NormalizationError:
            raise
        except Exception as e:
            raise NormalizationError(f"Unexpected error normalizing row: {e}")

    def normalize_dataframe(
        self, df: pd.DataFrame, column_mapping: dict[str, str]
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
