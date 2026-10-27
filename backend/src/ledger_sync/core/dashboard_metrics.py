"""Dashboard metrics served as a few numbers instead of the whole ledger.

The Dashboard used to download ``/api/transactions/all`` (about 3.4 MB of JSON
at 9,000 rows) on every visit so the browser could compute Age of Money, Days
of Buffering, the investment-transfer split and the FinancialHealthScore inputs.
These reads compute the same figures here, from the same rows in the same order:

* ``dashboard_pulse``: the selected window (``/api/dashboard-metrics/pulse``).
* ``dashboard_health``: current health, which no window changes
  (``/api/dashboard-metrics/health``).

The ports live in ``dashboard_metrics_pulse``, ``dashboard_metrics_inputs``,
``dashboard_metrics_health`` and ``dashboard_metrics_analysis``, on the
arithmetic rules in ``dashboard_metrics_base``. Every read is scoped to the one
user.

No row cap, unlike ``/api/transactions/all``: its 25,000-row limit bounds the
response body, and these answer a few hundred bytes at any size. Cost grows
with the rows instead. A live ledger is one upload snapshot, at most
``MAX_UPLOAD_ROWS`` (100,000) rows, plus any rows added by hand since; at that
size, in-process on SQLite, an all-time pulse took about 1.0 s and 58 MB peak
and the health read 1.3 s and 75 MB (75 ms and 110 ms at 9,000 rows).
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Any

from sqlalchemy.orm import InstrumentedAttribute, Session

from ledger_sync.core.dashboard_metrics_base import FlowRow, LedgerRow
from ledger_sync.core.dashboard_metrics_health import HealthRules, current_health
from ledger_sync.core.dashboard_metrics_inputs import balance_position
from ledger_sync.core.dashboard_metrics_pulse import (
    age_of_money,
    days_of_buffering,
    investment_transfers,
    net_liquid,
)
from ledger_sync.core.metric_rules import essential_keywords, investment_account_names
from ledger_sync.core.preference_json import parse_json_preference
from ledger_sync.core.query_helpers import (
    build_transaction_query,
    capital_loss_keys_for,
    investment_accounts_for,
)
from ledger_sync.db.models import Transaction, User
from ledger_sync.services.account_settings import get_classification_map
from ledger_sync.services.calculation_service import account_balances

_Columns = tuple[InstrumentedAttribute[Any], ...]
# The pulse reads no label and no note, so it selects neither.
_FLOW_COLUMNS: _Columns = (
    Transaction.date,
    Transaction.amount,
    Transaction.type,
    Transaction.from_account,
    Transaction.to_account,
)
_LEDGER_COLUMNS: _Columns = (
    Transaction.date,
    Transaction.amount,
    Transaction.type,
    Transaction.category,
    Transaction.subcategory,
    Transaction.from_account,
    Transaction.to_account,
    Transaction.note,
)


def _ordered(
    db: Session,
    user: User,
    columns: _Columns,
    start_date: datetime | None = None,
    end_date: datetime | None = None,
) -> list[Any]:
    """*columns* of the rows ``/api/transactions/all`` returns, newest first, then by ID."""
    return (
        build_transaction_query(db, user, start_date, end_date)
        .with_entities(*columns)
        .order_by(Transaction.date.desc(), Transaction.transaction_id.desc())
        .all()
    )


def _flows(
    db: Session, user: User, start_date: datetime | None, end_date: datetime | None
) -> list[FlowRow]:
    """The window's rows as the pulse reads them."""
    return [
        FlowRow(row.date, float(row.amount), row.type.value, row.from_account, row.to_account)
        for row in _ordered(db, user, _FLOW_COLUMNS, start_date, end_date)
    ]


def _ledger(db: Session, user: User) -> list[LedgerRow]:
    """Every live row with the labels and note current health classifies by."""
    return [
        LedgerRow(
            row.date,
            float(row.amount),
            row.type.value,
            row.category,
            row.subcategory or "",
            row.from_account,
            row.to_account,
            row.note or "",
        )
        for row in _ordered(db, user, _LEDGER_COLUMNS)
    ]


def _balances(db: Session, user: User) -> dict[str, float]:
    """``/api/calculations/account-balances`` with no window, as name to balance."""
    return {
        name: entry["balance"] for name, entry in account_balances(db, user, None, None).items()
    }


def _strings(raw: object) -> list[str]:
    """A JSON list preference's string items, as the preferences API serves them."""
    parsed = parse_json_preference(raw, [])
    return [item for item in parsed if isinstance(item, str)] if isinstance(parsed, list) else []


def _investment_mappings(user: User) -> dict[str, object]:
    """``investment_account_mappings`` as stored: account name to investment type."""
    prefs = user.preferences
    parsed = parse_json_preference(prefs.investment_account_mappings if prefs else None, {})
    return dict(parsed) if isinstance(parsed, dict) else {}


def _health_rules(user: User) -> HealthRules:
    prefs = user.preferences
    # An empty essential list means "not configured"; the defaults it would fall back
    # to are all inside DEFAULT_NEEDS, so the keyword set is the same either way.
    essentials = _strings(prefs.essential_categories if prefs else None)
    fixed = _strings(prefs.fixed_expense_categories if prefs else None)
    return HealthRules(
        investment_accounts=investment_account_names(investment_accounts_for(user)),
        essentials=frozenset(essential_keywords(essentials)),
        fixed=frozenset(item.lower() for item in fixed),
        loss_keys=capital_loss_keys_for(user),
    )


def dashboard_pulse(
    db: Session,
    user: User,
    start_date: datetime | None,
    end_date: datetime | None,
    today: date,
) -> dict[str, Any]:
    """Age of Money, Days of Buffering and the transfer split for one window."""
    rows = _flows(db, user, start_date, end_date)
    transfers = investment_transfers(rows, investment_account_names(investment_accounts_for(user)))
    if not rows:
        return {"age_of_money": None, "days_of_buffering": None, "investment_transfers": transfers}
    classifications = get_classification_map(db, user.id)
    liquid = net_liquid(_balances(db, user), classifications)
    return {
        "age_of_money": age_of_money(rows, classifications),
        "days_of_buffering": days_of_buffering(liquid, rows, today),
        "investment_transfers": transfers,
    }


def dashboard_health(db: Session, user: User, today: date) -> dict[str, Any]:
    """The current health analysis over the whole ledger and the recorded balances."""
    balances = balance_position(
        _balances(db, user), get_classification_map(db, user.id), _investment_mappings(user)
    )
    prefs = user.preferences
    saved_start = prefs.earning_start_date if prefs else None
    return {
        "current_health": current_health(
            _ledger(db, user), _health_rules(user), saved_start, balances, today
        )
    }
