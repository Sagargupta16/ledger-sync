"""Category trends + transfer flows mixin."""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal
from statistics import mean
from typing import Any

from sqlalchemy import delete

from ledger_sync.core._analytics_helpers import monthly_type_totals as _monthly_type_totals
from ledger_sync.core.analytics.base import AnalyticsEngineBase
from ledger_sync.db.models import (
    AccountClassification,
    CategoryTrend,
    Transaction,
    TransactionType,
    TransferFlow,
)


def _cat_trend_sort_key(
    item: tuple[tuple[str, str, str | None, str], list[float]],
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
    amounts: list[float],
    total: float,
    monthly_type_total: float,
    prev_total: float | None,
) -> CategoryTrend:
    """Build a single CategoryTrend row from aggregated per-month data."""
    pct = (total / monthly_type_total * 100) if monthly_type_total > 0 else 0
    mom_change = 0.0
    mom_change_pct = 0.0
    if prev_total is not None and prev_total > 0:
        mom_change = total - prev_total
        mom_change_pct = (mom_change / prev_total) * 100

    return CategoryTrend(
        user_id=user_id,
        period_key=period_key,
        category=category,
        subcategory=subcategory,
        transaction_type=TransactionType(txn_type),
        total_amount=Decimal(str(total)),
        transaction_count=len(amounts),
        avg_transaction=Decimal(str(mean(amounts))) if amounts else Decimal(0),
        max_transaction=Decimal(str(max(amounts))) if amounts else Decimal(0),
        min_transaction=Decimal(str(min(amounts))) if amounts else Decimal(0),
        pct_of_monthly_total=pct,
        mom_change=Decimal(str(mom_change)),
        mom_change_pct=mom_change_pct,
        last_calculated=datetime.now(UTC),
    )


class TrendsMixin(AnalyticsEngineBase):
    """Mixin: category trends and transfer flows persistence."""

    def _calculate_category_trends(
        self,
        all_transactions: list[Transaction] | None = None,
    ) -> int:
        """Calculate category + subcategory trends over time.

        Grouping key is ``(period, category, subcategory, type)``: previously
        we grouped by ``(period, category, type)`` and overwrote ``subcategory``
        with the last-seen value, which scrambled subcategory totals across
        months (e.g. Cashbacks under the wrong subcategory heading).
        """
        transactions = [
            t
            for t in (all_transactions or self._user_transaction_query().all())
            if t.type != TransactionType.TRANSFER
        ]

        category_data: dict[tuple[str, str, str | None, str], list[float]] = defaultdict(
            list,
        )
        for txn in transactions:
            period_key = txn.date.strftime("%Y-%m")
            key = (period_key, txn.category, txn.subcategory, txn.type.value)
            category_data[key].append(float(txn.amount))

        monthly_totals = _monthly_type_totals(transactions)

        # Delete existing for this user and insert new
        del_stmt = delete(CategoryTrend)
        if self.user_id is not None:
            del_stmt = del_stmt.where(CategoryTrend.user_id == self.user_id)
        self.db.execute(del_stmt)

        count = 0
        # MoM change is computed at the (category, subcategory, type) granularity
        # so a "Food & Dining / Groceries" row compares to the prior month's
        # "Food & Dining / Groceries" row, not "Food & Dining / Restaurants".
        prev_amounts: dict[tuple[str, str | None, str], float] = {}

        for key, amounts in sorted(category_data.items(), key=_cat_trend_sort_key):
            period_key, category, subcategory, txn_type = key
            total = sum(amounts)
            monthly_type_total = float(monthly_totals[period_key].get(txn_type, Decimal(0)))
            prev_key = (category, subcategory, txn_type)
            trend = _build_category_trend(
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
            self.db.add(trend)
            count += 1
            prev_amounts[prev_key] = total

        return count

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
        ac_query = self.db.query(AccountClassification)
        if self.user_id is not None:
            ac_query = ac_query.filter(AccountClassification.user_id == self.user_id)
        classifications = {ac.account_name: ac.account_type.value for ac in ac_query.all()}

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
                flows[key]["total_amount"] += Decimal(str(txn.amount))
                flows[key]["count"] += 1
                if flows[key]["last_date"] is None or txn.date > flows[key]["last_date"]:
                    flows[key]["last_date"] = txn.date
                    flows[key]["last_amount"] = Decimal(str(txn.amount))

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
                from_account_type=classifications.get(from_acc),
                to_account_type=classifications.get(to_acc),
                last_calculated=datetime.now(UTC),
            )
            self.db.add(flow)
            count += 1

        return count
