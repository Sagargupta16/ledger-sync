"""Insight generation engine - creates written, data-derived insights."""

from typing import Any

from ledger_sync.core import calculator
from ledger_sync.db.models import Transaction, TransactionType

# Heuristic thresholds used across insight generation. Named here rather
# than inlined so their meaning is discoverable and a future tweak is a
# one-line change. Values are informed guesses, not policy -- a rewrite
# to user-tunable preferences is tracked as INS-1b.
CONSISTENCY_HIGH_VOLATILITY = 40  # score < this -> "high volatility" insight
CONSISTENCY_STEADY = 80  # score > this -> "consistent pattern" insight
CATEGORY_CONCENTRATION_ALERT_PCT = 40  # top category share > this -> flag
CONVENIENCE_SPENDING_ALERT_PCT = 30  # discretionary share > this -> flag
SPENDING_TREND_UP_RATIO = 1.2  # recent_avg / overall_avg > this -> trending up
SPENDING_TREND_DOWN_RATIO = 0.8  # recent_avg / overall_avg < this -> trending down
LIFESTYLE_INFLATION_ALERT_PCT = 20  # spending up > this% -> lifestyle inflation
LIFESTYLE_DEFLATION_POSITIVE_PCT = -10  # spending down < this% -> positive signal
SPENDING_VELOCITY_UP_RATIO = 1.3  # recent/historical > this -> accelerating
SPENDING_VELOCITY_DOWN_RATIO = 0.7  # recent/historical < this -> slowing
RECENT_MONTHS_WINDOW = 3  # "recent" = last N months for trend compare
DAYS_PER_MONTH_AVG = 30.44  # 365.25 / 12, for daily->monthly projection


