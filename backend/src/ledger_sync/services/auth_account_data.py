"""Account deletion and reset for ``AuthService``.

Removes a user's data across every user-scoped table in FK-safe order, either
permanently (account deletion) or while keeping the OAuth account (reset).
"""

import logging

from sqlalchemy.orm import Session

from ledger_sync.core.analytics.refresh import (
    lock_analytics_user,
    mark_ledger_changed,
    mark_preferences_changed,
)
from ledger_sync.db.models import (
    AnalyticsState,
    Anomaly,
    Budget,
    CategoryTrend,
    CohortSpending,
    DailySummary,
    FinancialGoal,
    FYSummary,
    ImportLog,
    LedgerAccount,
    LedgerAccountAlias,
    LedgerCategory,
    LedgerSubcategory,
    MerchantIntelligence,
    MonthlySummary,
    NetWorthSnapshot,
    RecurringTransaction,
    RsuGrantRecord,
    RsuVestingRecord,
    SalaryPlan,
    ScheduledTransaction,
    TaxRecord,
    Transaction,
    TransferFlow,
    User,
    UserAISettings,
    UserPreferences,
)

logger = logging.getLogger("ledger_sync.auth")


class AccountDataMixin:
    """Mixin: delete or reset every user-scoped table for one account."""

    session: Session

    def _delete_all_user_data(self, user_id: int) -> None:
        """Delete all user-scoped data across every table.

        Deletes in FK-safe order: transaction-derived data first (anomalies
        reference transactions), then the remaining preference/goal tables
        which have no FK to transactions.
        """
        self._delete_transaction_data(user_id)

        # Budgets & goals
        self.session.query(Budget).filter(Budget.user_id == user_id).delete()
        self.session.query(FinancialGoal).filter(FinancialGoal.user_id == user_id).delete()

        # Account configuration now shares the stable ledger account identity.
        self.session.query(LedgerAccountAlias).filter(
            LedgerAccountAlias.user_id == user_id
        ).delete()
        self.session.query(LedgerAccount).filter(LedgerAccount.user_id == user_id).delete()

        # Independent configuration domains are preserved by a ledger-only reset.
        self.session.query(RsuVestingRecord).filter(RsuVestingRecord.user_id == user_id).delete()
        self.session.query(RsuGrantRecord).filter(RsuGrantRecord.user_id == user_id).delete()
        self.session.query(SalaryPlan).filter(SalaryPlan.user_id == user_id).delete()
        self.session.query(UserAISettings).filter(UserAISettings.user_id == user_id).delete()

        # User preferences
        self.session.query(UserPreferences).filter(UserPreferences.user_id == user_id).delete()

    def delete_account(self, user: User) -> None:
        """Permanently delete a user account and all associated data.

        This action is irreversible. The user must already be authenticated.
        """
        user_id = user.id
        lock_analytics_user(self.session, user_id)
        self.session.query(AnalyticsState).filter(AnalyticsState.user_id == user_id).delete()
        self._delete_all_user_data(user_id)
        self.session.delete(user)
        self.session.commit()
        logger.info("Account deleted: user_id=%s", user_id)

    def _delete_transaction_data(self, user_id: int) -> None:
        """Delete transaction-derived data, preserving user preferences and goals.

        Removes transactions, import logs, analytics, and detected patterns
        while keeping budgets, goals, account classifications, and preferences.
        """
        # Tables with FK to transactions -- must be deleted first
        self.session.query(Anomaly).filter(Anomaly.user_id == user_id).delete()

        # Transaction-derived data
        self.session.query(Transaction).filter(Transaction.user_id == user_id).delete()
        self.session.query(ImportLog).filter(ImportLog.user_id == user_id).delete()
        self.session.query(ScheduledTransaction).filter(
            ScheduledTransaction.user_id == user_id
        ).delete()
        self.session.query(RecurringTransaction).filter(
            RecurringTransaction.user_id == user_id
        ).delete()

        # Category dimensions belong to the imported ledger. Account identities
        # and aliases also own user settings, so a ledger-only reset keeps them.
        self.session.query(LedgerSubcategory).filter(LedgerSubcategory.user_id == user_id).delete()
        self.session.query(LedgerCategory).filter(LedgerCategory.user_id == user_id).delete()

        # Analytics / aggregation tables
        self.session.query(DailySummary).filter(DailySummary.user_id == user_id).delete()
        self.session.query(CohortSpending).filter(CohortSpending.user_id == user_id).delete()
        self.session.query(MonthlySummary).filter(MonthlySummary.user_id == user_id).delete()
        self.session.query(CategoryTrend).filter(CategoryTrend.user_id == user_id).delete()
        self.session.query(TransferFlow).filter(TransferFlow.user_id == user_id).delete()
        self.session.query(NetWorthSnapshot).filter(NetWorthSnapshot.user_id == user_id).delete()
        self.session.query(MerchantIntelligence).filter(
            MerchantIntelligence.user_id == user_id
        ).delete()
        self.session.query(FYSummary).filter(FYSummary.user_id == user_id).delete()
        self.session.query(TaxRecord).filter(TaxRecord.user_id == user_id).delete()

    def reset_account(self, user: User, *, transactions_only: bool = False) -> None:
        """Reset account data, keeping the OAuth account.

        Args:
            user: The authenticated user.
            transactions_only: If True, only delete transaction-derived data
                (transactions, import logs, analytics). Preserves preferences,
                budgets, goals, and account classifications.
        """
        user_id = user.id
        lock_analytics_user(self.session, user_id)
        mark_ledger_changed(self.session, user_id)
        if not transactions_only:
            mark_preferences_changed(self.session, user_id)

        if transactions_only:
            self._delete_transaction_data(user_id)
        else:
            self._delete_all_user_data(user_id)
            # Create fresh default preferences
            preferences = UserPreferences(user_id=user_id)
            self.session.add(preferences)
            self.session.add(UserAISettings(user_id=user_id))

        # Bump token_version on any reset -- the user's data was materially
        # changed, so any outstanding session should be forced through refresh
        # (and refresh will fail, forcing re-login) rather than serving stale
        # cached responses from before the reset.
        user.token_version += 1

        self.session.commit()
        mode = "transactions" if transactions_only else "full"
        logger.info("Account reset (%s): user_id=%s", mode, user_id)
