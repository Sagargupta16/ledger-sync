"""Transaction ID generation using deterministic hashing."""

import hashlib
from datetime import datetime
from decimal import Decimal
from typing import Any


class TransactionHasher:
    """Generates deterministic transaction IDs via hashing."""

    @staticmethod
    def normalize_for_hash(value: Any) -> str:
        """Normalize value for consistent hashing.

        Args:
            value: Value to normalize

        Returns:
            Normalized string representation
        """
        if value is None:
            return ""

        if isinstance(value, datetime):
            # ISO-8601 format for dates
            return value.isoformat()

        if isinstance(value, Decimal):
            # Consistent decimal formatting
            return f"{value:.2f}"

        if isinstance(value, (int, float)):
            return f"{float(value):.2f}"

        # String: lowercase and strip whitespace
        return str(value).strip().lower()

    def generate_transaction_id(
        self,
        date: datetime,
        amount: Decimal,
        account: str,
        note: str | None,
        category: str | None = None,
        subcategory: str | None = None,
        tx_type: str | None = None,
    ) -> str:
        """Generate deterministic transaction ID.

        Uses SHA-256 hash of normalized core fields including category and type
        to ensure uniqueness for transactions that occur at the same time
        with the same amount.

        Args:
            date: Transaction date
            amount: Transaction amount
            account: Account name
            note: Transaction note (optional)
            category: Transaction category (optional)
            subcategory: Transaction subcategory (optional)
            tx_type: Transaction type (optional)

        Returns:
            64-character hex-encoded transaction ID
        """
        # Normalize each component
        norm_date = self.normalize_for_hash(date)
        norm_amount = self.normalize_for_hash(amount)
        norm_account = self.normalize_for_hash(account)
        norm_note = self.normalize_for_hash(note)
        norm_category = self.normalize_for_hash(category)
        norm_subcategory = self.normalize_for_hash(subcategory)
        norm_type = self.normalize_for_hash(tx_type)

        # Concatenate with delimiter - include more fields for better uniqueness
        hash_input = (
            f"{norm_date}|{norm_amount}|{norm_account}|{norm_note}|"
            f"{norm_category}|{norm_subcategory}|{norm_type}"
        )

        # Generate SHA-256 hash
        hash_bytes = hashlib.sha256(hash_input.encode("utf-8")).digest()
        transaction_id = hash_bytes.hex()

        return transaction_id