class InsightEngine:
    """Generate written insights from transaction data."""

    @staticmethod
    def generate_all_insights(transactions: list[Transaction]) -> list[dict[str, str]]:
        """Generate all available insights.

        Args:
            transactions: List of transactions

        Returns:
            List of insight dictionaries with title, description, severity

        """
        insights: list[dict[str, str]] = []

        # Spending insights
        insights.extend(InsightEngine._spending_insights(transactions))

        # Category insights
        insights.extend(InsightEngine._category_insights(transactions))

        # Temporal insights
        insights.extend(InsightEngine._temporal_insights(transactions))

        # Behavioral insights
        insights.extend(InsightEngine._behavioral_insights(transactions))

        return insights

    @staticmethod
    def _spending_insights(transactions: list[Transaction]) -> list[dict[str, str]]:
        """Generate spending-related insights."""
        insights: list[dict[str, str]] = []
        expenses = [t for t in transactions if t.type == TransactionType.EXPENSE]

        if not expenses:
            return insights

        # High spending volatility
        monthly_data = calculator.group_by_month(expenses)
        monthly_expenses = [data["expenses"] for data in monthly_data.values()]
        consistency = calculator.calculate_consistency_score(monthly_expenses)

        if consistency < CONSISTENCY_HIGH_VOLATILITY:
            insights.append(
                {
                    "title": "High Spending Volatility",
                    "description": (
                        f"Your monthly spending varies significantly. "
                        f"Consistency score: {consistency:.0f}/100. "
                        f"Consider reviewing irregular large expenses."
                    ),
                    "severity": "info",
                },
            )
        elif consistency > CONSISTENCY_STEADY:
            insights.append(
                {
                    "title": "Consistent Spending Pattern",
                    "description": (
                        f"Your spending is very predictable. "
                        f"Consistency score: {consistency:.0f}/100. "
                        f"This indicates good budget control."
                    ),
                    "severity": "positive",
                },
            )

        # Daily spending rate
        daily_rate = calculator.calculate_daily_spending_rate(expenses)
        monthly_rate = daily_rate * DAYS_PER_MONTH_AVG

        insights.append(
            {
                "title": "Average Daily Spending",
                "description": (
                    f"You spend ₹{daily_rate:,.0f} per day on average, "
                    f"totaling approximately ₹{monthly_rate:,.0f} monthly."
                ),
                "severity": "neutral",
            },
        )

        return insights

    @staticmethod
    def _category_insights(transactions: list[Transaction]) -> list[dict[str, str]]:
        """Generate category-related insights."""
        insights: list[dict[str, str]] = []
        expenses = [t for t in transactions if t.type == TransactionType.EXPENSE]

        if not expenses:
            return insights

        category_totals = calculator.group_by_category(expenses)
        concentration = calculator.calculate_category_concentration(category_totals)

        if concentration > CATEGORY_CONCENTRATION_ALERT_PCT:
            top_category = max(category_totals.items(), key=lambda x: x[1])
            insights.append(
                {
                    "title": "High Category Concentration",
                    "description": (
                        f"Your top category '{top_category[0]}' accounts for "
                        f"{concentration:.1f}% of total expenses "
                        f"(₹{top_category[1]:,.0f})."
                    ),
                    "severity": "info",
                },
            )

        # Convenience spending
        convenience_data = calculator.calculate_convenience_spending(expenses)
        if convenience_data["convenience_pct"] > CONVENIENCE_SPENDING_ALERT_PCT:
            insights.append(
                {
                    "title": "Significant Convenience Spending",
                    "description": (
                        f"You spent {convenience_data['convenience_pct']:.1f}% "
                        f"(₹{convenience_data['convenience_amount']:,.0f}) on "
                        f"discretionary categories like shopping, dining, and entertainment."
                    ),
                    "severity": "info",
                },
            )

        return insights

    @staticmethod
    def _temporal_insights(transactions: list[Transaction]) -> list[dict[str, str]]:
        """Generate time-based insights."""
        insights: list[dict[str, str]] = []

        if not transactions:
            return insights

        # Monthly trends
        monthly_data = calculator.group_by_month(transactions)
        if len(monthly_data) >= RECENT_MONTHS_WINDOW:
            sorted_months = sorted(monthly_data.items())

            # Recent N months avg vs overall avg
            recent = sorted_months[-RECENT_MONTHS_WINDOW:]
            recent_avg = sum(m[1]["expenses"] for m in recent) / RECENT_MONTHS_WINDOW
            overall_avg = sum(m[1]["expenses"] for m in sorted_months) / len(sorted_months)

            if recent_avg > overall_avg * SPENDING_TREND_UP_RATIO:
                insights.append(
                    {
                        "title": "Spending Trending Upward",
                        "description": (
                            f"Your last 3 months average (₹{recent_avg:,.0f}) is "
                            f"{((recent_avg / overall_avg - 1) * 100):.1f}% higher "
                            f"than your overall average."
                        ),
                        "severity": "warning",
                    },
                )
            elif recent_avg < overall_avg * SPENDING_TREND_DOWN_RATIO:
                insights.append(
                    {
                        "title": "Spending Trending Downward",
                        "description": (
                            f"Your last 3 months average (₹{recent_avg:,.0f}) is "
                            f"{((1 - recent_avg / overall_avg) * 100):.1f}% lower "
                            f"than your overall average."
                        ),
                        "severity": "positive",
                    },
                )

        # Best/worst months
        best_worst = calculator.find_best_worst_months(monthly_data)
        if best_worst["best_month"]:
            insights.append(
                {
                    "title": "Best Financial Month",
                    "description": (
                        f"Your best month was {best_worst['best_month']['month']} "
                        f"with a surplus of ₹{best_worst['best_month']['surplus']:,.0f}."
                    ),
                    "severity": "positive",
                },
            )

        return insights

    @staticmethod
    def _behavioral_insights(transactions: list[Transaction]) -> list[dict[str, str]]:
        """Generate behavioral pattern insights."""
        insights: list[dict[str, str]] = []
        expenses = [t for t in transactions if t.type == TransactionType.EXPENSE]

        if not expenses:
            return insights

        # Lifestyle inflation
        inflation = calculator.calculate_lifestyle_inflation(expenses)
        if inflation > LIFESTYLE_INFLATION_ALERT_PCT:
            insights.append(
                {
                    "title": "Lifestyle Inflation Detected",
                    "description": (
                        f"Your average spending has increased by {inflation:.1f}% "
                        f"compared to your early months. This is normal with income "
                        f"growth, but worth monitoring."
                    ),
                    "severity": "info",
                },
            )
        elif inflation < LIFESTYLE_DEFLATION_POSITIVE_PCT:
            insights.append(
                {
                    "title": "Spending Reduction",
                    "description": (
                        f"Your average spending has decreased by {abs(inflation):.1f}% "
                        f"compared to your early months. Great job on cutting expenses!"
                    ),
                    "severity": "positive",
                },
            )

        # Spending velocity
        velocity_data = calculator.calculate_spending_velocity(expenses)
        if velocity_data["velocity_ratio"] > SPENDING_VELOCITY_UP_RATIO:
            insights.append(
                {
                    "title": "Accelerated Recent Spending",
                    "description": (
                        f"Your recent daily spending (₹{velocity_data['recent_daily']:,.0f}) "
                        f"is {((velocity_data['velocity_ratio'] - 1) * 100):.1f}% higher "
                        f"than your historical average."
                    ),
                    "severity": "warning",
                },
            )
        elif velocity_data["velocity_ratio"] < SPENDING_VELOCITY_DOWN_RATIO:
            insights.append(
                {
                    "title": "Reduced Recent Spending",
                    "description": (
                        f"Your recent daily spending (₹{velocity_data['recent_daily']:,.0f}) "
                        f"is {((1 - velocity_data['velocity_ratio']) * 100):.1f}% lower "
                        f"than your historical average."
                    ),
                    "severity": "positive",
                },
            )

        return insights

    @staticmethod
    def generate_monthly_summary(transactions: list[Transaction], month: str) -> dict[str, Any]:
        """Generate summary insights for a specific month.

        Args:
            transactions: Filtered transactions for the month
            month: Month string (YYYY-MM)

        Returns:
            Dictionary with summary metrics and insights

        """
        totals = calculator.calculate_totals(transactions)
        expenses = [t for t in transactions if t.type == TransactionType.EXPENSE]

        category_totals = calculator.group_by_category(expenses)
        top_categories = sorted(category_totals.items(), key=lambda x: x[1], reverse=True)[:5]

        return {
            "month": month,
            "total_income": totals["total_income"],
            "total_expenses": totals["total_expenses"],
            "surplus": totals["net_change"],
            "transaction_count": len(transactions),
            "expense_count": len(expenses),
            "top_categories": [{"category": cat, "amount": amt} for cat, amt in top_categories],
            "savings_rate": calculator.calculate_savings_rate(
                totals["total_income"],
                totals["total_expenses"],
            ),
        }
