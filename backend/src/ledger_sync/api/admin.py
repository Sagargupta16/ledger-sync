"""Owner admin endpoints (``/api/admin``).

Only accounts in LEDGER_SYNC_ADMIN_EMAILS get past ``AdminUser``; everyone else
gets 403. The stats are app-wide counts and sums (``core/admin_stats.py``) and
a list of accounts with masked emails and activity counts
(``core/admin_users.py``), never another user's transactions or amounts.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, Request, status

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.api.rate_limit import user_limiter
from ledger_sync.core.admin_access import is_admin_email
from ledger_sync.core.admin_stats import admin_stats
from ledger_sync.db.models import User

router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_admin(current_user: CurrentUser) -> User:
    if not is_admin_email(current_user.email):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")
    return current_user


AdminUser = Annotated[User, Depends(require_admin)]


@router.get(
    "/stats",
    responses={401: {"description": "Invalid access token"}, 403: {"description": "Admin only"}},
)
@user_limiter.limit("30/minute")
def get_admin_stats(
    request: Request, _admin: AdminUser, session: DatabaseSession
) -> dict[str, Any]:
    """Users, ledger volume, AI usage and app health across the app."""
    return admin_stats(session)
