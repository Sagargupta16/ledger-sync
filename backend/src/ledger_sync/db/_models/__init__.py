"""Internal model package.

Models are split into domain modules for maintainability.
The public import path remains ``ledger_sync.db.models`` — see ``db/models.py``
for the facade.

IMPORTANT: every model module must be imported here so SQLAlchemy's
``Base.metadata`` registers all tables before Alembic or ``init_db`` run.
"""

from ledger_sync.db._models._constants import CASCADE_ALL_DELETE_ORPHAN, USER_FK
from ledger_sync.db._models.analytics import (
    CategoryTrend,
    DailySummary,
    FYSummary,
    MerchantIntelligence,
    MonthlySummary,
    TransferFlow,
)
from ledger_sync.db._models.enums import (
    AccountType,
    AnomalyType,
    GoalStatus,
    RecurrenceFrequency,
    TransactionType,
)
from ledger_sync.db._models.investments import (
    InvestmentHolding,
    NetWorthSnapshot,
    TaxRecord,
)
from ledger_sync.db._models.planning import (
    Anomaly,
    Budget,
    FinancialGoal,
    RecurringTransaction,
    ScheduledTransaction,
)
from ledger_sync.db._models.transactions import (
    AccountClassification,
    ColumnMappingLog,
    ImportLog,
    Transaction,
)
from ledger_sync.db._models.user import AuditLog, User, UserPreferences

__all__ = [
    "CASCADE_ALL_DELETE_ORPHAN",
    "USER_FK",
    "AccountClassification",
    "AccountType",
    "Anomaly",
    "AnomalyType",
    "AuditLog",
    "Budget",
    "CategoryTrend",
    "ColumnMappingLog",
    "DailySummary",
    "FYSummary",
    "FinancialGoal",
    "GoalStatus",
    "ImportLog",
    "InvestmentHolding",
    "MerchantIntelligence",
    "MonthlySummary",
    "NetWorthSnapshot",
    "RecurrenceFrequency",
    "RecurringTransaction",
    "ScheduledTransaction",
    "TaxRecord",
    "Transaction",
    "TransactionType",
    "TransferFlow",
    "User",
    "UserPreferences",
]
