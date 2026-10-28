"""App-wide totals for the owner's admin page.

The one place that reads across users on purpose, and only as counts and sums:
no row, email, account name or amount of any user leaves this module. AI usage
counts completed and reserved calls, as the quota does, and ``cost_usd`` is the
estimate recorded with each call.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ledger_sync.core.query_helpers import fmt_date
from ledger_sync.db.models import AIUsageLog, ImportLog, Transaction, User

DAILY_DAYS = 30
_COUNTED = ("reserved", "completed")


def _users(db: Session, now: datetime) -> dict[str, int]:
    def count(*where: Any) -> int:
        return int(db.scalar(select(func.count()).select_from(User).where(*where)) or 0)

    return {
        "total": count(),
        "signed_in_7d": count(User.last_login >= now - timedelta(days=7)),
        "signed_in_30d": count(User.last_login >= now - timedelta(days=30)),
        "new_30d": count(User.created_at >= now - timedelta(days=30)),
    }


def _ledger(db: Session, now: datetime) -> dict[str, int]:
    since = now - timedelta(days=30)
    imports, rows = db.execute(
        select(func.count(), func.coalesce(func.sum(ImportLog.rows_processed), 0)).where(
            ImportLog.imported_at >= since
        )
    ).one()
    live = db.scalar(
        select(func.count()).select_from(Transaction).where(Transaction.is_deleted.is_(False))
    )
    return {
        "transactions": int(live or 0),
        "imports_30d": int(imports),
        "rows_imported_30d": int(rows),
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
    for offset in range(DAILY_DAYS):
        key = (first + timedelta(days=offset)).date().isoformat()
        calls, cost = per_day.get(key, (0, 0.0))
        daily.append({"date": key, "calls": calls, "cost_usd": round(cost, 4)})
    return {
        "today": _usage(db, today),
        "last_30d": _usage(db, first),
        "by_funding_30d": [
            {"funding_source": source, "calls": int(calls), "cost_usd": round(float(cost), 4)}
            for source, calls, cost in by_funding
        ],
        "daily": daily,
    }


def admin_stats(db: Session, now: datetime | None = None) -> dict[str, Any]:
    """Counts and sums across every user, for the owner's admin page."""
    current = now or datetime.now(UTC)
    return {
        "as_of": current.isoformat(),
        "users": _users(db, current),
        "ledger": _ledger(db, current),
        "ai": _ai(db, current),
    }
