"""Integration tests for transfer reconciliation with pair-based dedup.

Each real transfer in the source export appears twice - once as Transfer-In
and once as Transfer-Out. The reconciler must treat those two legs as one
transfer (dedup collapses them), but must NOT collapse two genuinely
distinct transfers of the same amount between the same accounts on the same
date into one record.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from ledger_sync.core.reconciler import Reconciler
from ledger_sync.db.models import Transaction, TransactionType


def _transfer_row(
    *,
    leg: str,
    from_acct: str,
    to_acct: str,
    amount: Decimal,
    date: datetime,
) -> dict:
    """Build a normalized transfer-row dict matching the normalizer's output shape."""
    return {
        "date": date,
        "amount": amount,
        "currency": "INR",
        "type": TransactionType.TRANSFER,
        "account": from_acct,
        "from_account": from_acct,
        "to_account": to_acct,
        "category": f"Transfer: {from_acct} -> {to_acct}",
        "subcategory": None,
        "note": None,
        "is_transfer": True,
        "transfer_leg": leg,
    }


class TestTransferReconciliation:
    """Transfer dedup semantics."""

    def test_paired_legs_collapse_to_single_transfer(self, test_db_session, test_user):
        """The In and Out rows of a single real transfer must dedupe to 1 row."""
        reconciler = Reconciler(test_db_session, user_id=test_user.id)
        d = datetime(2024, 11, 23, tzinfo=UTC)
        rows = [
            _transfer_row(
                leg="in", from_acct="Friends", to_acct="Cashback", amount=Decimal("39.00"), date=d
            ),
            _transfer_row(
                leg="out", from_acct="Friends", to_acct="Cashback", amount=Decimal("39.00"), date=d
            ),
        ]

        stats = reconciler.reconcile_transfers_batch(rows, "test.xlsx", datetime.now(UTC))

        assert stats.processed == 2
        assert stats.inserted == 1
        assert stats.skipped == 1

        db_rows = (
            test_db_session.query(Transaction)
            .filter(
                Transaction.user_id == test_user.id,
                Transaction.type == TransactionType.TRANSFER,
            )
            .all()
        )
        assert len(db_rows) == 1
        assert db_rows[0].from_account == "Friends"
        assert db_rows[0].to_account == "Cashback"
        assert db_rows[0].amount == Decimal("39.00")

    def test_two_identical_transfers_same_day_both_kept(self, test_db_session, test_user):
        """Two genuine same-day, same-amount, same-account transfers must both persist.

        Regression: previously the reconciler dedupe'd by leg-less hash, so a
        user who recorded two separate 39-rupee cashback forwards from
        'Friends' to 'Cashback Shared' on 2024-11-23 lost one of them.
        """
        reconciler = Reconciler(test_db_session, user_id=test_user.id)
        d = datetime(2024, 11, 23, tzinfo=UTC)
        # Transfer #1 (both legs)
        # Transfer #2 (both legs) -- identical to #1 except it's a DIFFERENT real movement
        rows = [
            _transfer_row(
                leg="in", from_acct="Friends", to_acct="Cashback", amount=Decimal("39.00"), date=d
            ),
            _transfer_row(
                leg="out", from_acct="Friends", to_acct="Cashback", amount=Decimal("39.00"), date=d
            ),
            _transfer_row(
                leg="in", from_acct="Friends", to_acct="Cashback", amount=Decimal("39.00"), date=d
            ),
            _transfer_row(
                leg="out", from_acct="Friends", to_acct="Cashback", amount=Decimal("39.00"), date=d
            ),
        ]

        stats = reconciler.reconcile_transfers_batch(rows, "test.xlsx", datetime.now(UTC))

        assert stats.processed == 4
        assert stats.inserted == 2  # two real transfers
        assert stats.skipped == 2  # two paired-leg duplicates

        db_rows = (
            test_db_session.query(Transaction)
            .filter(
                Transaction.user_id == test_user.id,
                Transaction.type == TransactionType.TRANSFER,
            )
            .all()
        )
        assert len(db_rows) == 2
        # Both should have the same logical shape, but different transaction_ids
        assert db_rows[0].transaction_id != db_rows[1].transaction_id
        for r in db_rows:
            assert r.amount == Decimal("39.00")
            assert r.from_account == "Friends"
            assert r.to_account == "Cashback"

    def test_interleaved_pair_legs_still_dedupe_correctly(self, test_db_session, test_user):
        """Out-then-In leg order is valid (Money Manager can emit either order first)."""
        reconciler = Reconciler(test_db_session, user_id=test_user.id)
        d = datetime(2024, 11, 23, tzinfo=UTC)
        rows = [
            _transfer_row(
                leg="out", from_acct="Friends", to_acct="Cashback", amount=Decimal("50.00"), date=d
            ),
            _transfer_row(
                leg="in", from_acct="Friends", to_acct="Cashback", amount=Decimal("50.00"), date=d
            ),
        ]

        stats = reconciler.reconcile_transfers_batch(rows, "test.xlsx", datetime.now(UTC))

        assert stats.inserted == 1
        assert stats.skipped == 1

    def test_three_distinct_same_day_same_amount_transfers(self, test_db_session, test_user):
        """Three genuine transfers of the same amount on the same day all persist."""
        reconciler = Reconciler(test_db_session, user_id=test_user.id)
        d = datetime(2025, 1, 1, tzinfo=UTC)
        rows = [
            _transfer_row(leg="in", from_acct="A", to_acct="B", amount=Decimal("100.00"), date=d),
            _transfer_row(leg="out", from_acct="A", to_acct="B", amount=Decimal("100.00"), date=d),
            _transfer_row(leg="in", from_acct="A", to_acct="B", amount=Decimal("100.00"), date=d),
            _transfer_row(leg="out", from_acct="A", to_acct="B", amount=Decimal("100.00"), date=d),
            _transfer_row(leg="in", from_acct="A", to_acct="B", amount=Decimal("100.00"), date=d),
            _transfer_row(leg="out", from_acct="A", to_acct="B", amount=Decimal("100.00"), date=d),
        ]

        stats = reconciler.reconcile_transfers_batch(rows, "test.xlsx", datetime.now(UTC))

        assert stats.inserted == 3
        assert stats.skipped == 3

    def test_single_unpaired_transfer_still_inserts(self, test_db_session, test_user):
        """A transfer missing its sibling leg (data-quality edge case) still gets persisted."""
        reconciler = Reconciler(test_db_session, user_id=test_user.id)
        d = datetime(2025, 1, 1, tzinfo=UTC)
        rows = [
            _transfer_row(leg="in", from_acct="A", to_acct="B", amount=Decimal("77.00"), date=d),
        ]
        stats = reconciler.reconcile_transfers_batch(rows, "test.xlsx", datetime.now(UTC))
        assert stats.inserted == 1
        assert stats.skipped == 0
