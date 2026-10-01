"""Composed AnalyticsEngine class.

Combines the base state holder with all per-domain mixins via MRO. This file
owns the public ``run_full_analytics`` orchestrator and the ``_log_audit``
helper -- domain-specific methods live in their respective mixin files.
"""

from __future__ import annotations

import json
import time
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import delete

from ledger_sync.core.analytics.anomalies import AnomaliesMixin
from ledger_sync.core.analytics.base import AnalyticsEngineBase
from ledger_sync.core.analytics.classification import ClassificationMixin
from ledger_sync.core.analytics.cohort import CohortMixin
from ledger_sync.core.analytics.fy_summaries import FYSummariesMixin
from ledger_sync.core.analytics.merchants import MerchantsMixin
from ledger_sync.core.analytics.net_worth import NetWorthMixin
from ledger_sync.core.analytics.recurring import RecurringMixin
from ledger_sync.core.analytics.refresh import (
    AnalyticsVersion,
    StaleAnalyticsRefreshError,
    analytics_inputs_current,
    analytics_is_current,
    prepare_refresh,
    publish_refresh,
)
from ledger_sync.core.analytics.summaries import SummariesMixin
from ledger_sync.core.analytics.trends import TrendsMixin
from ledger_sync.core.ledger_clock import ledger_today
from ledger_sync.db.models import AnalyticsState, AuditLog, TransactionType
from ledger_sync.utils.logging import log_analytics_calculation, log_error

#: ``audit_logs.operation`` of the per-run record ``_run_analytics`` writes.
_ANALYTICS_AUDIT_OPERATION = "analytics"
#: Run records older than this are pruned on the next run for the same user.
ANALYTICS_AUDIT_RETENTION_DAYS = 30


def _affected_dates(state: AnalyticsState, *, force_full: bool) -> set[str] | None:
    """Dirty IST days to rebuild; ``None`` means rebuild everything.

    An empty set is a clock-only refresh: inputs are current, so static day and
    month rollups stay untouched. A changed generation without dirty scope must
    rebuild them in full.
    """
    if force_full or state.full_rebuild_required:
        return None
    dirty: set[str] = set(json.loads(state.dirty_dates))
    if not dirty and not analytics_inputs_current(state):
        return None
    return dirty


def _refresh_modes(affected_dates: set[str] | None) -> tuple[str, dict[str, str]]:
    """Describe the refresh for the audit log: overall mode plus per-domain modes."""
    if affected_dates is None:
        refresh_mode, scoped_mode = "full", "full"
    elif affected_dates:
        refresh_mode, scoped_mode = "selective_summaries", "selective"
    else:
        refresh_mode, scoped_mode = "clock_refresh", "skipped"
    return refresh_mode, {
        "daily_summaries": scoped_mode,
        "monthly_summaries": scoped_mode,
        "category_trends": scoped_mode,
        "cohort_spending": "skipped" if scoped_mode == "skipped" else "full",
        "other_domains": "full",
    }


