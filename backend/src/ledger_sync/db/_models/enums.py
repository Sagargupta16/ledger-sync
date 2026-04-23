"""Enumeration types stored as string values in the database.

NOTE: Enum string values here are stored directly in the database.
Renaming any value requires a data migration. The mixed casing
(PascalCase for TransactionType, snake_case for AnomalyType, etc.)
is intentional legacy and must be preserved for backwards compatibility.
"""

from enum import StrEnum as PyEnum


class TransactionType(PyEnum):
    """Transaction type enumeration."""

    EXPENSE = "Expense"
    INCOME = "Income"
    TRANSFER = "Transfer"


class AnomalyType(PyEnum):
    """Anomaly type enumeration."""

    HIGH_EXPENSE = "high_expense"
    UNUSUAL_CATEGORY = "unusual_category"
    LARGE_TRANSFER = "large_transfer"
    DUPLICATE_SUSPECTED = "duplicate_suspected"
    MISSING_RECURRING = "missing_recurring"
    BUDGET_EXCEEDED = "budget_exceeded"


class RecurrenceFrequency(PyEnum):
    """Recurring transaction frequency."""

    DAILY = "daily"
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"
    BIMONTHLY = "bimonthly"
    QUARTERLY = "quarterly"
    SEMIANNUAL = "semiannual"
    YEARLY = "yearly"


class GoalStatus(PyEnum):
    """Goal status enumeration."""

    ACTIVE = "active"
    COMPLETED = "completed"
    PAUSED = "paused"
    CANCELLED = "cancelled"


class AccountType(PyEnum):
    """Account type enumeration."""

    CASH = "Cash"
    BANK_ACCOUNTS = "Bank Accounts"
    CREDIT_CARDS = "Credit Cards"
    INVESTMENTS = "Investments"
    LOANS = "Loans/Lended"
    OTHER_WALLETS = "Other Wallets"
