"""Internal model package.

Models are split into domain modules for maintainability.
The public import path remains ``ledger_sync.db.models`` — see ``db/models.py``
for the facade.

IMPORTANT: every model module must be imported here so SQLAlchemy's
``Base.metadata`` registers all tables before Alembic or ``init_db`` run.
"""

from ledger_sync.db._models._constants import CASCADE_ALL_DELETE_ORPHAN, USER_FK
from ledger_sync.db._models.ai_settings import UserAISettings
from ledger_sync.db._models.ai_usage import AIUsageLog
from ledger_sync.db._models.analytics import (
    CategoryTrend,
    CohortSpending,
    DailySummary,
    FYSummary,
    MerchantIntelligence,
    MonthlySummary,
    TransferFlow,
)
from ledger_sync.db._models.analytics_state import AnalyticsState
from ledger_sync.db._models.balance_checks import BalanceCheck
from ledger_sync.db._models.bank_alerts import BankAlert
from ledger_sync.db._models.category_overrides import CategoryOverride
from ledger_sync.db._models.compensation import RsuGrantRecord, RsuVestingRecord, SalaryPlan
from ledger_sync.db._models.enums import (
    AccountType,
    AnomalyType,
    GoalStatus,
    RecurrenceFrequency,
    TransactionType,
)
from ledger_sync.db._models.external_refs import ExternalRef
from ledger_sync.db._models.investments import (
    InvestmentHolding,
    NetWorthSnapshot,
    TaxRecord,
)
from ledger_sync.db._models.ledger_dimensions import (
    LEDGER_ACCOUNTS,
    LedgerAccount,
    LedgerAccountAlias,
    LedgerCategory,
    LedgerSubcategory,
)
from ledger_sync.db._models.mf_holdings import MfHolding, MfNavPrice, MfTransaction
from ledger_sync.db._models.organization import (
    CategorizationRule,
    SavedFilterView,
    TransactionTag,
)
from ledger_sync.db._models.planning import (
    Anomaly,
    Budget,
    FinancialGoal,
    RecurringTransaction,
    ScheduledTransaction,
)
from ledger_sync.db._models.push_subscriptions import PushSubscription
from ledger_sync.db._models.rsu_tax import ForeignAssetEvent, RsuVestFx
from ledger_sync.db._models.saved_view_pins import SavedViewPin
from ledger_sync.db._models.tax_ais import TaxAisSummary
from ledger_sync.db._models.tax_deductions import TaxDeduction
from ledger_sync.db._models.transaction_embeddings import TransactionEmbedding
from ledger_sync.db._models.transactions import (
    TRANSACTIONS,
    ColumnMappingLog,
    ImportLog,
    Transaction,
)
from ledger_sync.db._models.upload_tokens import UploadToken
from ledger_sync.db._models.user import AuditLog, User, UserPreferences

__all__ = [
    "CASCADE_ALL_DELETE_ORPHAN",
    "LEDGER_ACCOUNTS",
    "TRANSACTIONS",
    "USER_FK",
    "AIUsageLog",
    "AccountType",
    "AnalyticsState",
    "Anomaly",
    "AnomalyType",
    "AuditLog",
    "BalanceCheck",
    "BankAlert",
    "Budget",
    "CategorizationRule",
    "CategoryOverride",
    "CategoryTrend",
    "CohortSpending",
    "ColumnMappingLog",
    "DailySummary",
    "ExternalRef",
    "FYSummary",
    "FinancialGoal",
    "ForeignAssetEvent",
    "GoalStatus",
    "ImportLog",
    "InvestmentHolding",
    "LedgerAccount",
    "LedgerAccountAlias",
    "LedgerCategory",
    "LedgerSubcategory",
    "MerchantIntelligence",
    "MfHolding",
    "MfNavPrice",
    "MfTransaction",
    "MonthlySummary",
    "NetWorthSnapshot",
    "PushSubscription",
    "RecurrenceFrequency",
    "RecurringTransaction",
    "RsuGrantRecord",
    "RsuVestFx",
    "RsuVestingRecord",
    "SalaryPlan",
    "SavedFilterView",
    "SavedViewPin",
    "ScheduledTransaction",
    "TaxAisSummary",
    "TaxDeduction",
    "TaxRecord",
    "Transaction",
    "TransactionEmbedding",
    "TransactionTag",
    "TransactionType",
    "TransferFlow",
    "UploadToken",
    "User",
    "UserAISettings",
    "UserPreferences",
]
