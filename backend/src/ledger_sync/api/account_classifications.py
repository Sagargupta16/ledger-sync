"""Account classification API backed by durable ledger account identities.

The wire shape never exposed classification primary keys, so consolidation does
not change API IDs. Clearing a classification preserves closure, limits and all
transaction references; an unconfigured account still reads as the legacy Other.
"""

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.core.analytics.refresh import lock_analytics_user, mark_preferences_changed
from ledger_sync.db.models import AccountType, RecurringTransaction
from ledger_sync.services.account_settings import (
    get_account,
    get_account_label_keys,
    get_classification_map,
    get_closed_account_names,
    set_account_closed,
    set_account_type,
)

router = APIRouter(prefix="/api/account-classifications", tags=["account-classifications"])


class AccountStatusUpdate(BaseModel):
    """Body for the close/reopen endpoint."""

    account_name: str = Field(min_length=1, max_length=255)
    is_closed: bool


def _parse_type(account_type: str) -> AccountType:
    try:
        return AccountType(account_type)
    except ValueError as err:
        valid_types = ", ".join(t.value for t in AccountType)
        raise HTTPException(
            status_code=422, detail=f"Invalid account type. Must be one of: {valid_types}"
        ) from err


def _lock_settings(db: DatabaseSession, user_id: int) -> None:
    lock_analytics_user(db, user_id)
    # Reload after obtaining the lock, including objects loaded before a wait.
    db.flush()
    db.expire_all()


@router.get("")
def get_all_classifications(current_user: CurrentUser, db: DatabaseSession) -> dict[str, str]:
    """Map configured account names to account types."""
    return get_classification_map(db, current_user.id)


@router.get("/closed")
def get_closed_accounts(current_user: CurrentUser, db: DatabaseSession) -> list[str]:
    """List canonical account names marked closed."""
    return get_closed_account_names(db, current_user.id)


@router.put("/status")
def set_account_status(
    body: AccountStatusUpdate, current_user: CurrentUser, db: DatabaseSession
) -> dict[str, Any]:
    """Change closure independently of classification and preserve history."""
    _lock_settings(db, current_user.id)
    try:
        account, changed = set_account_closed(
            db, current_user.id, body.account_name, body.is_closed
        )
        keys = get_account_label_keys(db, current_user.id, account.id)
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err

    # Match Python-lower aliases, including Unicode, without rewriting schedules.
    recurring_names = db.scalars(
        select(RecurringTransaction.account)
        .where(RecurringTransaction.user_id == current_user.id)
        .distinct()
    )
    matching_names = [name for name in recurring_names if name and name.lower() in keys]
    recurring_query = db.query(RecurringTransaction).filter(
        RecurringTransaction.user_id == current_user.id,
        RecurringTransaction.account.in_(matching_names),
    )
    if body.is_closed:
        updated_recurring = recurring_query.filter(RecurringTransaction.is_active.is_(True)).update(
            {"is_active": False, "last_updated": datetime.now(UTC)}
        )
    else:
        updated_recurring = recurring_query.filter(
            RecurringTransaction.is_active.is_(False),
            RecurringTransaction.is_user_confirmed.is_(True),
        ).update({"is_active": True, "last_updated": datetime.now(UTC)})
    if changed or updated_recurring:
        mark_preferences_changed(db, current_user.id)
    db.commit()
    return {"account_name": account.name, "is_closed": account.is_closed, "status": "success"}


@router.get("/{account_name}")
def get_classification(
    account_name: str, current_user: CurrentUser, db: DatabaseSession
) -> dict[str, Any]:
    """Return the configured type or the existing Other fallback."""
    try:
        account = get_account(db, current_user.id, account_name)
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err
    return {
        "account_name": account.name if account else account_name,
        "account_type": (
            account.account_type.value if account and account.account_type is not None else "Other"
        ),
    }


@router.post("", responses={422: {"description": "Validation error"}})
def create_or_update_classification(
    account_name: str, account_type: str, current_user: CurrentUser, db: DatabaseSession
) -> dict[str, Any]:
    """Create or update classification on the user's stable account."""
    acc_type = _parse_type(account_type)
    _lock_settings(db, current_user.id)
    try:
        account, changed = set_account_type(db, current_user.id, account_name, acc_type)
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err
    if account is None:
        raise HTTPException(status_code=422, detail="Account could not be classified.")
    if changed:
        mark_preferences_changed(db, current_user.id)
    db.commit()
    return {
        "account_name": account.name,
        "account_type": acc_type.value,
        "status": "success",
    }


@router.delete("/{account_name}")
def delete_classification(
    account_name: str, current_user: CurrentUser, db: DatabaseSession
) -> dict[str, Any]:
    """Clear configuration while retaining the account and its other settings."""
    _lock_settings(db, current_user.id)
    try:
        _, changed = set_account_type(db, current_user.id, account_name, None)
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err
    if changed:
        mark_preferences_changed(db, current_user.id)
    db.commit()
    return {"status": "success", "message": f"Classification for {account_name} deleted"}


@router.get("/type/{account_type}", responses={422: {"description": "Validation error"}})
def get_accounts_by_type(
    account_type: str, current_user: CurrentUser, db: DatabaseSession
) -> dict[str, Any]:
    """List canonical account names with the specified type."""
    acc_type = _parse_type(account_type)
    return {
        "account_type": account_type,
        "accounts": [
            name
            for name, value in get_classification_map(db, current_user.id).items()
            if value == acc_type.value
        ],
    }
