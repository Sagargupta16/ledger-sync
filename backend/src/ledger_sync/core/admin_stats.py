"""App-wide totals for the owner's admin page.

The one place that reads across users on purpose, and only as counts and sums:
no row, full email, name or amount of any user leaves it. The users section
(``admin_users.py``) adds a masked account list with activity counts, and the
app section (``admin_app.py``) the version, database and feature adoption. AI
usage counts completed and reserved calls, as the quota does, and ``cost_usd``
is the estimate recorded with each call.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ledger_sync.core.admin_app import app_section
from ledger_sync.core.admin_users import users_section
from ledger_sync.core.query_helpers import fmt_date
from ledger_sync.db.models import AIUsageLog, ImportLog, Transaction, TransactionType

DAILY_DAYS = 30
MODEL_LIMIT = 20
_COUNTED = ("reserved", "completed")


def _days(today: datetime) -> list[str]:
    """The last DAILY_DAYS UTC dates, oldest first."""
    first = today - timedelta(days=DAILY_DAYS - 1)
    return [(first + timedelta(days=offset)).date().isoformat() for offset in range(DAILY_DAYS)]


def _ledger(db: Session, now: datetime) -> dict[str, Any]:
    since = now - timedelta(days=30)
    imports, rows = db.execute(
        select(func.count(), func.coalesce(func.sum(ImportLog.rows_processed), 0)).where(
            ImportLog.imported_at >= since
        )
    ).one()
    live = (Transaction.is_deleted.is_(False),)
    by_type = {
        kind.value if isinstance(kind, TransactionType) else str(kind): int(count)
        for kind, count in db.execute(
            select(Transaction.type, func.count()).where(*live).group_by(Transaction.type)
        ).all()
    }
    today = datetime(now.year, now.month, now.day, tzinfo=UTC)
    days = _days(today)
    day = fmt_date(ImportLog.imported_at)
    per_day: dict[str, int] = {
        str(key): int(total)
        for key, total in db.execute(
            select(day, func.count())
            .where(ImportLog.imported_at >= today - timedelta(days=DAILY_DAYS - 1))
            .group_by(day)
        ).all()
    }
    return {
        "transactions": sum(by_type.values()),
        "by_type": {kind.value: by_type.get(kind.value, 0) for kind in TransactionType},
        "imports_30d": int(imports),
        "rows_imported_30d": int(rows),
        "imports_daily": [{"date": key, "imports": int(per_day.get(key, 0))} for key in days],
    }


def _usage(db: Session, since: datetime) -> dict[str, Any]:
    calls, tokens, cost = db.execute(
        select(
            func.count(),
            func.coalesce(func.sum(AIUsageLog.input_tokens + AIUsageLog.output_tokens), 0),
            func.coalesce(func.sum(AIUsageLog.cost_usd), 0.0),
        ).where(AIUsageLog.timestamp >= since, AIUsageLog.status.in_(_COUNTED))
    ).one()
    return {"calls": int(calls), "tokens": int(tokens), "cost_usd": round(float(cost), 4)}


def _ai(db: Session, now: datetime) -> dict[str, Any]:
    today = datetime(now.year, now.month, now.day, tzinfo=UTC)
    first = today - timedelta(days=DAILY_DAYS - 1)
    counted = (AIUsageLog.timestamp >= first, AIUsageLog.status.in_(_COUNTED))
    by_funding = db.execute(
        select(
            AIUsageLog.funding_source,
            func.count(),
            func.coalesce(func.sum(AIUsageLog.cost_usd), 0.0),
        )
        .where(*counted)
        .group_by(AIUsageLog.funding_source)
        .order_by(AIUsageLog.funding_source)
    ).all()
    day = fmt_date(AIUsageLog.timestamp)
    per_day = {
        key: (int(calls), float(cost))
        for key, calls, cost in db.execute(
            select(day, func.count(), func.coalesce(func.sum(AIUsageLog.cost_usd), 0.0))
            .where(*counted)
            .group_by(day)
        ).all()
    }
    daily = []
    for key in _days(today):
        calls, cost = per_day.get(key, (0, 0.0))
        daily.append({"date": key, "calls": calls, "cost_usd": round(cost, 4)})
    by_model = db.execute(
        select(
            AIUsageLog.model,
            func.count(),
            func.coalesce(func.sum(AIUsageLog.input_tokens + AIUsageLog.output_tokens), 0),
            func.coalesce(func.sum(AIUsageLog.cost_usd), 0.0),
        )
        .where(*counted)
        .group_by(AIUsageLog.model)
        .order_by(func.count().desc())
        .limit(MODEL_LIMIT)
    ).all()
    return {
        "today": _usage(db, today),
        "last_30d": _usage(db, first),
        "by_funding_30d": [
            {"funding_source": source, "calls": int(calls), "cost_usd": round(float(cost), 4)}
            for source, calls, cost in by_funding
        ],
        "by_model_30d": [
            {
                "model": model,
                "calls": int(calls),
                "tokens": int(tokens),
                "cost_usd": round(float(cost), 4),
            }
            for model, calls, tokens, cost in by_model
        ],
        "daily": daily,
    }


def admin_stats(db: Session, now: datetime | None = None) -> dict[str, Any]:
    """Counts and sums across every user, for the owner's admin page."""
    current = now or datetime.now(UTC)
    return {
        "as_of": current.isoformat(),
        "users": users_section(db, current),
        "ledger": _ledger(db, current),
        "ai": _ai(db, current),
        "app": app_section(db),
    }
