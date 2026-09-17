"""Transaction ID generation using deterministic hashing."""

import hashlib
import json
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
        user_id: int | None = None,
        occurrence: int = 0,
        *,
        to_account: str | None = None,
        currency: str = "INR",
        version: int = 2,
    ) -> str:
        """Generate a deterministic source fingerprint and initial public ID.

        Capture source fields before mutable categorization rules. A persisted
        public ID is never regenerated when those classifications change.
        Version 2 preserves field boundaries with a canonical JSON array;
        version 1 is read compatibility for verified adoption of legacy IDs.

        An occurrence counter disambiguates rows that are otherwise identical
        (same date, amount, account, note, category, subcategory, type).

        Args:
            date: Transaction date
            amount: Transaction amount
            account: Account name
            note: Transaction note (optional)
            category: Transaction category (optional)
            subcategory: Transaction subcategory (optional)
            tx_type: Transaction type (optional)
            user_id: User ID for multi-user mode (optional)
            occurrence: Zero-based index for duplicate rows (default 0)
            to_account: Explicit transfer destination (version 2)
            currency: Source currency (version 2)
            version: Encoding version; new writes use 2

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
        norm_user = str(user_id) if user_id is not None else ""

        if version == 1:
            # Read compatibility only: existing IDs must remain resolvable.
            hash_input = (
                f"{norm_user}|{norm_date}|{norm_amount}|{norm_account}|{norm_note}|"
                f"{norm_category}|{norm_subcategory}|{norm_type}"
            )
            if occurrence > 0:
                hash_input += f"|{occurrence}"
        elif version == 2:
            # Arrays preserve boundaries even when imported labels contain "|".
            # Destination and currency are explicit rather than encoded in labels.
            hash_input = json.dumps(
                [
                    "ledger-sync:transaction:v2",
                    norm_user,
                    norm_date,
                    norm_amount,
                    norm_account,
                    norm_note,
                    norm_category,
                    norm_subcategory,
                    norm_type,
                    self.normalize_for_hash(to_account),
                    self.normalize_for_hash(currency),
                    occurrence,
                ],
                ensure_ascii=False,
                separators=(",", ":"),
            )
        else:
            raise ValueError(f"Unsupported transaction fingerprint version: {version}")

        # Generate SHA-256 hash
        hash_bytes = hashlib.sha256(hash_input.encode("utf-8")).digest()
        return hash_bytes.hex()
