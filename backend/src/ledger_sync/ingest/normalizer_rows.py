"""Row-level normalization methods for DataNormalizer.

Mixed into the main DataNormalizer class to keep both modules under 500 LOC.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Any

import pandas as pd

from ledger_sync.db.models import TransactionType
from ledger_sync.schemas.upload import MAX_LABEL_LENGTH, MAX_NOTE_LENGTH, MAX_UPLOAD_ROWS
from ledger_sync.utils.logging import logger

TRANSFER_IN = "transfer in"
TRANSFER_IN_HYPHEN = "transfer-in"
TRANSFER_OUT_HYPHEN = "transfer-out"


class NormalizationError(Exception):
    """Raised when normalization fails."""


class NormalizeRowsMixin:
    """Adds row-level normalization to DataNormalizer."""

    # Methods provided by the host class:
    def _clean_text(self, text: str) -> str:
        raise NotImplementedError

    def _clean_note(self, note: str) -> str:
        raise NotImplementedError

    def _standardize_account(self, account: str) -> str:
        raise NotImplementedError

    def _standardize_category(self, category: str) -> str:
        raise NotImplementedError

    def normalize_date(self, value: Any) -> datetime:
        raise NotImplementedError

    def normalize_amount(self, value: Any) -> Decimal:
        raise NotImplementedError

    def normalize_string(self, value: Any) -> str:
        raise NotImplementedError

    def normalize_string_preserve_case(self, value: Any) -> str:
        raise NotImplementedError

    def normalize_transaction_type(self, value: Any) -> TransactionType:
        raise NotImplementedError

    def validate_normalized_row(self, row: dict[str, Any]) -> None:
        """Check storage and accounting boundaries before any ledger writes."""
        if row["currency"] != "INR":
            msg = "Only INR source amounts are supported. Export or convert the source to INR."
            raise NormalizationError(msg)
        for field in ("account", "category", "subcategory", "from_account", "to_account"):
            value = row.get(field)
            if field in ("account", "category") and not value:
                msg = f"{field.capitalize()} is missing"
                raise NormalizationError(msg)
            if value and len(value) > MAX_LABEL_LENGTH:
                msg = f"{field.capitalize()} must be at most {MAX_LABEL_LENGTH} characters"
                raise NormalizationError(msg)
        if row.get("note") and len(row["note"]) > MAX_NOTE_LENGTH:
            msg = f"Note must be at most {MAX_NOTE_LENGTH} characters"
            raise NormalizationError(msg)

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
        if TRANSFER_IN_HYPHEN in raw_type or TRANSFER_IN in raw_type:
            # Money coming IN: category is source (from), account is destination (to)
            from_account = self._standardize_account(category)
            to_account = self._standardize_account(account)
            leg = "in"
        else:
            # Money going OUT (default): account is source (from), category is destination (to)
            from_account = self._standardize_account(account)
            to_account = self._standardize_account(category)
            leg = "out"

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
            # Preserve which LEG of the transfer pair this row represents
            # (Transfer-In vs Transfer-Out in the source) so the reconciler
            # can distinguish "paired leg of same transfer" from "genuine
            # second transfer of the same amount on the same day".
            "transfer_leg": leg,
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
            is_transfer = any(
                x in raw_type for x in ["transfer", TRANSFER_IN_HYPHEN, TRANSFER_OUT_HYPHEN]
            )

            # Standardize account and category names
            account = self._standardize_account(
                self.normalize_string_preserve_case(row[column_mapping["account"]])
            )
            category = self._standardize_category(
                self.normalize_string_preserve_case(row[column_mapping["category"]])
            )
            if not account or not category:
                msg = "Account and category are required"
                raise NormalizationError(msg)

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
            self.validate_normalized_row(normalized)
            return normalized

    def normalize_from_dict(self, row: dict[str, Any]) -> dict[str, Any]:
        """Normalize a pre-parsed transaction dict from the JSON upload endpoint.

        The frontend has already handled column mapping, date parsing (ISO 8601),
        and amount conversion. This method applies category corrections, account
        standardization, transfer from/to resolution, and note cleaning.

        Args:
            row: Dict with keys: date, amount, currency, type, account, category,
                 subcategory (optional), note (optional).

        Returns:
            Normalized dict matching the format produced by normalize_row.

        Raises:
            NormalizationError: If normalization fails.

        """
        try:
            date = self.normalize_date(row["date"])
            amount = self.normalize_amount(row["amount"])
            currency = self._clean_text(str(row.get("currency", "INR"))).upper() or "INR"
            account = self._standardize_account(self.normalize_string_preserve_case(row["account"]))
            category = self._standardize_category(
                self.normalize_string_preserve_case(row["category"])
            )
            if not account or not category:
                msg = "Account and category are required"
                raise NormalizationError(msg)
            tx_type = self.normalize_transaction_type(row["type"])
            subcategory = (
                self._clean_text(str(row["subcategory"])) if row.get("subcategory") else None
            )
            note = self._clean_note(str(row["note"])) if row.get("note") else None

            raw_type = str(row["type"]).strip().lower()
            is_transfer = "transfer" in raw_type

            if is_transfer:
                if TRANSFER_IN_HYPHEN in raw_type or TRANSFER_IN in raw_type:
                    from_account = self._standardize_account(category)
                    to_account = self._standardize_account(account)
                    leg = "in"
                else:
                    from_account = self._standardize_account(account)
                    to_account = self._standardize_account(category)
                    leg = "out"

                normalized = {
                    "date": date,
                    "amount": amount,
                    "currency": currency,
                    "type": tx_type,
                    "account": from_account,
                    "from_account": from_account,
                    "to_account": to_account,
                    "category": f"Transfer: {from_account} → {to_account}",
                    "subcategory": subcategory,
                    "note": note,
                    "is_transfer": True,
                    "transfer_leg": leg,
                }
                self.validate_normalized_row(normalized)
                return normalized

            normalized = {
                "date": date,
                "amount": amount,
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
            self.validate_normalized_row(normalized)
            return normalized

        except NormalizationError:
            raise
        except (ValueError, TypeError, KeyError) as e:
            msg = f"Unexpected error normalizing row: {e}"
            raise NormalizationError(msg) from e

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
        if df.empty or len(df) > MAX_UPLOAD_ROWS:
            msg = f"Snapshot must contain between 1 and {MAX_UPLOAD_ROWS:,} rows"
            raise NormalizationError(msg)
        normalized_rows = []

        for row_number, (_, row) in enumerate(df.iterrows(), start=2):
            try:
                normalized = self.normalize_row(row, column_mapping)
                normalized_rows.append(normalized)
            except NormalizationError as e:
                msg = f"Row {row_number}: {e}. Snapshot rejected; no ledger entries were changed."
                raise NormalizationError(msg) from e

        logger.info(f"Successfully normalized {len(normalized_rows)} rows")
        return normalized_rows
