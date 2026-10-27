"""Database reads and writes for CAS holdings.

Every query filters by ``user_id``. Callers own the session: each function runs
inside one worker phase and commits its own writes. The AMFI NAV cache that
values these holdings lives in ``core/mf_nav_store.py``.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from collections.abc import Iterator, Sequence
from dataclasses import dataclass
from datetime import date, datetime

import sqlalchemy as sa
from sqlalchemy.orm import Session

from ledger_sync.core.amfi_nav import utc_now
from ledger_sync.core.cas_records import (
    DEPOSITORY_SOURCES,
    RTA_SOURCES,
    CasHolding,
    CasTransaction,
    ParsedCas,
)
from ledger_sync.core.mf_valuation import Position, fifo_cost
from ledger_sync.db.models import MfHolding, MfTransaction, User

type _Imported = tuple[MfHolding, tuple[CasTransaction, ...]]


@dataclass(frozen=True, slots=True)
class ImportRecord:
    source: str
    cas_type: str | None
    statement_from: date | None
    statement_to: date | None
    imported_at: datetime
    schemes: int


def replace_holdings(db: Session, user_id: int, parsed: ParsedCas) -> int:
    """Swap the user's holdings from this kind of issuer for the parsed ones.

    A CAMS or KFintech CAS replaces earlier CAMS/KFintech imports; an NSDL or
    CDSL CAS replaces earlier depository imports. Returns how many holdings went.
    """
    # Serialise this user's imports; the row lock is held until the commit below.
    db.execute(sa.select(User.id).where(User.id == user_id).with_for_update())
    family = RTA_SOURCES if parsed.source in RTA_SOURCES else DEPOSITORY_SOURCES
    replaced = _delete_family(db, user_id, family)
    imported_at = utc_now()
    imported: list[_Imported] = [
        (_holding_record(user_id, parsed, item, imported_at), item.transactions)
        for item in parsed.holdings
    ]
    db.add_all(record for record, _ in imported)
    db.flush()  # assigns the holding ids the transaction rows point at
    db.add_all(_transaction_records(user_id, imported))
    db.commit()
    return replaced


def _delete_family(db: Session, user_id: int, family: frozenset[str]) -> int:
    """Delete the user's holdings from these issuers, rows first; how many holdings went."""
    scope = (MfHolding.user_id == user_id, MfHolding.source.in_(family))
    held = sa.select(MfHolding.id).where(*scope)
    replaced = db.scalar(sa.select(sa.func.count()).select_from(MfHolding).where(*scope)) or 0
    db.execute(
        sa.delete(MfTransaction).where(
            MfTransaction.user_id == user_id, MfTransaction.holding_id.in_(held)
        )
    )
    db.execute(sa.delete(MfHolding).where(*scope))
    return replaced


def _holding_record(
    user_id: int, parsed: ParsedCas, item: CasHolding, imported_at: datetime
) -> MfHolding:
    cost = item.cost
    if cost is None and item.open_units == 0 and item.transactions:
        cost = fifo_cost(item.transactions)
    return MfHolding(
        user_id=user_id,
        source=parsed.source,
        cas_type=parsed.cas_type,
        folio=item.folio,
        amc=item.amc,
        scheme_name=item.scheme_name,
        isin=item.isin,
        amfi_code=item.amfi_code,
        scheme_type=item.scheme_type,
        open_units=item.open_units,
        units=item.units,
        cost=cost,
        statement_nav=item.nav,
        statement_nav_date=item.nav_date,
        statement_from=parsed.statement_from,
        statement_to=parsed.statement_to,
        imported_at=imported_at,
    )


def _transaction_records(user_id: int, imported: Sequence[_Imported]) -> Iterator[MfTransaction]:
    for record, rows in imported:
        for sequence, row in enumerate(rows):
            yield MfTransaction(
                holding_id=record.id,
                user_id=user_id,
                sequence=sequence,
                txn_date=row.txn_date,
                txn_type=row.txn_type,
                amount=row.amount,
                units=row.units,
                nav=row.nav,
                balance=row.balance,
            )


def load_positions(db: Session, user_id: int) -> tuple[list[Position], list[ImportRecord]]:
    """The user's holdings with their rows, and one import record per issuer."""
    holdings = db.scalars(
        sa.select(MfHolding).where(MfHolding.user_id == user_id).order_by(MfHolding.id)
    ).all()
    rows = _rows_by_holding(db, user_id)
    positions = [_position(holding, rows.get(holding.id, ())) for holding in holdings]
    return positions, _import_records(holdings)


def _rows_by_holding(db: Session, user_id: int) -> dict[int, tuple[CasTransaction, ...]]:
    query = (
        sa.select(MfTransaction)
        .where(MfTransaction.user_id == user_id)
        .order_by(MfTransaction.holding_id, MfTransaction.sequence)
    )
    grouped: dict[int, list[CasTransaction]] = defaultdict(list)
    for row in db.scalars(query):
        grouped[row.holding_id].append(
            CasTransaction(row.txn_date, row.txn_type, row.amount, row.units, row.nav, row.balance)
        )
    return {holding_id: tuple(rows) for holding_id, rows in grouped.items()}


def _position(holding: MfHolding, rows: tuple[CasTransaction, ...]) -> Position:
    return Position(
        id=holding.id,
        source=holding.source,
        cas_type=holding.cas_type,
        folio=holding.folio,
        amc=holding.amc,
        scheme_name=holding.scheme_name,
        isin=holding.isin,
        amfi_code=holding.amfi_code,
        scheme_type=holding.scheme_type,
        open_units=holding.open_units,
        units=holding.units,
        cost=holding.cost,
        statement_nav=holding.statement_nav,
        statement_nav_date=holding.statement_nav_date,
        transactions=rows,
    )


def _import_records(holdings: Sequence[MfHolding]) -> list[ImportRecord]:
    """One import per issuer: every holding of an import shares its period and time."""
    counts = Counter(holding.source for holding in holdings)
    sample = {holding.source: holding for holding in holdings}
    return [
        ImportRecord(
            source=source,
            cas_type=sample[source].cas_type,
            statement_from=sample[source].statement_from,
            statement_to=sample[source].statement_to,
            imported_at=sample[source].imported_at,
            schemes=count,
        )
        for source, count in counts.items()
    ]
