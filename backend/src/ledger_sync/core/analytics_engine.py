"""Analytics Engine - Calculates and persists analytics data after each upload.

This module provides comprehensive post-upload analytics calculations including:
- Monthly summaries with income/expense breakdown
- Category trends over time
- Transfer flow aggregations
- Recurring transaction detection
- Merchant intelligence extraction
- Anomaly detection
- Net worth snapshots
- Fiscal year summaries
"""

import json
import re
import time
from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal
from statistics import mean, stdev
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ledger_sync.db.models import (
    AccountClassification,
    Anomaly,
    AnomalyType,
    AuditLog,
    Budget,
    CategoryTrend,
    FYSummary,
    MerchantIntelligence,
    MonthlySummary,
    NetWorthSnapshot,
    RecurrenceFrequency,
    RecurringTransaction,
    Transaction,
    TransactionType,
    TransferFlow,
    UserPreferences,
)
from ledger_sync.utils.logging import (
    get_analytics_logger,
    log_analytics_calculation,
    log_error,
)

# Default values (used if no preferences in DB)
DEFAULT_ESSENTIAL_CATEGORIES = {
    "Housing",
    "Healthcare",
    "Transportation",
    "Food & Dining",
    "Education",
    "Family",
    "Utilities",
}

DEFAULT_INVESTMENT_ACCOUNT_PATTERNS = {
    "Grow Stocks": "stocks",
    "Grow Mutual Funds": "mutual_funds",
    "IND money": "stocks",
    "FD/Bonds": "fixed_deposits",
    "EPF": "ppf_epf",
    "PPF": "ppf_epf",
    "RSUs": "stocks",
}


