"""Tests for transaction ID hashing."""

from datetime import UTC, datetime
from decimal import Decimal

from ledger_sync.ingest.hash_id import TransactionHasher

# SHA-256 produces 64 character hex string
SHA256_HEX_LENGTH = 64


class TestTransactionHasher:
    """Test transaction hash ID generation."""

    def test_same_inputs_produce_same_hash(self):
        """Test that identical inputs produce identical hashes."""
        hasher = TransactionHasher()

        date = datetime(2024, 1, 15, 10, 30, 0, tzinfo=UTC)
        amount = Decimal("100.50")
        account = "Cash"
        note = "Test transaction"

        hash1 = hasher.generate_transaction_id(date, amount, account, note)
        hash2 = hasher.generate_transaction_id(date, amount, account, note)

        assert hash1 == hash2

    def test_different_inputs_produce_different_hashes(self):
        """Test that different inputs produce different hashes."""
        hasher = TransactionHasher()

        base_date = datetime(2024, 1, 15, 10, 30, 0, tzinfo=UTC)
        base_amount = Decimal("100.50")

        hash1 = hasher.generate_transaction_id(base_date, base_amount, "Cash", "Note1")
        hash2 = hasher.generate_transaction_id(base_date, base_amount, "Cash", "Note2")

        assert hash1 != hash2

    def test_hash_length(self):
        """Test that hash is correct length (64 chars for SHA-256)."""
        hasher = TransactionHasher()

        transaction_id = hasher.generate_transaction_id(
            datetime(2024, 1, 15, tzinfo=UTC),
            Decimal("100.00"),
            "Cash",
            "Test",
        )

        assert len(transaction_id) == SHA256_HEX_LENGTH

    def test_case_insensitive_strings(self):
        """Test that string normalization is case-insensitive."""
        hasher = TransactionHasher()

        date = datetime(2024, 1, 15, tzinfo=UTC)
        amount = Decimal("100.00")

        hash1 = hasher.generate_transaction_id(date, amount, "Cash", "Test Note")
        hash2 = hasher.generate_transaction_id(date, amount, "CASH", "TEST NOTE")

        assert hash1 == hash2

    def test_whitespace_normalization(self):
        """Test that whitespace is normalized."""
        hasher = TransactionHasher()

        date = datetime(2024, 1, 15, tzinfo=UTC)
        amount = Decimal("100.00")

        hash1 = hasher.generate_transaction_id(date, amount, "Cash", "Test")
        hash2 = hasher.generate_transaction_id(date, amount, "  Cash  ", "  Test  ")

        assert hash1 == hash2

    def test_none_note_handling(self):
        """Test that None notes are handled correctly."""
        hasher = TransactionHasher()

        date = datetime(2024, 1, 15, tzinfo=UTC)
        amount = Decimal("100.00")

        hash1 = hasher.generate_transaction_id(date, amount, "Cash", None)
        hash2 = hasher.generate_transaction_id(date, amount, "Cash", None)

        assert hash1 == hash2
        assert len(hash1) == SHA256_HEX_LENGTH
