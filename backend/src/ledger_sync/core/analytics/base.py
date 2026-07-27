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
from ledger_sync.core.expense_class import capital_loss_keys, capital_loss_sql_filter
from ledger_sync.core.query_helpers import apply_excluded_accounts_filter
from ledger_sync.db.models import Transaction, UserPreferences
from ledger_sync.utils.logging import get_analytics_logger

#: Shipped defaults for the four income-classification columns, keyed by column
#: name. One mapping rather than four inline literals because
#: ``_any_income_list_configured`` has to compare a stored list against the
#: default for ITS OWN field to tell a reset row from a user choice.
#:
#: Entries are EXACT-MATCH ``"Category::Subcategory"`` keys, so a drifted
#: spelling costs money silently -- a key no transaction carries contributes zero
#: without raising. Both the historical spelling and the spelling real exports
#: carry are therefore listed: an unmatched key costs nothing, a missing one
#: costs money. Verified against a real exported ledger -- "Refunds & Cashbacks"
#: (PLURAL) is what the data carries and it is a material share of non-taxable
#: income while the singular matched nothing at all; the real subcategories are
#: "Deposit Return" (not "Deposits Return"), "Stock Market Profit" and
#: "F&O Profits" (the plural/"Income" variants matched 0 rows, so realised market
#: profit fell out of investment returns into "other" entirely); and Gifts /
#: Pocket Money live under "Other Income", not "One-time Income". Absolute
#: amounts stay out of tracked source; see ``.claude/docs/studies/``.
#:
#: The non-taxable list is the twin of ``api/preferences.py::
#: _DEFAULT_NON_TAXABLE_INCOME_CATEGORIES``, which ``POST /api/preferences/reset``
#: persists verbatim -- keep the two in sync or the reset-detection in
#: ``_any_income_list_configured`` silently stops recognising a reset row.
_INCOME_LIST_DEFAULTS: dict[str, tuple[str, ...]] = {
    "taxable_income_categories": (
        "Employment Income::Salary",
        "Employment Income::Stipend",
        "Employment Income::Bonuses",
        "Employment Income::RSUs",
        "Business/Self Employment Income::Gig Work Income",
    ),
    "investment_returns_categories": (
        "Investment Income::Dividends",
        "Investment Income::Interest",
        "Investment Income::F&O Income",
        "Investment Income::F&O Profits",
        "Investment Income::Stock Market Profits",
        "Investment Income::Stock Market Profit",
    ),
    "non_taxable_income_categories": (
        "Refund & Cashbacks::Credit Card Cashbacks",
        "Refund & Cashbacks::Other Cashbacks",
        "Refund & Cashbacks::Product/Service Refunds",
        "Refund & Cashbacks::Deposits Return",
        "Refunds & Cashbacks::Credit Card Cashbacks",
        "Refunds & Cashbacks::Other Cashbacks",
        "Refunds & Cashbacks::Product/Service Refunds",
        "Refunds & Cashbacks::Deposit Return",
        "Employment Income::Expense Reimbursement",
    ),
    "other_income_categories": (
        "One-time Income::Gifts",
        "One-time Income::Pocket Money",
        "One-time Income::Competition/Contest Prizes",
        "Other Income::Gifts",
        "Other Income::Pocket Money",
        "Other Income::Freelance Income",
        "Other Income::Uncategorised",
        "Employment Income::EPF Contribution",
        "Other::Other",
    ),
}


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

    def _configured_json(
        self,
        value: str | list[Any] | dict[str, Any] | None,
    ) -> list[Any] | dict[str, Any] | None:
        """Return the stored JSON collection, or ``None`` when it is not configured.

        Every JSON preference column is ``Text`` whose model default is the
        STRING ``"[]"`` / ``"{}"`` (see ``db/_models/user.py``), and a non-empty
        string is TRUTHY in Python. The historic guard ``if prefs and
        prefs.<field>:`` therefore PASSED for a row nobody had ever edited, and
        the accessor returned the EMPTY parse instead of the documented default.
        For ``essential_categories`` that booked 100% of spend as discretionary
        for every new user.

        "Not configured" here means null, blank, malformed, the wrong JSON type,
        or an EMPTY collection. Empty counts as unset only for the fields whose
        accessors call this helper -- see each property for why.
        """
        parsed = self._parse_json_field(value, None)
        if isinstance(parsed, (list, dict)) and parsed:
            return parsed
        return None

    # ─── property accessors ─────────────────────────────────────────────────

    @property
    def essential_categories(self) -> set[str]:
        """Essential (needs) expense categories, falling back to the defaults.

        An empty stored list means "not configured", NOT "nothing is essential".
        Three code paths write ``"[]"`` into this column for users who have
        never expressed an opinion -- the model default, ``_get_or_create_
        preferences``, and ``POST /api/preferences/reset`` -- so an empty list
        cannot distinguish a deliberate choice from an untouched row. Honouring
        it as deliberate booked 100% of expense as discretionary and made every
        needs/wants surface (50/30/20, Lean FIRE, essential share) read 0% needs.

        Unlike the four income lists, this field has no sibling partition, so the
        decision is per-field: nothing else can be populated to signal that an
        empty list here was deliberate.

        NOT aligned with ``analytics_v2_impl/spending_rule.py``, which keeps its
        own ``_DEFAULT_NEEDS`` keyword set, matches on category OR subcategory,
        matches case-insensitively at word boundaries, and UNIONS the user's list
        with its defaults instead of honouring it verbatim. Measured on the
        owner's ledger the two disagree by well under a point for an
        unconfigured user and by several points for a configured one, both
        before and after this fix. Unifying them means having spending_rule
        resolve essentials through this property; until then, treat the /budgets
        needs bucket and the ``monthly_summaries`` essential split as two
        different definitions.
        """
        cats = self._configured_json(
            self._preferences.essential_categories if self._preferences else None,
        )
        if isinstance(cats, list):
            return {str(c) for c in cats if c}
        return DEFAULT_ESSENTIAL_CATEGORIES

    @property
    def excluded_accounts(self) -> set[str]:
        """Account names to drop from analytics; empty set when none.

        Deliberately NOT routed through ``_configured_json``: here an empty list
        is a meaningful configuration -- "exclude nothing" -- and it coincides
        with the shipped default, so the truthiness trap has no effect. Falling
        back to a non-empty default would instead hide real accounts.
        ``query_helpers.excluded_accounts_for`` applies the same reading.
        """
        accounts = self._parse_json_field(
            self._preferences.excluded_accounts if self._preferences else None,
            [],
        )
        if isinstance(accounts, list):
            return {str(a) for a in accounts if a}
        return set()

    @property
    def investment_account_patterns(self) -> dict[str, str]:
        """Account-name fragment -> investment type, from preferences.

        Both readings agree for this field: ``DEFAULT_INVESTMENT_ACCOUNT_
        PATTERNS`` is intentionally EMPTY (shipping the maintainer's account
        names would leak them into every install), so "unset" and "explicitly
        empty" produce the same ``{}``. Consumers already handle empty --
        ``net_worth.py`` skips its investment split when this is falsy.
        """
        patterns = self._configured_json(
            self._preferences.investment_account_mappings if self._preferences else None,
        )
        if isinstance(patterns, dict):
            return {str(k): str(v) for k, v in patterns.items() if k}
        return DEFAULT_INVESTMENT_ACCOUNT_PATTERNS

    @property
    def fiscal_year_start_month(self) -> int:
        """Get fiscal year start month from preferences (default April)."""
        if self._preferences and self._preferences.fiscal_year_start_month:
            return self._preferences.fiscal_year_start_month
        return 4  # Default: April (India FY)

    def _any_income_list_configured(self) -> bool:
        """True when the USER has classified at least one income item anywhere.

        The four income lists are not four independent settings -- they are a
        PARTITION written by one exclusive-assignment UI.
        ``IncomeClassificationSection.handleClassify`` removes the item from all
        four lists and appends it to exactly one, so "taxable is empty because I
        filed every income item under non-taxable" is a state the UI produces.

        That makes the per-field rule used for ``essential_categories`` wrong
        here. Injecting the shipped defaults into one empty list would RE-TAX
        income the user explicitly marked non-taxable, and re-label income the
        user explicitly filed as other -- overriding a deliberate choice, which
        is the failure mode the whole fix exists to avoid.

        So the fallback is decided for the GROUP: defaults apply only when no
        list holds a user choice (genuinely untouched, which is what the model
        default, ``_get_or_create_preferences``, and ``POST
        /api/preferences/reset`` all leave behind), and an individual empty list
        is honoured as deliberate as soon as a sibling holds one.

        "A user choice" excludes a list that is exactly the shipped default for
        its own field, because ``POST /api/preferences/reset`` PERSISTS
        ``_DEFAULT_NON_TAXABLE_INCOME_CATEGORIES`` verbatim while writing ``[]``
        for the other three (see ``api/preferences.py``). Counting that as
        configuration would treat a reset user's taxable/investment/other lists
        as deliberately empty and re-open exactly this bug for them. A user who
        hand-picks precisely the 9 shipped keys is indistinguishable from reset
        at the data layer; resolving that tie toward the defaults costs nothing
        for the field itself and keeps the siblings populated.
        """
        if not self._preferences:
            return False
        for field, shipped in _INCOME_LIST_DEFAULTS.items():
            stored = self._configured_json(getattr(self._preferences, field, None))
            if isinstance(stored, list) and {str(c) for c in stored if c} != set(shipped):
                return True
        return False

    def _income_categories(self, field: str) -> list[str]:
        """Resolve one income-classification list from the group's state.

        A populated list is always honoured verbatim. An EMPTY list means
        "deliberately empty" when a sibling carries a user choice, and "never
        configured" otherwise -- see ``_any_income_list_configured`` for why the
        decision is group-wide.

        The nothing-configured case is the one that corrupted real money: with
        every list empty, ``_is_taxable_income`` / ``_is_salary_income`` /
        ``_is_bonus_income`` / ``_is_investment_income`` all returned False, so
        every credit landed in ``other_income`` in ``monthly_summaries`` and the
        FY summaries, and salary/bonus/investment income read zero.
        """
        configured = self._configured_json(
            getattr(self._preferences, field, None) if self._preferences else None,
        )
        if isinstance(configured, list):
            return [str(c) for c in configured if c]
        if self._any_income_list_configured():
            # A sibling carries a user choice, so this empty list is deliberate.
            return []
        return list(_INCOME_LIST_DEFAULTS[field])

    @property
    def taxable_income_categories(self) -> list[str]:
        """Get taxable income subcategories from preferences."""
        return self._income_categories("taxable_income_categories")

    @property
    def investment_returns_categories(self) -> list[str]:
        """Get investment returns subcategories from preferences."""
        return self._income_categories("investment_returns_categories")

    @property
    def non_taxable_income_categories(self) -> list[str]:
        """Get non-taxable income subcategories from preferences."""
        return self._income_categories("non_taxable_income_categories")

    @property
    def other_income_categories(self) -> list[str]:
        """Get other income subcategories from preferences."""
        return self._income_categories("other_income_categories")

    @property
    def capital_loss_keys(self) -> set[str]:
        """Normalised keys the user declared to be realised investment losses.

        Read straight off the raw column with NO default fallback, which is the
        opposite of the four income lists above. Those lists carry shipped
        defaults because an unclassified ledger reports zero salary income --
        visibly broken. Here an empty set means the aggregates keep counting
        those rows as expenses, exactly as they did before the preference
        existed, and that is the safe state: only the user knows which of their
        EXPENSE rows are losses, and defaulting would silently move their
        historical expense totals and savings rate.
        """
        if not self._preferences:
            return set()
        return capital_loss_keys(getattr(self._preferences, "capital_loss_categories", None))

    @property
    def _currency_symbol(self) -> str:
        """Get currency symbol from preferences (default ₹)."""
        if self._preferences and hasattr(self._preferences, "currency_symbol"):
            return self._preferences.currency_symbol or "₹"
        return "₹"

    @property
    def anomaly_expense_threshold(self) -> float:
        """Get anomaly detection threshold (std devs).

        A truthiness guard is safe here: ``AnomalySettingsConfig`` constrains
        this to ``ge=1.0``, so 0 is unreachable through the API.
        """
        if self._preferences and self._preferences.anomaly_expense_threshold:
            return self._preferences.anomaly_expense_threshold
        return 2.0

    @property
    def recurring_min_confidence(self) -> float:
        """Get minimum confidence for recurring detection.

        ``is None``, not truthiness: ``RecurringSettingsConfig`` allows ``ge=0``,
        so "show every detected pattern, unfiltered" is a legal setting a
        truthiness guard would silently rewrite to 50.
        """
        if self._preferences and self._preferences.recurring_min_confidence is not None:
            return self._preferences.recurring_min_confidence
        return 50.0

    # ─── base transaction query (used by every mixin) ───────────────────────

    def _user_transaction_query(self) -> Query[Transaction]:
        """Base query for non-deleted transactions, user-scoped and filtered.

        Respects the user's ``excluded_accounts`` preference -- drops rows
        whose ``account``, ``from_account``, or ``to_account`` matches an
        excluded name. Transfers store ``account = from_account``, so a
        check on ``account`` alone misses transfers landing in an
        excluded account (the credit side ends up in net worth).
        """
        query = self.db.query(Transaction).filter(Transaction.is_deleted.is_(False))
        if self.user_id is not None:
            query = query.filter(Transaction.user_id == self.user_id)
        query = apply_excluded_accounts_filter(query, self.excluded_accounts)
        return query

    def _exclude_capital_losses[QueryT: Query[Any]](self, query: QueryT) -> QueryT:
        """Drop rows the user classified as realised investment losses.

        For SQL-side aggregates that would otherwise treat a loss as spending.
        Returns *query* UNCHANGED when nothing is configured, so the default
        case emits exactly the SQL it did before this helper existed.

        Generic in the query type (like ``apply_excluded_accounts_filter``) so a
        row-returning aggregate query keeps its tuple element types through the
        call instead of widening to ``Query[Any]``.

        Only meaningful on a query already restricted to EXPENSE rows -- callers
        do that themselves, since income-side classification uses the separate
        ``investment_returns_categories`` list.
        """
        predicate = capital_loss_sql_filter(self.capital_loss_keys)
        if predicate is None:
            return query
        return query.filter(predicate)

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
