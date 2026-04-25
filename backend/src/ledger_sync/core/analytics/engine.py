"""Composed AnalyticsEngine class.

Combines the base state holder with all per-domain mixins via MRO. This file
owns the public ``run_full_analytics`` orchestrator and the ``_log_audit``
helper -- domain-specific methods live in their respective mixin files.
"""

from __future__ import annotations

import json
import time
from datetime import UTC, datetime
from typing import Any

from ledger_sync.core.analytics.anomalies import AnomaliesMixin
from ledger_sync.core.analytics.base import AnalyticsEngineBase
from ledger_sync.core.analytics.classification import ClassificationMixin
from ledger_sync.core.analytics.fy_summaries import FYSummariesMixin
from ledger_sync.core.analytics.merchants import MerchantsMixin
from ledger_sync.core.analytics.net_worth import NetWorthMixin
from ledger_sync.core.analytics.recurring import RecurringMixin
from ledger_sync.core.analytics.summaries import SummariesMixin
from ledger_sync.core.analytics.trends import TrendsMixin
from ledger_sync.db.models import AuditLog, TransactionType
from ledger_sync.utils.logging import log_analytics_calculation, log_error


class AnalyticsEngine(
    ClassificationMixin,
    SummariesMixin,
    TrendsMixin,
    MerchantsMixin,
    RecurringMixin,
    NetWorthMixin,
    FYSummariesMixin,
    AnomaliesMixin,
    AnalyticsEngineBase,
):
    """Engine for calculating and persisting analytics data.

    The class body is intentionally slim: the domain methods live in mixins,
    so this file holds only the ``run_full_analytics`` orchestrator and the
    ``_log_audit`` helper.

    MRO note: every mixin inherits from ``AnalyticsEngineBase`` for typing
    purposes, but at runtime Python collapses them to a single base via MRO,
    so ``__init__`` is only called once.
    """

    def run_full_analytics(self, source_file: str | None = None) -> dict[str, Any]:
        """Run all analytics calculations after an upload.

        Args:
            source_file: Optional source file name for audit logging

        Returns:
            Summary dict with counts/snapshots per analytics stage.

        """
        self.logger.info("=" * 60)
        self.logger.info("ANALYTICS CALCULATION STARTED")
        self.logger.info("Source: %s", source_file or "manual trigger")
        self.logger.info("Timestamp: %s", datetime.now(UTC).isoformat())
        self.logger.info("=" * 60)

        results: dict[str, Any] = {}
        start_time = time.time()

        try:
            # Load ALL transactions ONCE — shared across all analytics methods.
            # This eliminates 3+ duplicate full-table scans.
            all_transactions = self._user_transaction_query().all()
            self.logger.info("Loaded %d transactions for analytics", len(all_transactions))

            # 0. Daily summaries (fastest, simple date grouping)
            t0 = time.time()
            results["daily_summaries"] = self._calculate_daily_summaries(all_transactions)
            log_analytics_calculation(
                "Daily summaries",
                results["daily_summaries"],
                (time.time() - t0) * 1000,
            )

            # 1. Monthly summaries
            t0 = time.time()
            results["monthly_summaries"] = self._calculate_monthly_summaries(all_transactions)
            log_analytics_calculation(
                "Monthly summaries",
                results["monthly_summaries"],
                (time.time() - t0) * 1000,
            )

            # 2. Category trends
            t0 = time.time()
            results["category_trends"] = self._calculate_category_trends(all_transactions)
            log_analytics_calculation(
                "Category trends",
                results["category_trends"],
                (time.time() - t0) * 1000,
            )

            # 3. Transfer flows (uses subset: transfers only)
            t0 = time.time()
            transfers = [t for t in all_transactions if t.type == TransactionType.TRANSFER]
            results["transfer_flows"] = self._calculate_transfer_flows(transfers)
            log_analytics_calculation(
                "Transfer flows",
                results["transfer_flows"],
                (time.time() - t0) * 1000,
            )

            # 4. Merchant intelligence (uses subset: expenses with notes)
            t0 = time.time()
            expenses_with_notes = [
                t for t in all_transactions if t.type == TransactionType.EXPENSE and t.note
            ]
            results["merchants"] = self._extract_merchant_intelligence(expenses_with_notes)
            log_analytics_calculation(
                "Merchants",
                results["merchants"],
                (time.time() - t0) * 1000,
            )

            # 5. Recurring transactions
            t0 = time.time()
            income_expense = [
                t
                for t in all_transactions
                if t.type in (TransactionType.INCOME, TransactionType.EXPENSE)
            ]
            results["recurring"] = self._detect_recurring_transactions(income_expense)
            log_analytics_calculation(
                "Recurring patterns",
                results["recurring"],
                (time.time() - t0) * 1000,
            )

            # 6. Net worth snapshot (needs all transactions)
            t0 = time.time()
            results["net_worth"] = self._calculate_net_worth_snapshot(all_transactions)
            log_analytics_calculation(
                "Net worth snapshot",
                1 if results["net_worth"] else 0,
                (time.time() - t0) * 1000,
            )

            # 6b. Auto-populate investment holdings from transfer flows
            t0 = time.time()
            results["investment_holdings"] = self._populate_investment_holdings(all_transactions)
            log_analytics_calculation(
                "Investment holdings",
                results["investment_holdings"],
                (time.time() - t0) * 1000,
            )

            # 7. Fiscal year summaries
            t0 = time.time()
            results["fy_summaries"] = self._calculate_fy_summaries(all_transactions)
            log_analytics_calculation(
                "FY summaries",
                results["fy_summaries"],
                (time.time() - t0) * 1000,
            )

            # 8. Anomalies
            t0 = time.time()
            results["anomalies"] = self._detect_anomalies()
            log_analytics_calculation(
                "Anomalies detected",
                results["anomalies"],
                (time.time() - t0) * 1000,
            )

            # 9. Budget tracking
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
        """Append an AuditLog row (flushed with the main commit).

        Scoped to ``self.user_id`` so the audit trail can distinguish runs
        per user (previously all rows landed with ``user_id=NULL``).
        """
        audit = AuditLog(
            user_id=self.user_id,
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
