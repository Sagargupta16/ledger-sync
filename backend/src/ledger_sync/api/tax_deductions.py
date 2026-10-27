"""Old-regime deductions saved per tax year for the /tax regime comparison.

``GET`` returns one tax year's amounts ("2026-27"), ``PATCH`` sets the sections
it is sent (zero removes one) and ``DELETE`` clears the year. A section left out
of a ``PATCH`` keeps its saved amount, so a page that has not loaded the year,
or a second tab holding older amounts, cannot erase sections it never showed.
These are user inputs to an estimate the browser computes, not ledger data, so
no write here touches analytics.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.db.models import TaxDeduction
from ledger_sync.schemas.tax_deductions import (
    TaxDeductionsResponse,
    TaxDeductionsUpdate,
    TaxYear,
)

router = APIRouter(prefix="/api/tax-deductions", tags=["tax-deductions"])

TaxYearPath = Annotated[TaxYear, Path(description="Tax year, such as 2026-27")]


def _rows(db: Session, user_id: int, tax_year: str) -> list[TaxDeduction]:
    stmt = (
        select(TaxDeduction)
        .where(TaxDeduction.user_id == user_id, TaxDeduction.tax_year == tax_year)
        .order_by(TaxDeduction.section_key)
    )
    return list(db.execute(stmt).scalars())


def _response(tax_year: str, rows: list[TaxDeduction]) -> TaxDeductionsResponse:
    return TaxDeductionsResponse(
        tax_year=tax_year,
        deductions={row.section_key: float(row.amount) for row in rows},
    )


def _apply(db: Session, user_id: int, tax_year: str, amounts: dict[str, Decimal]) -> None:
    """Store each positive amount sent, in place when the section exists; zero deletes it."""
    existing = {row.section_key: row for row in _rows(db, user_id, tax_year)}
    for key, amount in amounts.items():
        row = existing.get(key)
        if amount == 0:
            if row is not None:
                db.delete(row)
        elif row is None:
            db.add(TaxDeduction(user_id=user_id, tax_year=tax_year, section_key=key, amount=amount))
        else:
            row.amount = amount


def _committed(db: Session) -> bool:
    """Commit, or roll back and return False when a constraint rejected the write."""
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        return False
    return True


@router.get("/{tax_year}")
def get_tax_deductions(
    tax_year: TaxYearPath, current_user: CurrentUser, db: DatabaseSession
) -> TaxDeductionsResponse:
    """The year's saved amounts; a year with none returns an empty map."""
    return _response(tax_year, _rows(db, current_user.id, tax_year))


@router.patch("/{tax_year}")
def update_tax_deductions(
    tax_year: TaxYearPath,
    payload: TaxDeductionsUpdate,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> TaxDeductionsResponse:
    """Set the sections sent and return the year; zero removes one, an unsent one is kept."""
    # Read before a commit or rollback expires the user row.
    user_id = current_user.id
    amounts: dict[str, Decimal] = dict(payload.deductions.items())
    _apply(db, user_id, tax_year, amounts)
    if not _committed(db):
        # A concurrent first save added the same section; write ours over it.
        _apply(db, user_id, tax_year, amounts)
        if not _committed(db):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Deductions changed while saving. Try again.",
            )
    return _response(tax_year, _rows(db, user_id, tax_year))


@router.delete("/{tax_year}", status_code=204)
def delete_tax_deductions(
    tax_year: TaxYearPath, current_user: CurrentUser, db: DatabaseSession
) -> None:
    """Remove every amount saved for the year. Idempotent: an empty year is also a 204."""
    db.execute(
        delete(TaxDeduction).where(
            TaxDeduction.user_id == current_user.id, TaxDeduction.tax_year == tax_year
        )
    )
    db.commit()
