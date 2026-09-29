"""Category trends + transfer flows mixin."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import delete

from ledger_sync.core._analytics_helpers import monthly_type_totals as _monthly_type_totals
from ledger_sync.core.analytics.base import AnalyticsEngineBase
from ledger_sync.db.models import (
    CategoryTrend,
    Transaction,
    TransactionType,
    TransferFlow,
)
from ledger_sync.services.account_settings import get_account_type_lookup


def _cat_trend_sort_key(
    item: tuple[tuple[str, str, str | None, str], list[Decimal]],
) -> tuple[str, str, str, str]:
    """Sort key for category-trend iteration.

    Tolerates ``subcategory=None`` by substituting an empty string so the
    natural tuple ordering stays total-ordered.
    """
    period, cat, sub, tp = item[0]
    return (period, cat, sub or "", tp)


def _build_category_trend(
    *,
    user_id: int | None,
    period_key: str,
    category: str,
    subcategory: str | None,
    txn_type: str,
    amounts: list[Decimal],
    total: Decimal,
    monthly_type_total: Decimal,
    prev_total: Decimal | None,
) -> CategoryTrend:
    """Build a single CategoryTrend row from aggregated per-month data."""
    pct = float(total / monthly_type_total * 100) if monthly_type_total > 0 else 0.0
    mom_change = Decimal(0)
    mom_change_pct = 0.0
    if prev_total is not None and prev_total > 0:
        mom_change = total - prev_total
        mom_change_pct = float(mom_change / prev_total * 100)

    return CategoryTrend(
        user_id=user_id,
        period_key=period_key,
        category=category,
        subcategory=subcategory,
        transaction_type=TransactionType(txn_type),
        total_amount=total,
        transaction_count=len(amounts),
        avg_transaction=total / len(amounts) if amounts else Decimal(0),
        max_transaction=max(amounts) if amounts else Decimal(0),
        min_transaction=min(amounts) if amounts else Decimal(0),
        pct_of_monthly_total=pct,
        mom_change=mom_change,
        mom_change_pct=mom_change_pct,
        last_calculated=datetime.now(UTC),
    )


class TrendsMixin(AnalyticsEngineBase):
    """Mixin: category trends and transfer flows persistence."""

    def _calculate_category_trends(
        self,
        all_transactions: list[Transaction] | None = None,
        affected_months: set[str] | None = None,
    ) -> int:
        """Calculate category + subcategory trends over time.

        Grouping key is ``(period, category, subcategory, type)``: previously
        we grouped by ``(period, category, type)`` and overwrote ``subcategory``
        with the last-seen value, which scrambled subcategory totals across
        months (e.g. Cashbacks under the wrong subcategory heading).

        ``affected_months=None`` rebuilds every row. Otherwise only rows in the
        affected months are replaced, and later rows whose MoM predecessor may
        have moved get their MoM fields repaired. Every value is taken from the
        same in-memory full computation, so the result equals a full rebuild.
        """
        if affected_months == set():
            return 0
        desired = self._desired_category_trends(all_transactions)
        if affected_months is None or not self._apply_selective_category_trends(
            desired, affected_months
        ):
            # Delete existing for this user and insert new
            del_stmt = delete(CategoryTrend)
            if self.user_id is not None:
                del_stmt = del_stmt.where(CategoryTrend.user_id == self.user_id)
            self.db.execute(del_stmt)
            self.db.add_all(desired.values())
            return len(desired)
        return sum(1 for key in desired if key[0] in affected_months)

    def _apply_selective_category_trends(
        self,
        desired: dict[tuple[str, str, str | None, str], CategoryTrend],
        affected_months: set[str],
    ) -> bool:
        """Rewrite affected months and repair later MoM values in place.

        Rows before the earliest affected month depend only on earlier, unchanged
        months, so they are left alone. Returns False (caller rebuilds in full)
        when an unaffected stored month does not match the computation, which
        means the stored rows predate a change the dirty set did not record.
        """
        first_affected = min(affected_months)
        stored = (
            self.db.query(CategoryTrend)
            .filter(
                CategoryTrend.user_id == self._require_user_id(),
                CategoryTrend.period_key >= first_affected,
            )
            .all()
        )
        stored_by_key = {
            (row.period_key, row.category, row.subcategory, row.transaction_type.value): row
            for row in stored
        }
        expected_unaffected = {
            key for key in desired if key[0] >= first_affected and key[0] not in affected_months
        }
        stored_unaffected = {key for key in stored_by_key if key[0] not in affected_months}
        if expected_unaffected != stored_unaffected or len(stored_by_key) != len(stored):
            return False

        for key, row in stored_by_key.items():
            if key[0] in affected_months:
                self.db.delete(row)
                continue
            # Totals, counts and shares depend on this month alone; only the MoM
            # fields read the preceding populated month.
            fresh = desired[key]
            if row.mom_change != fresh.mom_change or row.mom_change_pct != fresh.mom_change_pct:
                row.mom_change = fresh.mom_change
                row.mom_change_pct = fresh.mom_change_pct
                row.last_calculated = fresh.last_calculated
        # Deletes must reach the database before replacement rows share a key.
        self.db.flush()
        self.db.add_all(trend for key, trend in desired.items() if key[0] in affected_months)
        return True

    def _desired_category_trends(
        self,
        all_transactions: list[Transaction] | None,
    ) -> dict[tuple[str, str, str | None, str], CategoryTrend]:
        """Compute every CategoryTrend row (unsaved) from the full ledger."""
        # Transfers are excluded because they are the same rupee twice; a
        # classified realised loss is excluded because it is a negative
        # investment return rather than spending. Without the second filter the
        # loss stayed the user's top "expense category" on /category-breakdown
        # and its percent_of_total was computed against a monthly expense total
        # that included it, so the whole ranking disagreed with the
        # monthly_summaries figure for the same month.
        transactions = [
            t
            for t in (all_transactions or self._user_transaction_query().all())
            if t.type != TransactionType.TRANSFER
            and not (
                t.type == TransactionType.EXPENSE and self._is_capital_loss(t)  # type: ignore[attr-defined]
            )
        ]

        category_data: dict[tuple[str, str, str | None, str], list[Decimal]] = defaultdict(
            list,
        )
        for txn in transactions:
            period_key = txn.date.strftime("%Y-%m")
            key = (period_key, txn.category, txn.subcategory, txn.type.value)
            category_data[key].append(txn.amount)

        monthly_totals = _monthly_type_totals(transactions)

        desired: dict[tuple[str, str, str | None, str], CategoryTrend] = {}
        # MoM change is computed at the (category, subcategory, type) granularity
        # so a "Food & Dining / Groceries" row compares to the prior month's
        # "Food & Dining / Groceries" row, not "Food & Dining / Restaurants".
        prev_amounts: dict[tuple[str, str | None, str], Decimal] = {}

        for key, amounts in sorted(category_data.items(), key=_cat_trend_sort_key):
            period_key, category, subcategory, txn_type = key
            total = sum(amounts, Decimal(0))
            monthly_type_total = monthly_totals[period_key].get(txn_type, Decimal(0))
            prev_key = (category, subcategory, txn_type)
            desired[key] = _build_category_trend(
                user_id=self.user_id,
                period_key=period_key,
                category=category,
                subcategory=subcategory,
                txn_type=txn_type,
                amounts=amounts,
                total=total,
                monthly_type_total=monthly_type_total,
                prev_total=prev_amounts.get(prev_key),
            )
            prev_amounts[prev_key] = total

        return desired

    def _calculate_transfer_flows(
        self,
        transfers: list[Transaction] | None = None,
    ) -> int:
        """Calculate aggregated transfer flows between accounts."""
        if transfers is None:
            transfers = (
                self._user_transaction_query()
                .filter(Transaction.type == TransactionType.TRANSFER)
                .all()
            )

        # Get account classifications for coloring
        classifications = get_account_type_lookup(self.db, self._require_user_id())

        # Aggregate flows
        flows: dict[tuple[str, str], dict[str, Any]] = defaultdict(
            lambda: {
                "total_amount": Decimal(0),
                "count": 0,
                "last_date": None,
                "last_amount": None,
            },
        )

        for txn in transfers:
            if txn.from_account and txn.to_account:
                key = (txn.from_account, txn.to_account)
                flows[key]["total_amount"] += txn.amount
                flows[key]["count"] += 1
                if flows[key]["last_date"] is None or txn.date > flows[key]["last_date"]:
                    flows[key]["last_date"] = txn.date
                    flows[key]["last_amount"] = txn.amount

        # Delete existing for this user and insert new
        del_stmt = delete(TransferFlow)
        if self.user_id is not None:
            del_stmt = del_stmt.where(TransferFlow.user_id == self.user_id)
        self.db.execute(del_stmt)

        count = 0
        for (from_acc, to_acc), data in flows.items():
            flow = TransferFlow(
                user_id=self.user_id,
                from_account=from_acc,
                to_account=to_acc,
                total_amount=data["total_amount"],
                transaction_count=data["count"],
                avg_transfer=(
                    data["total_amount"] / data["count"] if data["count"] > 0 else Decimal(0)
                ),
                last_transfer_date=data["last_date"],
                last_transfer_amount=data["last_amount"],
                from_account_type=classifications.get(from_acc.lower()),
                to_account_type=classifications.get(to_acc.lower()),
                last_calculated=datetime.now(UTC),
            )
            self.db.add(flow)
            count += 1

        return count