class AnalyticsEngine:
    """Engine for calculating and persisting analytics data."""

    def __init__(self, db: Session, user_id: int | None = None):
        """Initialize analytics engine.

        Args:
            db: Database session
            user_id: ID of the authenticated user (required for multi-user scoping)

        """
        self.db = db
        self.user_id = user_id
        self.logger = get_analytics_logger()
        self._preferences: UserPreferences | None = None
        self._load_preferences()

    def _load_preferences(self) -> None:
        """Load user preferences from database."""
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

    def _parse_json_field(self, value: str | list | dict | None, default: Any) -> Any:
        """Parse JSON field from preferences."""
        if value is None:
            return default
        if isinstance(value, str):
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return default
        return value

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
    def investment_account_patterns(self) -> dict[str, str]:
        """Get investment account mappings from preferences or defaults."""
        if self._preferences and self._preferences.investment_account_mappings:
            return self._parse_json_field(
                self._preferences.investment_account_mappings,
                DEFAULT_INVESTMENT_ACCOUNT_PATTERNS,
            )
        return DEFAULT_INVESTMENT_ACCOUNT_PATTERNS

    @property
    def fiscal_year_start_month(self) -> int:
        """Get fiscal year start month from preferences or default (April)."""
        if self._preferences and self._preferences.fiscal_year_start_month:
            return self._preferences.fiscal_year_start_month
        return 4  # Default: April (India FY)

    @property
    def taxable_income_categories(self) -> list[str]:
        """Get taxable income subcategories from preferences (Category::Subcategory format)."""
        default = [
            "Employment Income::Salary",
            "Employment Income::Stipend",
            "Employment Income::Bonuses",
            "Employment Income::RSUs",
            "Business/Self Employment Income::Gig Work Income",
        ]
        if self._preferences and self._preferences.taxable_income_categories:
            return self._parse_json_field(self._preferences.taxable_income_categories, default)
        return default

    @property
    def investment_returns_categories(self) -> list[str]:
        """Get investment returns subcategories from preferences (Category::Subcategory format)."""
        default = [
            "Investment Income::Dividends",
            "Investment Income::Interest",
            "Investment Income::F&O Income",
            "Investment Income::Stock Market Profits",
        ]
        if self._preferences and self._preferences.investment_returns_categories:
            return self._parse_json_field(self._preferences.investment_returns_categories, default)
        return default

    @property
    def non_taxable_income_categories(self) -> list[str]:
        """Get non-taxable income subcategories from preferences (Category::Subcategory format)."""
        default = [
            "Refund & Cashbacks::Credit Card Cashbacks",
            "Refund & Cashbacks::Other Cashbacks",
            "Refund & Cashbacks::Product/Service Refunds",
            "Refund & Cashbacks::Deposits Return",
            "Employment Income::Expense Reimbursement",
        ]
        if self._preferences and self._preferences.non_taxable_income_categories:
            return self._parse_json_field(self._preferences.non_taxable_income_categories, default)
        return default

    @property
    def other_income_categories(self) -> list[str]:
        """Get other income subcategories from preferences (Category::Subcategory format)."""
        default = [
            "One-time Income::Gifts",
            "One-time Income::Pocket Money",
            "One-time Income::Competition/Contest Prizes",
            "Employment Income::EPF Contribution",
            "Other::Other",
        ]
        if self._preferences and self._preferences.other_income_categories:
            return self._parse_json_field(self._preferences.other_income_categories, default)
        return default

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

    def _is_taxable_income(self, txn: Transaction) -> bool:
        """Check if transaction is taxable income based on preferences."""
        item = f"{txn.category}::{txn.subcategory}"
        return item in self.taxable_income_categories

    def _is_salary_income(self, txn: Transaction) -> bool:
        """Check if transaction is salary income (subset of taxable)."""
        item = f"{txn.category}::{txn.subcategory}"
        # Check if it's in taxable and specifically salary/stipend
        salary_items = [
            "Employment Income::Salary",
            "Employment Income::Stipend",
        ]
        return item in salary_items or item in self.taxable_income_categories

    def _is_bonus_income(self, txn: Transaction) -> bool:
        """Check if transaction is bonus income (subset of taxable)."""
        item = f"{txn.category}::{txn.subcategory}"
        bonus_items = [
            "Employment Income::Bonuses",
            "Employment Income::RSUs",
        ]
        return item in bonus_items

    def _is_investment_income(self, txn: Transaction) -> bool:
        """Check if transaction is investment income based on preferences."""
        item = f"{txn.category}::{txn.subcategory}"
        return item in self.investment_returns_categories

    def _is_investment_account(self, account_name: str | None) -> bool:
        """Check if account is an investment account based on preferences."""
        if not account_name:
            return False
        return any(inv in account_name for inv in self.investment_account_patterns)

    def _get_investment_type(self, account_name: str | None) -> str | None:
        """Get investment type for an account based on preferences."""
        if not account_name:
            return None
        for pattern, inv_type in self.investment_account_patterns.items():
            if pattern in account_name:
                return inv_type
        return None

    def _get_fiscal_year(self, date: datetime) -> tuple[str, datetime, datetime]:
        """Get fiscal year label and date range for a given date.

        Uses fiscal_year_start_month from preferences.

        Returns:
            Tuple of (fy_label, start_date, end_date)

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
            # Get last day of the end month
            if fy_end_month == 12:
                fy_end = datetime(fy_end_year, 12, 31, tzinfo=UTC)
            elif fy_end_month in [1, 3, 5, 7, 8, 10]:
                fy_end = datetime(fy_end_year, fy_end_month, 31, tzinfo=UTC)
            elif fy_end_month in [4, 6, 9, 11]:
                fy_end = datetime(fy_end_year, fy_end_month, 30, tzinfo=UTC)
            else:  # February
                fy_end = datetime(fy_end_year, 2, 28, tzinfo=UTC)
            fy_label = f"FY{fy_year}-{str(fy_year + 1)[2:]}"

        return fy_label, fy_start, fy_end

    def run_full_analytics(self, source_file: str | None = None) -> dict[str, Any]:
        """Run all analytics calculations after an upload.

        Args:
            source_file: Optional source file name for audit logging

        Returns:
            Summary of analytics calculated

        """
        self.logger.info("=" * 60)
        self.logger.info("ANALYTICS CALCULATION STARTED")
        self.logger.info("Source: %s", source_file or "manual trigger")
        self.logger.info("Timestamp: %s", datetime.now(UTC).isoformat())
        self.logger.info("=" * 60)

        results = {}
        start_time = time.time()

        try:
            # 1. Calculate monthly summaries
            t0 = time.time()
            results["monthly_summaries"] = self._calculate_monthly_summaries()
            log_analytics_calculation(
                "Monthly summaries",
                results["monthly_summaries"],
                (time.time() - t0) * 1000,
            )

            # 2. Calculate category trends
            t0 = time.time()
            results["category_trends"] = self._calculate_category_trends()
            log_analytics_calculation(
                "Category trends",
                results["category_trends"],
                (time.time() - t0) * 1000,
            )

            # 3. Calculate transfer flows
            t0 = time.time()
            results["transfer_flows"] = self._calculate_transfer_flows()
            log_analytics_calculation(
                "Transfer flows",
                results["transfer_flows"],
                (time.time() - t0) * 1000,
            )

            # 4. Extract merchant intelligence
            t0 = time.time()
            results["merchants"] = self._extract_merchant_intelligence()
            log_analytics_calculation("Merchants", results["merchants"], (time.time() - t0) * 1000)

            # 5. Detect recurring transactions
            t0 = time.time()
            results["recurring"] = self._detect_recurring_transactions()
            log_analytics_calculation(
                "Recurring patterns",
                results["recurring"],
                (time.time() - t0) * 1000,
            )

            # 6. Calculate net worth snapshot
            t0 = time.time()
            results["net_worth"] = self._calculate_net_worth_snapshot()
            log_analytics_calculation(
                "Net worth snapshot",
                1 if results["net_worth"] else 0,
                (time.time() - t0) * 1000,
            )

            # 7. Calculate fiscal year summaries
            t0 = time.time()
            results["fy_summaries"] = self._calculate_fy_summaries()
            log_analytics_calculation(
                "FY summaries",
                results["fy_summaries"],
                (time.time() - t0) * 1000,
            )

            # 8. Detect anomalies
            t0 = time.time()
            results["anomalies"] = self._detect_anomalies()
            log_analytics_calculation(
                "Anomalies detected",
                results["anomalies"],
                (time.time() - t0) * 1000,
            )

            # 9. Update budget tracking
            t0 = time.time()
            results["budgets_updated"] = self._update_budget_tracking()
            log_analytics_calculation(
                "Budgets updated",
                results["budgets_updated"],
                (time.time() - t0) * 1000,
            )

            # Log the analytics run
            self._log_audit(
                operation="analytics",
                entity_type="system",
                action="calculate",
                changes_summary=json.dumps(results),
                source_file=source_file,
            )

            self.db.commit()

            total_time = (time.time() - start_time) * 1000
            self.logger.info("-" * 60)
            self.logger.info("ANALYTICS COMPLETED in %.1fms", total_time)
            self.logger.info("=" * 60)

        except Exception as e:
            log_error("Analytics calculation failed", e, {"source_file": source_file})
            self.db.rollback()
            raise

        return results

    def _user_transaction_query(self):
        """Base query for transactions scoped to current user."""
        query = self.db.query(Transaction).filter(Transaction.is_deleted.is_(False))
        if self.user_id is not None:
            query = query.filter(Transaction.user_id == self.user_id)
        return query

    def _calculate_monthly_summaries(self) -> int:
        """Calculate and persist monthly summary aggregations."""
        # Get all non-deleted transactions for this user
        transactions = self._user_transaction_query().all()

        # Group by month
        monthly_data: dict[str, dict[str, Any]] = defaultdict(
            lambda: {
                "total_income": Decimal(0),
                "salary_income": Decimal(0),
                "investment_income": Decimal(0),
                "other_income": Decimal(0),
                "total_expenses": Decimal(0),
                "essential_expenses": Decimal(0),
                "discretionary_expenses": Decimal(0),
                "total_transfers_out": Decimal(0),
                "total_transfers_in": Decimal(0),
                "net_investment_flow": Decimal(0),
                "income_count": 0,
                "expense_count": 0,
                "transfer_count": 0,
            },
        )

        for txn in transactions:
            period_key = txn.date.strftime("%Y-%m")
            year = txn.date.year
            month = txn.date.month
            amount = Decimal(str(txn.amount))

            if txn.type == TransactionType.INCOME:
                monthly_data[period_key]["total_income"] += amount
                monthly_data[period_key]["income_count"] += 1

                # Categorize income using preferences
                if self._is_salary_income(txn):
                    monthly_data[period_key]["salary_income"] += amount
                elif self._is_investment_income(txn):
                    monthly_data[period_key]["investment_income"] += amount
                else:
                    monthly_data[period_key]["other_income"] += amount

            elif txn.type == TransactionType.EXPENSE:
                monthly_data[period_key]["total_expenses"] += amount
                monthly_data[period_key]["expense_count"] += 1

                # Categorize expenses using preferences
                if txn.category in self.essential_categories:
                    monthly_data[period_key]["essential_expenses"] += amount
                else:
                    monthly_data[period_key]["discretionary_expenses"] += amount

            elif txn.type == TransactionType.TRANSFER:
                monthly_data[period_key]["transfer_count"] += 1

                # Track investment flows using preferences
                if self._is_investment_account(txn.to_account):
                    monthly_data[period_key][
                        "net_investment_flow"
                    ] -= amount  # Money going to investments
                    monthly_data[period_key]["total_transfers_out"] += amount
                elif self._is_investment_account(txn.from_account):
                    monthly_data[period_key][
                        "net_investment_flow"
                    ] += amount  # Money coming from investments
                    monthly_data[period_key]["total_transfers_in"] += amount

            monthly_data[period_key]["year"] = year
            monthly_data[period_key]["month"] = month

        # Delete existing summaries for this user and insert new ones
        del_stmt = delete(MonthlySummary)
        if self.user_id is not None:
            del_stmt = del_stmt.where(MonthlySummary.user_id == self.user_id)
        self.db.execute(del_stmt)

        count = 0
        sorted_periods = sorted(monthly_data.keys())
        prev_income = None
        prev_expenses = None

        for period_key in sorted_periods:
            data = monthly_data[period_key]
            total_income = data["total_income"]
            total_expenses = data["total_expenses"]
            net_savings = total_income - total_expenses
            savings_rate = float(net_savings / total_income * 100) if total_income > 0 else 0
            expense_ratio = float(total_expenses / total_income * 100) if total_income > 0 else 0

            # Calculate MoM changes
            income_change_pct = 0.0
            expense_change_pct = 0.0
            if prev_income and prev_income > 0:
                income_change_pct = float((total_income - prev_income) / prev_income * 100)
            if prev_expenses and prev_expenses > 0:
                expense_change_pct = float((total_expenses - prev_expenses) / prev_expenses * 100)

            summary = MonthlySummary(
                user_id=self.user_id,
                year=data["year"],
                month=data["month"],
                period_key=period_key,
                total_income=total_income,
                salary_income=data["salary_income"],
                investment_income=data["investment_income"],
                other_income=data["other_income"],
                total_expenses=total_expenses,
                essential_expenses=data["essential_expenses"],
                discretionary_expenses=data["discretionary_expenses"],
                total_transfers_out=data["total_transfers_out"],
                total_transfers_in=data["total_transfers_in"],
                net_investment_flow=data["net_investment_flow"],
                net_savings=net_savings,
                savings_rate=savings_rate,
                expense_ratio=expense_ratio,
                income_count=data["income_count"],
                expense_count=data["expense_count"],
                transfer_count=data["transfer_count"],
                total_transactions=data["income_count"]
                + data["expense_count"]
                + data["transfer_count"],
                income_change_pct=income_change_pct,
                expense_change_pct=expense_change_pct,
                last_calculated=datetime.now(UTC),
            )
            self.db.add(summary)
            count += 1

            prev_income = total_income
            prev_expenses = total_expenses

        return count

    def _calculate_category_trends(self) -> int:
        """Calculate category-level trends over time."""
        transactions = (
            self._user_transaction_query()
            .filter(Transaction.type != TransactionType.TRANSFER)  # Exclude transfers
            .all()
        )

        # Group by period + category + type
        category_data: dict[tuple, dict[str, Any]] = defaultdict(
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

        # Get monthly totals for percentage calculation
        monthly_totals: dict[str, dict[str, Decimal]] = defaultdict(
            lambda: {"Income": Decimal(0), "Expense": Decimal(0)},
        )
        for txn in transactions:
            period_key = txn.date.strftime("%Y-%m")
            monthly_totals[period_key][txn.type.value] += Decimal(str(txn.amount))

        # Delete existing for this user and insert new
        del_stmt = delete(CategoryTrend)
        if self.user_id is not None:
            del_stmt = del_stmt.where(CategoryTrend.user_id == self.user_id)
        self.db.execute(del_stmt)

        count = 0
        prev_amounts: dict[tuple, float] = {}

        for (period_key, category, txn_type), data in sorted(category_data.items()):
            amounts = data["amounts"]
            total = sum(amounts)
            monthly_type_total = float(monthly_totals[period_key].get(txn_type, 1))
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

    def _calculate_transfer_flows(self) -> int:
        """Calculate aggregated transfer flows between accounts."""
        transfers = (
            self._user_transaction_query()
            .filter(Transaction.type == TransactionType.TRANSFER)
            .all()
        )

        # Get account classifications for coloring
        classifications = {
            ac.account_name: ac.account_type.value
            for ac in self.db.query(AccountClassification).all()
        }

        # Aggregate flows
        flows: dict[tuple, dict[str, Any]] = defaultdict(
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

    def _extract_merchant_intelligence(self) -> int:
        """Extract and aggregate merchant/vendor data from transaction notes."""
        expenses = (
            self._user_transaction_query()
            .filter(Transaction.type == TransactionType.EXPENSE)
            .filter(Transaction.note.isnot(None))
            .all()
        )

        # Extract merchant names from notes
        merchants: dict[str, dict[str, Any]] = defaultdict(
            lambda: {
                "amounts": [],
                "dates": [],
                "categories": defaultdict(int),
                "subcategories": defaultdict(int),
            },
        )

        for txn in expenses:
            # Extract merchant name (first word or known patterns)
            merchant_name = self._extract_merchant_name(txn.note)
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

            amounts = data["amounts"]
            dates = sorted(data["dates"])

            # Find primary category
            primary_cat = max(data["categories"].items(), key=lambda x: x[1])[0]
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
            is_recurring = len(data["amounts"]) >= 3 and avg_days > 0 and avg_days < 45

            merchant = MerchantIntelligence(
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
            self.db.add(merchant)
            count += 1

        return count

    def _extract_merchant_name(self, note: str) -> str | None:
        """Extract merchant name from transaction note."""
        if not note:
            return None

        note = note.strip()

        # Known merchant patterns
        patterns = [
            r"^(Uber|Ola|Rapido|Swiggy|Zomato|Amazon|Flipkart|BigBasket|Zepto|Blinkit|Dunzo)",
            r"^(Netflix|Spotify|YouTube|Disney|Prime|Hotstar)",
            r"^(Google|Apple|Microsoft|Adobe|AWS|Azure)",
            r"^(HDFC|SBI|ICICI|Axis|Kotak)",
        ]

        for pattern in patterns:
            match = re.match(pattern, note, re.IGNORECASE)
            if match:
                return match.group(1).title()

        # Default: first word if it looks like a merchant
        first_word = note.split()[0] if note.split() else None
        if first_word and len(first_word) > 2 and first_word[0].isupper():
            return first_word

        return None

    def _detect_recurring_transactions(self) -> int:
        """Detect recurring transaction patterns."""
        transactions = (
            self._user_transaction_query()
            .filter(Transaction.type.in_([TransactionType.INCOME, TransactionType.EXPENSE]))
            .order_by(Transaction.date)
            .all()
        )

        # Group by category + account + approximate amount
        patterns: dict[tuple, list] = defaultdict(list)
        for txn in transactions:
            # Round amount to nearest 100 for grouping
            amount_bucket = round(float(txn.amount) / 100) * 100
            key = (txn.category, txn.account, amount_bucket, txn.type.value)
            patterns[key].append(txn)

        # Delete existing for this user and insert new
        del_stmt = delete(RecurringTransaction)
        if self.user_id is not None:
            del_stmt = del_stmt.where(RecurringTransaction.user_id == self.user_id)
        self.db.execute(del_stmt)

        count = 0
        for (category, account, _amount_bucket, txn_type), txns in patterns.items():
            if len(txns) < 3:  # Need at least 3 occurrences
                continue

            dates = [t.date for t in txns]
            amounts = [float(t.amount) for t in txns]

            # Detect frequency
            frequency, confidence, expected_day = self._detect_frequency(dates)
            if not frequency or confidence < 50:
                continue

            avg_amount = mean(amounts)
            amount_variance = stdev(amounts) if len(amounts) > 1 else 0

            # Determine pattern name
            pattern_name = f"{category}"
            if txns[0].subcategory:
                pattern_name = f"{category} - {txns[0].subcategory}"

            recurring = RecurringTransaction(
                user_id=self.user_id,
                pattern_name=pattern_name,
                category=category,
                subcategory=txns[0].subcategory,
                account=account,
                transaction_type=TransactionType(txn_type),
                frequency=frequency,
                expected_amount=Decimal(str(avg_amount)),
                amount_variance=Decimal(str(amount_variance)),
                expected_day=expected_day,
                confidence_score=confidence,
                occurrences_detected=len(txns),
                last_occurrence=max(dates),
                is_active=True,
                first_detected=datetime.now(UTC),
                last_updated=datetime.now(UTC),
            )
            self.db.add(recurring)
            count += 1

        return count

    def _detect_frequency(
        self,
        dates: list,
    ) -> tuple[RecurrenceFrequency | None, float, int | None]:
        """Detect recurrence frequency from a list of dates."""
        if len(dates) < 3:
            return None, 0, None

        sorted_dates = sorted(dates)
        day_diffs = [
            (sorted_dates[i + 1] - sorted_dates[i]).days for i in range(len(sorted_dates) - 1)
        ]

        avg_diff = mean(day_diffs)
        std_diff = stdev(day_diffs) if len(day_diffs) > 1 else float("inf")

        # Detect frequency based on average interval
        frequency = None
        confidence = 0
        expected_day = None

        if 25 <= avg_diff <= 35 and std_diff < 10:
            frequency = RecurrenceFrequency.MONTHLY
            confidence = max(0, 100 - std_diff * 5)
            # Most common day of month
            days_of_month = [d.day for d in sorted_dates]
            expected_day = max(set(days_of_month), key=days_of_month.count)
        elif 5 <= avg_diff <= 9:
            frequency = RecurrenceFrequency.WEEKLY
            confidence = max(0, 100 - std_diff * 10)
        elif 12 <= avg_diff <= 16:
            frequency = RecurrenceFrequency.BIWEEKLY
            confidence = max(0, 100 - std_diff * 7)
        elif 85 <= avg_diff <= 95:
            frequency = RecurrenceFrequency.QUARTERLY
            confidence = max(0, 100 - std_diff * 3)
        elif 355 <= avg_diff <= 375:
            frequency = RecurrenceFrequency.YEARLY
            confidence = max(0, 100 - std_diff)

        return frequency, confidence, expected_day

    def _calculate_net_worth_snapshot(self) -> dict[str, Any]:
        """Calculate and store a net worth snapshot."""
        # Get account balances (simplified - based on transfers in/out)
        transfers = (
            self._user_transaction_query()
            .filter(Transaction.type == TransactionType.TRANSFER)
            .all()
        )

        # Track net position per account
        account_balances: dict[str, Decimal] = defaultdict(Decimal)
        for txn in transfers:
            if txn.from_account:
                account_balances[txn.from_account] -= Decimal(str(txn.amount))
            if txn.to_account:
                account_balances[txn.to_account] += Decimal(str(txn.amount))

        # Also add income/expense impact on primary accounts
        inc_exp = (
            self._user_transaction_query()
            .filter(Transaction.type.in_([TransactionType.INCOME, TransactionType.EXPENSE]))
            .all()
        )

        for txn in inc_exp:
            if txn.type == TransactionType.INCOME:
                account_balances[txn.account] += Decimal(str(txn.amount))
            else:
                account_balances[txn.account] -= Decimal(str(txn.amount))

        # Categorize accounts
        classifications = {
            ac.account_name: ac.account_type.value
            for ac in self.db.query(AccountClassification).all()
        }

        # Calculate totals by category
        cash_and_bank = Decimal(0)
        stocks = Decimal(0)
        mutual_funds = Decimal(0)
        fixed_deposits = Decimal(0)
        ppf_epf = Decimal(0)
        other_assets = Decimal(0)
        credit_card_outstanding = Decimal(0)
        loans_payable = Decimal(0)

        for account, balance in account_balances.items():
            account_type = classifications.get(account, "Other Wallets")

            if account_type in ["Bank Accounts", "Cash"]:
                cash_and_bank += balance
            elif account_type == "Credit Cards":
                if balance < 0:  # Outstanding balance
                    credit_card_outstanding += abs(balance)
            elif account_type == "Investments":
                # Further categorize investments using preferences
                inv_type = self._get_investment_type(account)
                if inv_type:
                    if inv_type == "stocks":
                        stocks += balance
                    elif inv_type == "mutual_funds":
                        mutual_funds += balance
                    elif inv_type == "fixed_deposits":
                        fixed_deposits += balance
                    elif inv_type == "ppf_epf":
                        ppf_epf += balance
                    else:
                        other_assets += balance
                else:
                    other_assets += balance
            elif account_type in ("Loans", "Loans/Lended"):
                if balance < 0:
                    loans_payable += abs(balance)
                else:
                    other_assets += balance
            else:
                other_assets += balance

        total_investments = stocks + mutual_funds + fixed_deposits + ppf_epf
        total_assets = cash_and_bank + total_investments + other_assets
        total_liabilities = credit_card_outstanding + loans_payable
        net_worth = total_assets - total_liabilities

        # Get previous snapshot for comparison
        prev_query = self.db.query(NetWorthSnapshot).order_by(NetWorthSnapshot.snapshot_date.desc())
        if self.user_id is not None:
            prev_query = prev_query.filter(NetWorthSnapshot.user_id == self.user_id)
        prev_snapshot = prev_query.first()

        net_worth_change = Decimal(0)
        net_worth_change_pct = 0.0
        if prev_snapshot:
            net_worth_change = net_worth - prev_snapshot.net_worth
            if prev_snapshot.net_worth != 0:
                net_worth_change_pct = float(net_worth_change / prev_snapshot.net_worth * 100)

        # Create snapshot
        snapshot = NetWorthSnapshot(
            user_id=self.user_id,
            snapshot_date=datetime.now(UTC),
            cash_and_bank=cash_and_bank,
            investments=total_investments,
            mutual_funds=mutual_funds,
            stocks=stocks,
            fixed_deposits=fixed_deposits,
            ppf_epf=ppf_epf,
            other_assets=other_assets,
            credit_card_outstanding=credit_card_outstanding,
            loans_payable=loans_payable,
            other_liabilities=Decimal(0),
            total_assets=total_assets,
            total_liabilities=total_liabilities,
            net_worth=net_worth,
            net_worth_change=net_worth_change,
            net_worth_change_pct=net_worth_change_pct,
            created_at=datetime.now(UTC),
            source="upload",
        )
        self.db.add(snapshot)

        return {
            "net_worth": float(net_worth),
            "total_assets": float(total_assets),
            "total_liabilities": float(total_liabilities),
            "change": float(net_worth_change),
            "change_pct": net_worth_change_pct,
        }

    def _calculate_fy_summaries(self) -> int:
        """Calculate fiscal year summaries using configurable start month."""
        transactions = self._user_transaction_query().all()

        # Group by fiscal year
        fy_data: dict[str, dict[str, Any]] = defaultdict(
            lambda: {
                "total_income": Decimal(0),
                "salary_income": Decimal(0),
                "bonus_income": Decimal(0),
                "investment_income": Decimal(0),
                "other_income": Decimal(0),
                "total_expenses": Decimal(0),
                "tax_paid": Decimal(0),
                "investments_made": Decimal(0),
                "start_date": None,
                "end_date": None,
            },
        )

        for txn in transactions:
            # Determine fiscal year using preferences
            fy, fy_start, fy_end = self._get_fiscal_year(txn.date)

            if fy_data[fy]["start_date"] is None:
                fy_data[fy]["start_date"] = fy_start
                fy_data[fy]["end_date"] = fy_end

            amount = Decimal(str(txn.amount))

            if txn.type == TransactionType.INCOME:
                fy_data[fy]["total_income"] += amount
                # Use preference-based income categorization
                if self._is_salary_income(txn):
                    fy_data[fy]["salary_income"] += amount
                elif self._is_bonus_income(txn):
                    fy_data[fy]["bonus_income"] += amount
                elif self._is_investment_income(txn):
                    fy_data[fy]["investment_income"] += amount
                else:
                    fy_data[fy]["other_income"] += amount

            elif txn.type == TransactionType.EXPENSE:
                fy_data[fy]["total_expenses"] += amount
                # Track tax payments
                if "tax" in (txn.note or "").lower() or txn.category == "Taxes":
                    fy_data[fy]["tax_paid"] += amount

            elif txn.type == TransactionType.TRANSFER:
                # Track investments made using preferences
                if self._is_investment_account(txn.to_account):
                    fy_data[fy]["investments_made"] += amount

        # Delete existing for this user and insert new
        del_stmt = delete(FYSummary)
        if self.user_id is not None:
            del_stmt = del_stmt.where(FYSummary.user_id == self.user_id)
        self.db.execute(del_stmt)

        count = 0
        prev_income = None
        prev_expenses = None
        prev_savings = None
        now = datetime.now(UTC)

        for fy in sorted(fy_data.keys()):
            data = fy_data[fy]
            total_income = data["total_income"]
            total_expenses = data["total_expenses"]
            net_savings = total_income - total_expenses
            savings_rate = float(net_savings / total_income * 100) if total_income > 0 else 0

            # YoY changes
            yoy_income = 0.0
            yoy_expense = 0.0
            yoy_savings = 0.0
            if prev_income and prev_income > 0:
                yoy_income = float((total_income - prev_income) / prev_income * 100)
            if prev_expenses and prev_expenses > 0:
                yoy_expense = float((total_expenses - prev_expenses) / prev_expenses * 100)
            if prev_savings and prev_savings != 0:
                yoy_savings = float((net_savings - prev_savings) / abs(prev_savings) * 100)

            # Check if FY is complete
            is_complete = data["end_date"] < now if data["end_date"] else False

            summary = FYSummary(
                user_id=self.user_id,
                fiscal_year=fy,
                start_date=data["start_date"],
                end_date=data["end_date"],
                total_income=total_income,
                salary_income=data["salary_income"],
                bonus_income=data["bonus_income"],
                investment_income=data["investment_income"],
                other_income=data["other_income"],
                total_expenses=total_expenses,
                tax_paid=data["tax_paid"],
                investments_made=data["investments_made"],
                net_savings=net_savings,
                savings_rate=savings_rate,
                yoy_income_change=yoy_income,
                yoy_expense_change=yoy_expense,
                yoy_savings_change=yoy_savings,
                last_calculated=now,
                is_complete=is_complete,
            )
            self.db.add(summary)
            count += 1

            prev_income = total_income
            prev_expenses = total_expenses
            prev_savings = net_savings

        return count

    def _detect_anomalies(self) -> int:
        """Detect anomalies in the data using configurable thresholds."""
        anomalies_detected = []
        threshold_multiplier = self.anomaly_expense_threshold  # From preferences

        # 1. Detect high expense months (>threshold x std dev)
        monthly_query = (
            self.db.query(
                func.strftime("%Y-%m", Transaction.date).label("period"),
                func.sum(Transaction.amount).label("total"),
            )
            .filter(Transaction.is_deleted.is_(False))
            .filter(Transaction.type == TransactionType.EXPENSE)
        )
        if self.user_id is not None:
            monthly_query = monthly_query.filter(Transaction.user_id == self.user_id)
        monthly_expenses = monthly_query.group_by(func.strftime("%Y-%m", Transaction.date)).all()

        if len(monthly_expenses) > 3:
            expense_values = [float(m.total) for m in monthly_expenses]
            avg_expense = mean(expense_values)
            std_expense = stdev(expense_values) if len(expense_values) > 1 else 0

            for month in monthly_expenses:
                if float(month.total) > avg_expense + threshold_multiplier * std_expense:
                    anomalies_detected.append(
                        {
                            "type": AnomalyType.HIGH_EXPENSE,
                            "severity": (
                                "high" if float(month.total) > avg_expense * 2.5 else "medium"
                            ),
                            "description": (
                                f"Unusually high expenses in {month.period}: "
                                f"₹{float(month.total):,.0f} vs avg ₹{avg_expense:,.0f}"
                            ),
                            "period_key": month.period,
                            "expected_value": Decimal(str(avg_expense)),
                            "actual_value": Decimal(str(month.total)),
                            "deviation_pct": ((float(month.total) - avg_expense) / avg_expense)
                            * 100,
                        },
                    )

        # 2. Detect large individual transactions (>3x category average)
        cat_avg_query = (
            self.db.query(Transaction.category, func.avg(Transaction.amount).label("avg_amount"))
            .filter(Transaction.is_deleted.is_(False))
            .filter(Transaction.type == TransactionType.EXPENSE)
        )
        if self.user_id is not None:
            cat_avg_query = cat_avg_query.filter(Transaction.user_id == self.user_id)
        category_avgs = cat_avg_query.group_by(Transaction.category).all()
        category_avg_map = {c.category: float(c.avg_amount) for c in category_avgs}

        large_txns = (
            self._user_transaction_query().filter(Transaction.type == TransactionType.EXPENSE).all()
        )

        for txn in large_txns:
            cat_avg = category_avg_map.get(txn.category, 0)
            if cat_avg > 0 and float(txn.amount) > cat_avg * 3:
                anomalies_detected.append(
                    {
                        "type": AnomalyType.HIGH_EXPENSE,
                        "severity": "medium",
                        "description": (
                            f"Large {txn.category} expense: "
                            f"₹{float(txn.amount):,.0f} vs category avg ₹{cat_avg:,.0f}"
                        ),
                        "transaction_id": txn.transaction_id,
                        "expected_value": Decimal(str(cat_avg)),
                        "actual_value": Decimal(str(txn.amount)),
                        "deviation_pct": ((float(txn.amount) - cat_avg) / cat_avg) * 100,
                    },
                )

        # Delete old unreviewed anomalies for this user and insert new
        del_stmt = delete(Anomaly).where(Anomaly.is_reviewed.is_(False))
        if self.user_id is not None:
            del_stmt = del_stmt.where(Anomaly.user_id == self.user_id)
        self.db.execute(del_stmt)

        for anomaly_data in anomalies_detected[:50]:  # Limit to 50 anomalies
            anomaly = Anomaly(
                user_id=self.user_id,
                anomaly_type=anomaly_data["type"],
                severity=anomaly_data["severity"],
                description=anomaly_data["description"],
                transaction_id=anomaly_data.get("transaction_id"),
                period_key=anomaly_data.get("period_key"),
                expected_value=anomaly_data.get("expected_value"),
                actual_value=anomaly_data.get("actual_value"),
                deviation_pct=anomaly_data.get("deviation_pct"),
                detected_at=datetime.now(UTC),
            )
            self.db.add(anomaly)

        return len(anomalies_detected)

    def _update_budget_tracking(self) -> int:
        """Update budget tracking with current month's spending."""
        budget_query = self.db.query(Budget).filter(Budget.is_active.is_(True))
        if self.user_id is not None:
            budget_query = budget_query.filter(Budget.user_id == self.user_id)
        budgets = budget_query.all()

        if not budgets:
            return 0

        # Get current month's spending by category
        now = datetime.now(UTC)
        current_period = now.strftime("%Y-%m")

        current_spending = (
            self.db.query(Transaction.category, func.sum(Transaction.amount).label("total"))
            .filter(Transaction.is_deleted.is_(False))
            .filter(Transaction.type == TransactionType.EXPENSE)
            .filter(func.strftime("%Y-%m", Transaction.date) == current_period)
            .group_by(Transaction.category)
        )
        if self.user_id is not None:
            current_spending = current_spending.filter(Transaction.user_id == self.user_id)
        current_spending = current_spending.all()
        spending_map = {c.category: float(c.total) for c in current_spending}

        count = 0
        for budget in budgets:
            spent = Decimal(str(spending_map.get(budget.category, 0)))
            budget.current_month_spent = spent
            budget.current_month_remaining = budget.monthly_limit - spent
            budget.current_month_pct = (
                float(spent / budget.monthly_limit * 100) if budget.monthly_limit > 0 else 0
            )
            budget.updated_at = now

            # Check for budget exceeded anomaly
            if budget.current_month_pct > 100:
                anomaly = Anomaly(
                    user_id=self.user_id,
                    anomaly_type=AnomalyType.BUDGET_EXCEEDED,
                    severity="high",
                    description=(
                        f"Budget exceeded for {budget.category}: "
                        f"₹{float(spent):,.0f} / ₹{float(budget.monthly_limit):,.0f}"
                    ),
                    period_key=current_period,
                    expected_value=budget.monthly_limit,
                    actual_value=spent,
                    deviation_pct=budget.current_month_pct - 100,
                    detected_at=now,
                )
                self.db.add(anomaly)

            count += 1

        return count

    def _log_audit(
        self,
        operation: str,
        entity_type: str,
        action: str,
        entity_id: str | None = None,
        old_value: str | None = None,
        new_value: str | None = None,
        changes_summary: str | None = None,
        source_file: str | None = None,
    ) -> None:
        """Log an audit entry."""
        audit = AuditLog(
            operation=operation,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            old_value=old_value,
            new_value=new_value,
            changes_summary=changes_summary,
            source_file=source_file,
            created_at=datetime.now(UTC),
        )
        self.db.add(audit)
