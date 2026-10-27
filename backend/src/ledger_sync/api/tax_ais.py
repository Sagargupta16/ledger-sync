"""AIS totals saved per tax year, so /tax can show the TDS actually reported.

The browser decrypts and parses the AIS JSON itself; the PAN and date of birth
that form its password are never sent. ``PUT`` stores four totals for one tax
year ("2025-26"), ``GET`` reads one year or the list, and ``DELETE`` removes a
year. These are user records, not ledger data, so no write here touches
analytics.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Path
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.db.models import TaxAisSummary
from ledger_sync.schemas.tax_ais import (
    TaxAisSummaryList,
    TaxAisSummaryResponse,
    TaxAisSummaryUpdate,
    TaxYear,
)

router = APIRouter(prefix="/api/tax-ais", tags=["tax-ais"])

TaxYearPath = Annotated[TaxYear, Path(description="Tax year, such as 2025-26")]


def _row(db: Session, user_id: int, tax_year: str) -> TaxAisSummary | None:
    stmt = select(TaxAisSummary).where(
        TaxAisSummary.user_id == user_id, TaxAisSummary.tax_year == tax_year
    )
    return db.execute(stmt).scalar_one_or_none()


def _response(row: TaxAisSummary) -> TaxAisSummaryResponse:
    return TaxAisSummaryResponse(
        tax_year=row.tax_year,
        tds_salary=float(row.tds_salary),
        tds_other=float(row.tds_other),
        interest=float(row.interest),
        dividends=float(row.dividends),
        # Stored naive but holding UTC; attach the zone so browsers do not shift it.
        updated_at=row.updated_at.replace(tzinfo=UTC).isoformat(),
    )


def _apply(db: Session, user_id: int, tax_year: str, payload: TaxAisSummaryUpdate) -> TaxAisSummary:
    """Write the year's totals over any earlier import of the same year."""
    row = _row(db, user_id, tax_year)
    if row is None:
        row = TaxAisSummary(user_id=user_id, tax_year=tax_year)
        db.add(row)
    row.tds_salary = payload.tds_salary
    row.tds_other = payload.tds_other
    row.interest = payload.interest
    row.dividends = payload.dividends
    # Set explicitly: re-importing identical totals is still a new import.
    row.updated_at = datetime.now(UTC)
    return row


@router.get("")
def list_tax_ais_summaries(current_user: CurrentUser, db: DatabaseSession) -> TaxAisSummaryList:
    """Every tax year with saved AIS totals, newest first."""
    stmt = (
        select(TaxAisSummary)
        .where(TaxAisSummary.user_id == current_user.id)
        .order_by(TaxAisSummary.tax_year.desc())
    )
    return TaxAisSummaryList(summaries=[_response(row) for row in db.execute(stmt).scalars()])


@router.get("/{tax_year}")
def get_tax_ais_summary(
    tax_year: TaxYearPath, current_user: CurrentUser, db: DatabaseSession
) -> TaxAisSummaryResponse | None:
    """The year's saved totals, or null when no AIS was imported for it."""
    row = _row(db, current_user.id, tax_year)
    return _response(row) if row else None


@router.put("/{tax_year}")
def put_tax_ais_summary(
    tax_year: TaxYearPath,
    payload: TaxAisSummaryUpdate,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> TaxAisSummaryResponse:
    """Save the year's totals, replacing an earlier import of the same year."""
    row = _apply(db, current_user.id, tax_year, payload)
    try:
        db.commit()
    except IntegrityError:
        # A concurrent first import added the year; write ours over it.
        db.rollback()
        row = _apply(db, current_user.id, tax_year, payload)
        db.commit()
    return _response(row)


@router.delete("/{tax_year}", status_code=204)
def delete_tax_ais_summary(
    tax_year: TaxYearPath, current_user: CurrentUser, db: DatabaseSession
) -> None:
    """Remove the year's totals. Idempotent: a year with none is also a 204."""
    db.execute(
        delete(TaxAisSummary).where(
            TaxAisSummary.user_id == current_user.id, TaxAisSummary.tax_year == tax_year
        )
    )
    db.commit()
