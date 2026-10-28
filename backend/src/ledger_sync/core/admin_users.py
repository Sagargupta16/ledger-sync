"""The admin page's users section: counts, growth and a masked account list.

Reads across users on purpose, for the owner only (``api/admin.py``). The list
shows an email masked to its first three characters and its domain, plus
activity counts; never a full email, a name, an amount or a transaction field.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ledger_sync.core.query_helpers import fmt_year_month
from ledger_sync.db.models import AIUsageLog, ImportLog, Transaction, User

LIST_LIMIT = 200
SIGNUP_MONTHS = 12
_COUNTED = ("reserved", "completed")


def mask_email(email: str) -> str:
    """``sg85207@gmail.com`` -> ``sg8***@gmail.com``; a short local part keeps one character."""
    local, at, domain = email.partition("@")
    if not at or not domain:
        return "***"
    keep = local[:3] if len(local) > 3 else local[:1]
    return f"{keep}***@{domain}"


def _utc(value: datetime | None) -> datetime | None:
    """Stored timestamps are naive UTC on PostgreSQL and SQLite alike; compare them as such."""
    if value is None:
        return None
    return value.astimezone(UTC).replace(tzinfo=None) if value.tzinfo else value


def _iso(value: datetime | None) -> str | None:
    stamp = _utc(value)
    return None if stamp is None else stamp.replace(tzinfo=UTC).isoformat()


def _per_user(db: Session, stmt: Any) -> dict[int, Any]:
    return {int(user_id): value for user_id, value in db.execute(stmt).all()}


def _active(db: Session, since: datetime) -> int:
    """Accounts that imported a file, made an AI call or signed in since *since*."""
    ids = set(db.scalars(select(ImportLog.user_id).where(ImportLog.imported_at >= since)))
    ids |= set(db.scalars(select(AIUsageLog.user_id).where(AIUsageLog.timestamp >= since)))
    ids |= set(db.scalars(select(User.id).where(User.last_login >= since)))
    return len(ids)


def _month_keys(now: datetime, count: int) -> list[str]:
    index = now.year * 12 + now.month - 1
    return [
        f"{(index - back) // 12:04d}-{(index - back) % 12 + 1:02d}"
        for back in range(count - 1, -1, -1)
    ]


def _signups(db: Session, now: datetime) -> list[dict[str, Any]]:
    keys = _month_keys(now, SIGNUP_MONTHS)
    month = fmt_year_month(User.created_at)
    counts: dict[str, int] = {
        str(key): int(total)
        for key, total in db.execute(
            select(month, func.count())
            .where(User.created_at >= datetime.fromisoformat(f"{keys[0]}-01"))
            .group_by(month)
        ).all()
    }
    return [{"month": key, "signups": counts.get(key, 0)} for key in keys]


def _providers(providers: Iterable[str | None]) -> dict[str, int]:
    split = {"google": 0, "github": 0, "other": 0}
    for provider in providers:
        split[provider if provider in ("google", "github") else "other"] += 1
    return split


def _account_list(db: Session, users: list[Any], now: datetime) -> list[dict[str, Any]]:
    since = now - timedelta(days=30)
    live = _per_user(
        db,
        select(Transaction.user_id, func.count())
        .where(Transaction.is_deleted.is_(False))
        .group_by(Transaction.user_id),
    )
    imports = _per_user(db, select(ImportLog.user_id, func.count()).group_by(ImportLog.user_id))
    last_import = _per_user(
        db, select(ImportLog.user_id, func.max(ImportLog.imported_at)).group_by(ImportLog.user_id)
    )
    ai_30d = _per_user(
        db,
        select(AIUsageLog.user_id, func.count())
        .where(AIUsageLog.timestamp >= since, AIUsageLog.status.in_(_COUNTED))
        .group_by(AIUsageLog.user_id),
    )
    last_ai = _per_user(
        db, select(AIUsageLog.user_id, func.max(AIUsageLog.timestamp)).group_by(AIUsageLog.user_id)
    )
    accounts = []
    for user_id, email, provider, created_at, last_login in users:
        stamps = [_utc(s) for s in (last_login, last_import.get(user_id), last_ai.get(user_id))]
        last_active = max((s for s in stamps if s is not None), default=None)
        accounts.append(
            {
                "id": user_id,
                "email": mask_email(email),
                "provider": provider or "other",
                "created_at": _iso(created_at),
                "last_login": _iso(last_login),
                "last_active": _iso(last_active),
                "transactions": int(live.get(user_id, 0)),
                "imports": int(imports.get(user_id, 0)),
                "ai_calls_30d": int(ai_30d.get(user_id, 0)),
            }
        )
    accounts.sort(key=lambda account: account["last_active"] or "", reverse=True)
    return accounts[:LIST_LIMIT]


def users_section(db: Session, now: datetime) -> dict[str, Any]:
    """Every 2.33.0 count plus providers, sign-ups, activity and the masked list."""
    users = list(
        db.execute(
            select(User.id, User.email, User.auth_provider, User.created_at, User.last_login)
        ).all()
    )

    def count(*where: Any) -> int:
        return int(db.scalar(select(func.count()).select_from(User).where(*where)) or 0)

    return {
        "total": len(users),
        "signed_in_7d": count(User.last_login >= now - timedelta(days=7)),
        "signed_in_30d": count(User.last_login >= now - timedelta(days=30)),
        "new_30d": count(User.created_at >= now - timedelta(days=30)),
        "active_7d": _active(db, now - timedelta(days=7)),
        "active_30d": _active(db, now - timedelta(days=30)),
        "by_provider": _providers(user.auth_provider for user in users),
        "signups_by_month": _signups(db, now),
        "list": _account_list(db, users, now),
        "list_limit": LIST_LIMIT,
    }
