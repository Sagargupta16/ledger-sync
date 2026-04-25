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


class TrendsMixin(AnalyticsEngineBase):
    """Mixin: category trends and transfer flows persistence."""

    def _calculate_category_trends(
        self,
        all_transactions: list[Transaction] | None = None,
    ) -> int:
        """Calculate category-level trends over time."""
        transactions = [
            t
            for t in (all_transactions or self._user_transaction_query().all())
            if t.type != TransactionType.TRANSFER
        ]

        # Group by period + category + type
        category_data: dict[tuple[str, str, str], dict[str, Any]] = defaultdict(
            lambda: {
                "amounts": [],
                "subcategory": None,
            },
        )

        for txn in transactions:
            period_key = txn.date.strftime("%Y-%m")
            key = (period_key, txn.category, txn.type.value)
            category_data[key]["amounts"].append(float(txn.amount))
            category_data[key]["subcategory"] = txn.subcategory

        monthly_totals = _monthly_type_totals(transactions)

        # Delete existing for this user and insert new
        del_stmt = delete(CategoryTrend)
        if self.user_id is not None:
            del_stmt = del_stmt.where(CategoryTrend.user_id == self.user_id)
        self.db.execute(del_stmt)

        count = 0
        prev_amounts: dict[tuple[str, str], float] = {}

        for (period_key, category, txn_type), data in sorted(category_data.items()):
            amounts = data["amounts"]
            total = sum(amounts)
            monthly_type_total = float(monthly_totals[period_key].get(txn_type, Decimal(0)))
            pct = (total / monthly_type_total * 100) if monthly_type_total > 0 else 0

            # MoM change
            prev_key = (category, txn_type)
            mom_change = 0.0
            mom_change_pct = 0.0
            if prev_key in prev_amounts and prev_amounts[prev_key] > 0:
                mom_change = total - prev_amounts[prev_key]
                mom_change_pct = (mom_change / prev_amounts[prev_key]) * 100

            trend = CategoryTrend(
                user_id=self.user_id,
                period_key=period_key,
                category=category,
                subcategory=data["subcategory"],
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
