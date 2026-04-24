"""SQLAlchemy ORM models — facade re-exporting from the ``_models`` package.

Models are split by domain under ``ledger_sync.db._models``:

- ``_models.user`` — User, UserPreferences, AuditLog
- ``_models.transactions`` — Transaction, ImportLog, AccountClassification, ColumnMappingLog
- ``_models.investments`` — TaxRecord, NetWorthSnapshot, InvestmentHolding
- ``_models.analytics`` — DailySummary, MonthlySummary, CategoryTrend, TransferFlow,
  MerchantIntelligence, FYSummary
- ``_models.planning`` — RecurringTransaction, ScheduledTransaction, Anomaly, Budget,
  FinancialGoal
- ``_models.enums`` — TransactionType, AnomalyType, RecurrenceFrequency, GoalStatus,
  AccountType

This module preserves the public import path ``from ledger_sync.db.models import X``
used throughout the codebase. Importing this module ensures every ORM class is
registered against ``Base.metadata`` before Alembic/``init_db`` runs.
"""

from ledger_sync.db._models import *  # noqa: F401, F403
from ledger_sync.db._models import __all__  # noqa: F401
