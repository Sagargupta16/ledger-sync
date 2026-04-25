"""Shared state and preference accessors for the analytics engine.

``AnalyticsEngineBase`` holds ``self.db``, ``self.user_id``, cached preferences,
and all ``@property`` accessors that read preferences with sensible defaults.
Every mixin in this package assumes it will be combined with this base.
"""

from __future__ import annotations

import calendar
import json
import logging
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Query, Session

from ledger_sync.core._analytics_helpers import (
    DEFAULT_ESSENTIAL_CATEGORIES,
    DEFAULT_INVESTMENT_ACCOUNT_PATTERNS,
)
from ledger_sync.db.models import Transaction, UserPreferences
from ledger_sync.utils.logging import get_analytics_logger


class AnalyticsEngineBase:
    """Base: constructor, preferences, and shared query helpers."""

    def __init__(self, db: Session, user_id: int | None = None) -> None:
        """Initialize analytics engine.

        Args:
            db: Database session
            user_id: ID of the authenticated user. REQUIRED in production.
                ``None`` is accepted only for legacy single-user tooling paths.
                All per-user aggregations below (anomalies, recurring patterns,
                budgets, etc.) will refuse to run without a concrete user_id.

        """
        self.db: Session = db
        self.user_id: int | None = user_id
        self.logger: logging.Logger = get_analytics_logger()
        self._preferences: UserPreferences | None = None
        self._load_preferences()

    # ─── user-scope guard ───────────────────────────────────────────────────

    def _require_user_id(self) -> int:
        """Return ``self.user_id`` or raise if it is ``None``.

        Used by code paths that aggregate per-user data and would otherwise
        leak across users.
        """
        if self.user_id is None:
            raise RuntimeError(
                "AnalyticsEngine requires a user_id for per-user aggregations; "
                "got None. This usually means the engine was constructed from "
                "a tooling path that should be updated to pass a concrete user.",
            )
        return self.user_id

    # ─── preferences loading / parsing ──────────────────────────────────────

    def _load_preferences(self) -> None:
        """Load user preferences from database (tolerates missing rows)."""
        try:
            stmt = select(UserPreferences)
            if self.user_id is not None:
                stmt = stmt.where(UserPreferences.user_id == self.user_id)
            stmt = stmt.limit(1)
            result = self.db.execute(stmt)
            self._preferences = result.scalar_one_or_none()
            if self._preferences:
                self.logger.info("Loaded user preferences from database")
            else:
                self.logger.info("No user preferences found, using defaults")
        except (OSError, RuntimeError, ValueError) as e:
            self.logger.warning("Could not load preferences: %s, using defaults", e)
            self._preferences = None

    def _parse_json_field(
        self,
        value: str | list[Any] | dict[str, Any] | None,
        default: Any,
    ) -> Any:
        """Parse a JSON string from preferences, returning ``default`` on failure."""
        if value is None:
            return default
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return default
        return value

    # ─── property accessors ─────────────────────────────────────────────────

    @property
    def essential_categories(self) -> set[str]:
        """Get essential categories from preferences or defaults."""
        if self._preferences and self._preferences.essential_categories:
            cats = self._parse_json_field(
                self._preferences.essential_categories,
                list(DEFAULT_ESSENTIAL_CATEGORIES),
            )
            return set(cats)
        return DEFAULT_ESSENTIAL_CATEGORIES

    @property
    def excluded_accounts(self) -> set[str]:
        """Get excluded account names from preferences (empty set if none)."""
        if self._preferences and getattr(self._preferences, "excluded_accounts", None):
            accounts = self._parse_json_field(
                self._preferences.excluded_accounts,
                [],
            )
            return set(accounts)
        return set()

    @property
    def investment_account_patterns(self) -> dict[str, str]:
        """Get investment account mappings from preferences or defaults."""
        if self._preferences and self._preferences.investment_account_mappings:
            result: dict[str, str] = self._parse_json_field(
                self._preferences.investment_account_mappings,
                DEFAULT_INVESTMENT_ACCOUNT_PATTERNS,
            )
            return result
        return DEFAULT_INVESTMENT_ACCOUNT_PATTERNS

    @property
    def fiscal_year_start_month(self) -> int:
        """Get fiscal year start month from preferences (default April)."""
        if self._preferences and self._preferences.fiscal_year_start_month:
            return self._preferences.fiscal_year_start_month
        return 4  # Default: April (India FY)

    @property
    def taxable_income_categories(self) -> list[str]:
        """Get taxable income subcategories from preferences."""
        default = [
            "Employment Income::Salary",
            "Employment Income::Stipend",
            "Employment Income::Bonuses",
            "Employment Income::RSUs",
            "Business/Self Employment Income::Gig Work Income",
        ]
        if self._preferences and self._preferences.taxable_income_categories:
            result: list[str] = self._parse_json_field(
                self._preferences.taxable_income_categories,
                default,
            )
            return result
        return default

    @property
    def investment_returns_categories(self) -> list[str]:
        """Get investment returns subcategories from preferences."""
        default = [
            "Investment Income::Dividends",
            "Investment Income::Interest",
            "Investment Income::F&O Income",
            "Investment Income::Stock Market Profits",
        ]
        if self._preferences and self._preferences.investment_returns_categories:
            result: list[str] = self._parse_json_field(
                self._preferences.investment_returns_categories,
                default,
            )
            return result
        return default

    @property
    def non_taxable_income_categories(self) -> list[str]:
        """Get non-taxable income subcategories from preferences."""
        default = [
            "Refund & Cashbacks::Credit Card Cashbacks",
            "Refund & Cashbacks::Other Cashbacks",
            "Refund & Cashbacks::Product/Service Refunds",
            "Refund & Cashbacks::Deposits Return",
            "Employment Income::Expense Reimbursement",
        ]
        if self._preferences and self._preferences.non_taxable_income_categories:
            result: list[str] = self._parse_json_field(
                self._preferences.non_taxable_income_categories,
                default,
            )
            return result
        return default

    @property
    def other_income_categories(self) -> list[str]:
        """Get other income subcategories from preferences."""
        default = [
            "One-time Income::Gifts",
            "One-time Income::Pocket Money",
            "One-time Income::Competition/Contest Prizes",
            "Employment Income::EPF Contribution",
            "Other::Other",
        ]
        if self._preferences and self._preferences.other_income_categories:
            result: list[str] = self._parse_json_field(
                self._preferences.other_income_categories,
                default,
            )
            return result
        return default

    @property
    def _currency_symbol(self) -> str:
        """Get currency symbol from preferences (default ₹)."""
        if self._preferences and hasattr(self._preferences, "currency_symbol"):
            return self._preferences.currency_symbol or "₹"
        return "₹"

    @property
    def anomaly_expense_threshold(self) -> float:
        """Get anomaly detection threshold (std devs)."""
        if self._preferences and self._preferences.anomaly_expense_threshold:
            return self._preferences.anomaly_expense_threshold
        return 2.0

    @property
    def recurring_min_confidence(self) -> float:
        """Get minimum confidence for recurring detection."""
        if self._preferences and self._preferences.recurring_min_confidence:
            return self._preferences.recurring_min_confidence
        return 50.0

    # ─── base transaction query (used by every mixin) ───────────────────────

    def _user_transaction_query(self) -> Query[Transaction]:
        """Base query for non-deleted transactions, user-scoped and filtered.

        Respects the user's ``excluded_accounts`` preference.
        """
        query = self.db.query(Transaction).filter(Transaction.is_deleted.is_(False))
        if self.user_id is not None:
            query = query.filter(Transaction.user_id == self.user_id)
        excluded = self.excluded_accounts
        if excluded:
            query = query.filter(Transaction.account.notin_(excluded))
        return query

    # ─── fiscal year helper (shared by summaries and fy_summaries mixins) ──

    def _get_fiscal_year(self, date: datetime) -> tuple[str, datetime, datetime]:
        """Return ``(fy_label, fy_start, fy_end)`` for *date*.

        Uses ``fiscal_year_start_month`` from preferences (April by default
        for India). FY 2024 starting April 1 2024 -> ``"FY2024-25"``.
        """
        fy_start_month = self.fiscal_year_start_month

        fy_year = date.year if date.month >= fy_start_month else date.year - 1

        fy_start = datetime(fy_year, fy_start_month, 1, tzinfo=UTC)
        if fy_start_month == 1:
            fy_end = datetime(fy_year, 12, 31, tzinfo=UTC)
            fy_label = f"FY{fy_year}"
        else:
            fy_end_year = fy_year + 1
            fy_end_month = fy_start_month - 1 if fy_start_month > 1 else 12
            last_day = calendar.monthrange(fy_end_year, fy_end_month)[1]
            fy_end = datetime(fy_end_year, fy_end_month, last_day, tzinfo=UTC)
            fy_label = f"FY{fy_year}-{str(fy_year + 1)[2:]}"

        return fy_label, fy_start, fy_end
