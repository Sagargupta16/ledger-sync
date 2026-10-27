"""Balance checks: what the bank says each account held, against the ledger.

Routes only. The running balances, statuses and month coverage come from
``core.balance_checks``; validation and staging of writes from
``core.balance_check_writes``. Every query is scoped to the signed-in user.
"""

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy.exc import IntegrityError

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.core.balance_check_writes import (
    SAME_DAY_MESSAGE,
    BalanceCheckError,
    DuplicateCheckError,
    delete_check,
    record_check,
    update_check,
)
from ledger_sync.core.balance_checks import balance_check_summary
from ledger_sync.db.models import BalanceCheck
from ledger_sync.schemas.balance_checks import (
    BalanceCheckCreate,
    BalanceCheckEntry,
    BalanceChecksSummary,
    BalanceCheckUpdate,
)

router = APIRouter(prefix="/api/balance-checks", tags=["balance-checks"])


def _entry(check: BalanceCheck) -> BalanceCheckEntry:
    return BalanceCheckEntry(
        id=check.id,
        account=check.account,
        check_date=check.check_date.isoformat(),
        balance=float(check.balance),
    )


@router.get("")
def get_balance_checks(current_user: CurrentUser, db: DatabaseSession) -> BalanceChecksSummary:
    """Each account's ledger balance, checks, freshness status and months with rows."""
    return BalanceChecksSummary.model_validate(balance_check_summary(db, current_user))


@router.post(
    "",
    responses={
        422: {"description": "A day before 2000 or after today, or an account with no rows"}
    },
)
def post_balance_check(
    payload: BalanceCheckCreate, current_user: CurrentUser, db: DatabaseSession
) -> BalanceCheckEntry:
    """Record the bank's balance for a day. A second check on that day replaces the first."""
    try:
        check = record_check(
            db, current_user.id, payload.account, payload.check_date, payload.balance
        )
        db.commit()
    except BalanceCheckError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except IntegrityError:
        # A concurrent save inserted the same day first: replace its amount instead.
        db.rollback()
        check = record_check(
            db, current_user.id, payload.account, payload.check_date, payload.balance
        )
        db.commit()
    return _entry(check)


@router.put(
    "/{check_id}",
    responses={
        404: {"description": "No such check for this user"},
        409: {"description": "The account already has a check on that day"},
        422: {"description": "A day before 2000 or after today"},
    },
)
def put_balance_check(
    check_id: int, payload: BalanceCheckUpdate, current_user: CurrentUser, db: DatabaseSession
) -> BalanceCheckEntry:
    """Correct a check's day or amount. The account stays the same."""
    try:
        check = update_check(db, current_user.id, check_id, payload.check_date, payload.balance)
        if check is None:
            raise HTTPException(status_code=404, detail="Balance check not found")
        db.commit()
    except DuplicateCheckError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    except BalanceCheckError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    except IntegrityError as e:
        db.rollback()
        raise HTTPException(status_code=409, detail=SAME_DAY_MESSAGE) from e
    return _entry(check)


@router.delete("/{check_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_balance_check(check_id: int, current_user: CurrentUser, db: DatabaseSession) -> Response:
    """Remove a check. Idempotent: an id that is already gone is also a 204."""
    delete_check(db, current_user.id, check_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