class AnalyticsEngine(
    ClassificationMixin,
    SummariesMixin,
    TrendsMixin,
    MerchantsMixin,
    RecurringMixin,
    NetWorthMixin,
    FYSummariesMixin,
    AnomaliesMixin,
    CohortMixin,
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
        """Force every analytics domain to rebuild, including recovery/repair."""
        return self._run_analytics(source_file, force_full=True)

    def refresh_analytics(self, source_file: str | None = None) -> dict[str, Any]:
        """Refresh invalidated inputs; selectively recompute day/month-scoped rollups.

        Daily summaries, monthly summaries and category trends rebuild only the
        dirty days/months. Other domains still rebuild in full after any
        invalidation (cohorts are skipped on a clock-only refresh). A current
        generation skips all work. Callers must mark every relevant mutation in
        its write transaction; legacy/unversioned data gets a full first build.
        """
        return self._run_analytics(source_file, force_full=False)

    def _run_analytics(self, source_file: str | None, *, force_full: bool) -> dict[str, Any]:
        self.logger.info("=" * 60)
        self.logger.info("ANALYTICS CALCULATION STARTED")
        self.logger.info("Source: %s", source_file or "manual trigger")
        self.logger.info("Timestamp: %s", datetime.now(UTC).isoformat())
        self.logger.info("=" * 60)

        results: dict[str, Any] = {}
        start_time = time.time()

        try:
            state = prepare_refresh(self.db, self._require_user_id())
            version = AnalyticsVersion.from_state(state)
            calculation_day = ledger_today()
            if not force_full and analytics_is_current(state):
                self.db.commit()
                return {"refresh_mode": "skipped", "status": "current"}

            affected_dates = _affected_dates(state, force_full=force_full)
            affected_months = (
                {day[:7] for day in affected_dates} if affected_dates is not None else None
            )
            results["refresh_mode"], results["domain_modes"] = _refresh_modes(affected_dates)
            # Constructor state may predate a waiting User lock. Reload before
            # taking the shared transaction snapshot, including ORM identity maps.
            self._load_preferences()
            # Load ALL transactions ONCE — shared across all analytics methods.
            # This eliminates 3+ duplicate full-table scans.
            all_transactions = self._user_transaction_query().all()
            self.logger.info("Loaded %d transactions for analytics", len(all_transactions))

            # 0. Daily summaries (fastest, simple date grouping)
            t0 = time.time()
            results["daily_summaries"] = self._calculate_daily_summaries(
                all_transactions, affected_dates
            )
            log_analytics_calculation(
                "Daily summaries",
                results["daily_summaries"],
                (time.time() - t0) * 1000,
            )

            # 1. Monthly summaries
            t0 = time.time()
            results["monthly_summaries"] = self._calculate_monthly_summaries(
                all_transactions, affected_months
            )
            log_analytics_calculation(
                "Monthly summaries",
                results["monthly_summaries"],
                (time.time() - t0) * 1000,
            )

            # 2. Category trends
            t0 = time.time()
            results["category_trends"] = self._calculate_category_trends(
                all_transactions, affected_months
            )
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

            # 10. Cohort spending (day-of-week / day-of-month / month-of-year).
            # Always rebuilt from full history when inputs changed: every
            # bucket's divisor spans the whole ledger's date range. A clock-only
            # refresh has no ledger change, so the stored rows are current.
            t0 = time.time()
            results["cohort_spending"] = (
                0 if affected_dates == set() else self._calculate_cohort_spending(all_transactions)
            )
            log_analytics_calculation(
                "Cohort spending",
                results["cohort_spending"],
                (time.time() - t0) * 1000,
            )

            # Log the analytics run, dropping this user's run records past the
            # retention window in the same transaction so the table stays bounded.
            self._prune_analytics_audit()
            self._log_audit(
                operation=_ANALYTICS_AUDIT_OPERATION,
                entity_type="system",
                action="calculate",
                changes_summary=json.dumps(results),
                source_file=source_file,
            )

            if ledger_today() != calculation_day:
                raise StaleAnalyticsRefreshError("IST day changed while refreshing; retry refresh")
            publish_refresh(self.db, self._require_user_id(), version)
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

    def _prune_analytics_audit(self) -> None:
        """Delete this user's ``analytics`` run records older than the retention window.

        Every non-skipped refresh appends one row and nothing reads them back, so
        without pruning the table grows by one row per upload, edit and manual
        refresh forever. Same shape as the refresh-token pruning in
        ``services/auth_refresh.py``: user-scoped, operation-scoped, age-based,
        and flushed with the run's own commit (or rolled back with it).
        ``created_at`` is compared as naive UTC, the column's storage form. No
        in-session synchronisation: nothing holds these old rows, and evaluating
        the age test against a pending row carrying an aware timestamp would
        compare aware with naive.
        """
        cutoff = datetime.now(UTC).replace(tzinfo=None) - timedelta(
            days=ANALYTICS_AUDIT_RETENTION_DAYS
        )
        self.db.execute(
            delete(AuditLog)
            .where(
                AuditLog.user_id == self._require_user_id(),
                AuditLog.operation == _ANALYTICS_AUDIT_OPERATION,
                AuditLog.created_at < cutoff,
            )
            .execution_options(synchronize_session=False)
        )

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
