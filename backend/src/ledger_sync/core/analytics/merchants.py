"""Merchant intelligence extraction mixin."""

from __future__ import annotations

import json
from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal
from statistics import mean, median
from typing import Any

from sqlalchemy import delete

from ledger_sync.core.analytics.base import AnalyticsEngineBase
from ledger_sync.core.analytics.merchant_extract import extract_merchant
from ledger_sync.db.models import MerchantIntelligence, Transaction, TransactionType

#: Cap on stored alias variations per merchant, so a descriptor merchant with
#: hundreds of note spellings does not bloat the JSON column.
_MAX_ALIASES = 25


class MerchantsMixin(AnalyticsEngineBase):
    """Mixin: extract and persist merchant intelligence rows."""

    def _extract_merchant_intelligence(
        self,
        expenses: list[Transaction] | None = None,
    ) -> int:
        """Extract and aggregate merchant/vendor data from transaction notes."""
        if expenses is None:
            expenses = (
                self._user_transaction_query()
                .filter(Transaction.type == TransactionType.EXPENSE)
                .filter(Transaction.note.isnot(None))
                .all()
            )

        # Keyed on (label, kind) so a descriptor that happens to spell a brand
        # name -- an "Apple" fruit row versus real Apple Inc. purchases -- does
        # not merge two unrelated buckets.
        merchants: dict[tuple[str, str], dict[str, Any]] = defaultdict(
            lambda: {
                "amounts": [],
                "dates": [],
                "categories": defaultdict(int),
                "subcategories": defaultdict(int),
                "aliases": defaultdict(int),
            },
        )

        for txn in expenses or []:
            extracted = extract_merchant(txn.note, txn.category)
            if not extracted:
                continue
            entry = merchants[extracted]
            entry["amounts"].append(float(txn.amount))
            entry["dates"].append(txn.date)
            entry["categories"][txn.category] += 1
            entry["aliases"][" ".join((txn.note or "").split())] += 1
            if txn.subcategory:
                entry["subcategories"][txn.subcategory] += 1

        # Delete existing for this user and insert new
        del_stmt = delete(MerchantIntelligence)
        if self.user_id is not None:
            del_stmt = del_stmt.where(MerchantIntelligence.user_id == self.user_id)
        self.db.execute(del_stmt)

        count = 0
        for (merchant_name, label_kind), data in merchants.items():
            if len(data["amounts"]) < 2:  # Skip one-off merchants
                continue
            merchant = self._build_merchant_record(merchant_name, label_kind, data)
            self.db.add(merchant)
            count += 1

        return count

    def _build_merchant_record(
        self,
        merchant_name: str,
        label_kind: str,
        data: dict[str, Any],
    ) -> MerchantIntelligence:
        """Build a MerchantIntelligence ORM instance from aggregated data."""
        amounts = data["amounts"]
        dates = sorted(data["dates"])

        primary_cat = (
            max(data["categories"].items(), key=lambda x: x[1])[0]
            if data["categories"]
            else "Unknown"
        )
        primary_subcat = None
        if data["subcategories"]:
            primary_subcat = max(data["subcategories"].items(), key=lambda x: x[1])[0]

        # Calculate months active
        if len(dates) >= 2:
            months_active = (
                (dates[-1].year - dates[0].year) * 12 + (dates[-1].month - dates[0].month) + 1
            )
        else:
            months_active = 1

        # Gap statistics use the MEDIAN, not the mean: the mean of consecutive
        # gaps telescopes to span/(n-1), so a single long dormant stretch used
        # to push a genuinely monthly merchant out of the recurring band.
        avg_days = 0.0
        median_days = 0.0
        if len(dates) >= 2:
            day_diffs = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
            if day_diffs:
                avg_days = mean(day_diffs)
                median_days = median(day_diffs)

        is_recurring = len(amounts) >= 3 and 0 < median_days < 45

        aliases = sorted(data["aliases"].items(), key=lambda kv: -kv[1])[:_MAX_ALIASES]

        return MerchantIntelligence(
            user_id=self.user_id,
            merchant_name=merchant_name,
            merchant_aliases=json.dumps([alias for alias, _count in aliases]),
            label_kind=label_kind,
            primary_category=primary_cat,
            primary_subcategory=primary_subcat,
            total_spent=Decimal(str(sum(amounts))),
            transaction_count=len(amounts),
            avg_transaction=Decimal(str(mean(amounts))),
            first_transaction=dates[0] if dates else None,
            last_transaction=dates[-1] if dates else None,
            months_active=months_active,
            avg_days_between=avg_days,
            is_recurring=is_recurring,
            last_calculated=datetime.now(UTC),
        )
