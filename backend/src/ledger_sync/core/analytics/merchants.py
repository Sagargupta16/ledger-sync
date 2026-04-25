"""Merchant intelligence extraction mixin."""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal
from statistics import mean
from typing import Any

from sqlalchemy import delete

from ledger_sync.core.analytics.base import AnalyticsEngineBase
from ledger_sync.db.models import MerchantIntelligence, Transaction, TransactionType

# Known merchant patterns -- compiled once and reused.
_MERCHANT_PATTERNS = [
    re.compile(
        r"^(Uber|Ola|Rapido|Swiggy|Zomato|Amazon|Flipkart|BigBasket|Zepto|Blinkit|Dunzo)",
        re.IGNORECASE,
    ),
    re.compile(r"^(Netflix|Spotify|YouTube|Disney|Prime|Hotstar)", re.IGNORECASE),
    re.compile(r"^(Google|Apple|Microsoft|Adobe|AWS|Azure)", re.IGNORECASE),
    re.compile(r"^(HDFC|SBI|ICICI|Axis|Kotak)", re.IGNORECASE),
]


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

        merchants: dict[str, dict[str, Any]] = defaultdict(
            lambda: {
                "amounts": [],
                "dates": [],
                "categories": defaultdict(int),
                "subcategories": defaultdict(int),
            },
        )

        for txn in expenses:
            merchant_name = self._extract_merchant_name(txn.note or "")
            if merchant_name:
                merchants[merchant_name]["amounts"].append(float(txn.amount))
                merchants[merchant_name]["dates"].append(txn.date)
                merchants[merchant_name]["categories"][txn.category] += 1
                if txn.subcategory:
                    merchants[merchant_name]["subcategories"][txn.subcategory] += 1

        # Delete existing for this user and insert new
        del_stmt = delete(MerchantIntelligence)
        if self.user_id is not None:
            del_stmt = del_stmt.where(MerchantIntelligence.user_id == self.user_id)
        self.db.execute(del_stmt)

        count = 0
        for merchant_name, data in merchants.items():
            if len(data["amounts"]) < 2:  # Skip one-off merchants
                continue
            merchant = self._build_merchant_record(merchant_name, data)
            self.db.add(merchant)
            count += 1

        return count

    def _build_merchant_record(
        self,
        merchant_name: str,
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

        # Calculate average days between transactions
        avg_days = 0.0
        if len(dates) >= 2:
            day_diffs = [(dates[i + 1] - dates[i]).days for i in range(len(dates) - 1)]
            avg_days = mean(day_diffs) if day_diffs else 0

        # Detect if recurring (regular interval +/- 5 days)
        is_recurring = len(amounts) >= 3 and 0 < avg_days < 45

        return MerchantIntelligence(
            user_id=self.user_id,
            merchant_name=merchant_name,
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

    def _extract_merchant_name(self, note: str) -> str | None:
        """Extract merchant name from a transaction note."""
        if not note:
            return None

        note = note.strip()

        for pattern in _MERCHANT_PATTERNS:
            match = pattern.match(note)
            if match:
                return match.group(1).title()

        # Default: first word if it looks like a merchant
        words = note.split()
        first_word = words[0] if words else None
        if first_word and len(first_word) > 2 and first_word[0].isupper():
            return first_word

        return None
