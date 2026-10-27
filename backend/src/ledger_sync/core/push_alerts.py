"""What a daily run tells one user, following their Settings > Notifications choices.

Three kinds, each behind its toggle:

- bills: accepted expense commitments (the bill calendar's rule) falling due
  from today to ``notify_days_ahead`` days ahead, on the dates the recurring
  endpoint serves as ``next_expected``;
- budgets: active budgets whose spend this IST month reached their alert
  threshold, counted the way budget tracking counts it;
- anomalies: open anomalies, neither reviewed nor dismissed, except budget
  overruns, which the budgets kind already reports.

Bodies hold counts and timing, never amounts or names, because the lock screen
shows them. Each flagged item also has a stable key, so a device hears about it
once per stage: a bill when it enters the window and again the day before it is
due, a budget when it passes the threshold and again when it passes the limit,
an anomaly when it first appears. An analytics refresh deletes and re-creates
detected bills and anomalies under new ids and with new amounts, so a key names
what the item is (the identity detection itself uses), never its row id, and is
hashed so it holds no note, category or amount.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.core.analytics.anomaly_rules import finding_key
from ledger_sync.core.analytics.budget_tracking import usage_pct, user_month_spend
from ledger_sync.core.analytics.recurring import DISMISSED_PATTERN_KIND, normalize_recurring_note
from ledger_sync.core.safe_to_spend_flows import is_accepted_commitment
from ledger_sync.core.weekly_recap_upcoming import next_due
from ledger_sync.db.models import (
    Anomaly,
    AnomalyType,
    Budget,
    RecurringTransaction,
    TransactionType,
    User,
    UserPreferences,
)

DEFAULT_DAYS_AHEAD = 7
DEFAULT_THRESHOLD_PCT = 80.0


@dataclass(frozen=True, slots=True)
class AlertPrefs:
    bills: bool = True
    budgets: bool = True
    anomalies: bool = True
    days_ahead: int = DEFAULT_DAYS_AHEAD


@dataclass(frozen=True, slots=True)
class Alert:
    kind: str  # "bills", "budgets" or "anomalies"
    title: str
    body: str
    path: str
    count: int
    keys: frozenset[str]


def alert_prefs(prefs: UserPreferences | None) -> AlertPrefs:
    """The saved toggles; a user without a preferences row gets the defaults (all on)."""
    if prefs is None:
        return AlertPrefs()
    return AlertPrefs(
        bills=bool(prefs.notify_upcoming_bills),
        budgets=bool(prefs.notify_budget_alerts),
        anomalies=bool(prefs.notify_anomalies),
        days_ahead=max(0, prefs.notify_days_ahead),
    )


def _when(days: int) -> str:
    if days == 0:
        return "today"
    return "tomorrow" if days == 1 else f"in {days} days"


def _plural(count: int, noun: str) -> str:
    return f"{count} {noun}" if count == 1 else f"{count} {noun}s"


def _digest(*parts: object) -> str:
    """A short stable hash of *parts*; None counts as empty."""
    text = "|".join("" if part is None else str(part) for part in parts)
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def _bill_identity(record: RecurringTransaction) -> str:
    """The detection group a commitment belongs to: its note without the billing date, and type.

    The same grouping ``_detect_recurring_transactions`` uses, so "Rent Oct 2026" and the
    "Rent Nov 2026" that replaces it after the next import are one bill.
    """
    label = normalize_recurring_note(record.pattern_name) or record.pattern_name.lower()
    return _digest(record.transaction_type.value, label)


def bill_alert(db: Session, user_id: int, today: date, days_ahead: int) -> Alert | None:
    """Expense commitments due from today through *days_ahead* days from now."""
    records = db.scalars(
        select(RecurringTransaction).where(
            RecurringTransaction.user_id == user_id,
            RecurringTransaction.pattern_kind != DISMISSED_PATTERN_KIND,
            RecurringTransaction.is_active.is_(True),
            RecurringTransaction.transaction_type == TransactionType.EXPENSE,
        )
    ).all()
    due_in: list[int] = []
    keys: set[str] = set()
    for record in records:
        if not is_accepted_commitment(record, today):
            continue
        due = next_due(record, today)
        days = (due - today).days if due is not None else -1
        if not 0 <= days <= days_ahead:
            continue
        due_in.append(days)
        stage = "due" if days <= 1 else "soon"
        keys.add(f"bill:{_bill_identity(record)}:{due}:{stage}")
    if not due_in:
        return None
    count, first = len(due_in), min(due_in)
    if count == 1:
        body = f"A bill is due {_when(first)}."
    elif first == max(due_in):
        body = f"{count} bills are due {_when(first)}."
    else:
        span = "by tomorrow" if days_ahead == 1 else f"in the next {days_ahead} days"
        body = f"{count} bills are due {span}. The first is due {_when(first)}."
    return Alert("bills", "Upcoming bills", body, "/bill-calendar", count, frozenset(keys))


def budget_alert(db: Session, user: User, now: datetime) -> Alert | None:
    """Active budgets at or past their alert threshold this month."""
    active = select(Budget).where(Budget.user_id == user.id, Budget.is_active.is_(True))
    budgets = [budget for budget in db.scalars(active) if budget.monthly_limit > 0]
    if not budgets:
        return None
    spent = user_month_spend(db, user, {budget.category for budget in budgets}, now)
    month = f"{now.year:04d}-{now.month:02d}"
    levels: dict[str, list[int]] = {"over": [], "near": []}
    for budget in budgets:
        pct = usage_pct(spent.get(budget.category, Decimal(0)), budget.monthly_limit)
        threshold = budget.alert_threshold_pct
        if pct >= 100:
            levels["over"].append(budget.id)
        elif pct >= (DEFAULT_THRESHOLD_PCT if threshold is None else threshold):
            levels["near"].append(budget.id)
    over, near = len(levels["over"]), len(levels["near"])
    if not over + near:
        return None
    if over and near:
        body = f"{_plural(over, 'budget')} over the limit and {near} close to it this month."
    else:
        state = "over the limit" if over else "close to the limit"
        body = f"{_plural(over or near, 'budget')} {state} this month."
    keys = frozenset(f"budget:{i}:{month}:{level}" for level, ids in levels.items() for i in ids)
    return Alert("budgets", "Budget alert", body, "/budgets", over + near, keys)


def anomaly_alert(db: Session, user_id: int) -> Alert | None:
    """Anomalies still waiting for a review, budget overruns aside.

    A budget overrun is the budgets kind's alert: it has a stable key per budget
    and follows the Budget Alerts toggle, where this kind would push it a second
    time and count it twice in the badge.
    """
    rows = db.execute(
        select(
            Anomaly.anomaly_type, Anomaly.period_key, Anomaly.transaction_id, Anomaly.description
        ).where(
            Anomaly.user_id == user_id,
            Anomaly.anomaly_type != AnomalyType.BUDGET_EXCEEDED,
            Anomaly.is_reviewed.is_(False),
            Anomaly.is_dismissed.is_(False),
        )
    ).all()
    if not rows:
        return None
    keys: set[str] = set()
    for kind, period_key, transaction_id, description in rows:
        # A month-level description carries amounts that change on every refresh, so
        # key on the engine's own notion of the same finding, not on the description.
        kind_key, *identity = finding_key(kind, period_key, transaction_id, description)
        keys.add("anomaly:" + _digest(kind_key.value, *identity))
    verb = "is" if len(rows) == 1 else "are"
    body = f"{_plural(len(rows), 'unusual item')} {verb} waiting for review."
    return Alert("anomalies", "Unusual activity", body, "/anomalies", len(rows), frozenset(keys))


def collect_alerts(db: Session, user: User, now: datetime) -> list[Alert]:
    """The user's current alerts, one per enabled kind with something to say."""
    prefs = alert_prefs(user.preferences)
    candidates = (
        bill_alert(db, user.id, now.date(), prefs.days_ahead) if prefs.bills else None,
        budget_alert(db, user, now) if prefs.budgets else None,
        anomaly_alert(db, user.id) if prefs.anomalies else None,
    )
    return [alert for alert in candidates if alert is not None]
