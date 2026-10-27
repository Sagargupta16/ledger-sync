"""Deterministic Monday recap of the last full IST week.

The week runs Monday to Sunday on the ledger's IST calendar (``ledger_clock``),
so the same ledger read on the same day always yields the same recap: no model
call and no clock beyond "today". Every figure is a book value from the ledger
and its rollups, a computation aid rather than advice:

- spending and the top category movers against the average of up to four full
  weeks before the recap week (``weekly_recap_flows``);
- the net-worth change and the category that drove it (same module);
- open anomalies about the week's transactions or its months (below);
- recurring expense commitments due today or in the next seven days, and days
  to the payday set in Settings (``weekly_recap_upcoming``).

The week reads as complete once the ledger has a row dated from its Sunday up
to today. That is a hint, not a proof: a quiet Sunday and Monday read as a gap,
so the card says the week *may* be incomplete.

The optional AI narrative is not made here: the browser sends these facts
through the chat transport, so it spends the same quota as a chat message.
"""

from __future__ import annotations

from collections.abc import Sequence
from datetime import date, datetime, timedelta

from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.orm import Session

from ledger_sync.core.ledger_clock import ledger_today
from ledger_sync.core.query_helpers import build_transaction_query
from ledger_sync.core.weekly_recap_flows import (
    day_start,
    load_week_flows,
    money,
    net_worth_change,
    spending_summary,
    top_movers,
)
from ledger_sync.core.weekly_recap_upcoming import bills_due, next_payday
from ledger_sync.db.models import Anomaly, Transaction, User
from ledger_sync.schemas.weekly_recap import RecapAnomaly, RecapWeek, WeeklyRecapResponse

WEEK_DAYS = 7
BASELINE_WEEKS = 4
TOP_ANOMALIES = 5
_SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}


def recap_week_start(today: date) -> date:
    """Monday of the last full week: the previous Monday when today is a Monday."""
    return today - timedelta(days=today.weekday() + WEEK_DAYS)


def _ledger_span(db: Session, user: User, today: date) -> tuple[date | None, date | None]:
    """The first transaction date, and the latest one dated on or before *today*.

    A row dated ahead (a payment entered early) must not make a lagging import
    read as complete, so it does not move the second date.
    """
    base = build_transaction_query(db, user).subquery()
    to_date = case((base.c.date < day_start(today + timedelta(days=1)), base.c.date))
    first, last = db.query(func.min(base.c.date), func.max(to_date)).one()
    return (first.date() if first else None, last.date() if last else None)


def _baseline_weeks(first_day: date | None, week_start: date) -> int:
    """Full weeks of history before the recap week, capped at four."""
    if first_day is None:
        return 0
    return max(0, min(BASELINE_WEEKS, (week_start - first_day).days // WEEK_DAYS))


def _week_anomaly_rows(
    db: Session, user_id: int, week_start: date, week_end: date
) -> Sequence[tuple[Anomaly, datetime | None]]:
    """Open anomalies about a transaction dated in the week, or about its months.

    ``detected_at`` cannot say what is new: every refresh deletes and re-inserts
    the unreviewed rows. The flagged transaction's date (or, for a month-level
    finding with no transaction, its ``YYYY-MM``) is the stable link to the week.
    A finding whose transaction was deleted matches neither branch.
    """
    months = {week_start.strftime("%Y-%m"), week_end.strftime("%Y-%m")}
    in_week = and_(
        Transaction.date >= day_start(week_start),
        Transaction.date < day_start(week_end + timedelta(days=1)),
    )
    month_level = and_(Anomaly.transaction_id.is_(None), Anomaly.period_key.in_(months))
    return (
        db.execute(
            select(Anomaly, Transaction.date)
            .outerjoin(
                Transaction,
                and_(
                    Transaction.user_id == Anomaly.user_id,
                    Transaction.transaction_id == Anomaly.transaction_id,
                    Transaction.is_deleted.is_(False),
                ),
            )
            .where(
                Anomaly.user_id == user_id,
                Anomaly.is_reviewed.is_(False),
                Anomaly.is_dismissed.is_(False),
                or_(in_week, month_level),
            )
        )
        .tuples()
        .all()
    )


def _recap_anomaly(anomaly: Anomaly, flagged_at: datetime | None) -> RecapAnomaly:
    return RecapAnomaly(
        id=anomaly.id,
        type=anomaly.anomaly_type.value,
        severity=anomaly.severity,
        description=anomaly.description,
        occurred_on=flagged_at.date() if flagged_at else None,
        period=anomaly.period_key,
        amount=None if anomaly.actual_value is None else money(anomaly.actual_value),
    )


def _rank(item: RecapAnomaly) -> tuple[int, int, int]:
    """Most severe first, then the latest flagged day, then the oldest row."""
    severity = _SEVERITY_RANK.get(item.severity, len(_SEVERITY_RANK))
    return (severity, -(item.occurred_on.toordinal() if item.occurred_on else 0), item.id)


def week_anomalies(
    db: Session, user_id: int, week_start: date, week_end: date
) -> tuple[list[RecapAnomaly], int]:
    """The week's top open anomalies and how many there are in all."""
    rows = _week_anomaly_rows(db, user_id, week_start, week_end)
    found = sorted((_recap_anomaly(anomaly, flagged_at) for anomaly, flagged_at in rows), key=_rank)
    return found[:TOP_ANOMALIES], len(found)


def build_weekly_recap(db: Session, user: User, today: date | None = None) -> WeeklyRecapResponse:
    """Assemble the recap for the full week before *today* (IST today by default)."""
    today = today or ledger_today()
    week_start = recap_week_start(today)
    week_end = week_start + timedelta(days=WEEK_DAYS - 1)
    first_day, last_day = _ledger_span(db, user, today)
    weeks = _baseline_weeks(first_day, week_start)
    baseline_start = week_start - timedelta(days=WEEK_DAYS * weeks)
    flows = load_week_flows(
        db, user, week_start=week_start, week_end=week_end, baseline_start=baseline_start
    )
    anomalies, anomaly_count = week_anomalies(db, user.id, week_start, week_end)
    preferences = user.preferences
    return WeeklyRecapResponse(
        week=RecapWeek(
            start=week_start,
            end=week_end,
            as_of=today,
            baseline_start=baseline_start if weeks else None,
            baseline_weeks=weeks,
            data_from=first_day,
            data_through=last_day,
            is_complete=last_day is not None and last_day >= week_end,
        ),
        spending=spending_summary(flows, weeks),
        movers=top_movers(flows, weeks),
        net_worth=net_worth_change(db, user, flows, week_start),
        bills=bills_due(db, user.id, today),
        anomalies=anomalies,
        anomaly_count=anomaly_count,
        payday=next_payday(today, preferences.payday if preferences else None),
    )
