"""Plain records for a parsed CAS, built from casparser's models without investor details.

casparser returns pydantic models that carry the investor's name, email, address,
phone and every folio's PAN. These records keep only what valuation and XIRR use,
so nothing personal can reach the database or a response by accident.
"""

from __future__ import annotations

from collections.abc import Iterable, Iterator
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from ledger_sync.core.amfi_nav import ISIN_RE

# A statement's issuer, as casparser names it. The registrars CAMS and KFintech
# print folios with dated rows; the depositories NSDL and CDSL print demat holdings.
RTA_SOURCES = frozenset({"CAMS", "KFINTECH"})
DEPOSITORY_SOURCES = frozenset({"NSDL", "CDSL"})
_DATE_FORMATS = ("%Y-%m-%d", "%d-%b-%Y", "%d-%B-%Y", "%d-%m-%Y", "%d/%m/%Y", "%d %b %Y")


@dataclass(frozen=True, slots=True)
class CasTransaction:
    """One dated statement row. Amounts are signed as printed."""

    txn_date: date
    txn_type: str
    amount: Decimal | None
    units: Decimal | None
    nav: Decimal | None
    balance: Decimal | None


@dataclass(frozen=True, slots=True)
class CasHolding:
    """One scheme in one folio (or demat account)."""

    folio: str | None
    amc: str | None
    scheme_name: str
    isin: str | None
    amfi_code: str | None
    scheme_type: str | None
    open_units: Decimal | None
    units: Decimal
    cost: Decimal | None
    nav: Decimal | None
    nav_date: date | None
    transactions: tuple[CasTransaction, ...] = ()


@dataclass(frozen=True, slots=True)
class ParsedCas:
    source: str
    cas_type: str | None
    statement_from: date | None
    statement_to: date | None
    folios: int
    holdings: tuple[CasHolding, ...]
    warnings: tuple[str, ...]


def enum_name(value: Any) -> str:
    """An enum's value, or the string casparser already stored."""
    return str(getattr(value, "value", value))


def _text(value: Any, limit: int) -> str | None:
    text = " ".join(str(value).split()) if value is not None else ""
    return text[:limit] or None


def _decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    try:
        number = Decimal(str(value))
    except InvalidOperation:
        return None
    return number if number.is_finite() else None


def _isin(value: Any) -> str | None:
    text = str(value or "").strip().upper()
    return text if ISIN_RE.match(text) else None


def as_date(value: Any) -> date | None:
    """A date from casparser's date, ISO string or ``DD-Mon-YYYY`` statement text."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value or "").strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).replace(tzinfo=UTC).date()
        except ValueError:
            continue
    return None


def _transactions(rows: Iterable[Any]) -> Iterator[CasTransaction]:
    for row in rows:
        txn_date = as_date(row.date)
        if txn_date is not None:
            yield CasTransaction(
                txn_date=txn_date,
                txn_type=enum_name(row.type)[:32],
                amount=_decimal(row.amount),
                units=_decimal(row.units),
                nav=_decimal(row.nav),
                balance=_decimal(row.balance),
            )


def rta_holdings(data: Any) -> list[CasHolding]:
    """CAMS/KFintech folios. Each folio's PAN, KYC flags and holder name are dropped."""
    holdings: list[CasHolding] = []
    for folio in data.folios:
        for scheme in folio.schemes:
            valuation = scheme.valuation
            holdings.append(
                CasHolding(
                    folio=_text(folio.folio, 64),
                    amc=_text(folio.amc, 255),
                    scheme_name=_text(scheme.scheme, 500) or "Unnamed scheme",
                    isin=_isin(scheme.isin),
                    amfi_code=_text(scheme.amfi, 16),
                    scheme_type=_text(scheme.type, 32),
                    open_units=_decimal(scheme.open),
                    units=_decimal(scheme.close) or Decimal(0),
                    cost=_decimal(valuation.cost),
                    nav=_decimal(valuation.nav),
                    nav_date=as_date(valuation.date),
                    transactions=tuple(_transactions(scheme.transactions)),
                )
            )
    return holdings


def demat_holdings(data: Any, statement_to: date | None) -> list[CasHolding]:
    """NSDL/CDSL mutual-fund rows. Equities, bonds and NPS are not imported."""
    return [
        CasHolding(
            folio=_text(fund.folio, 64),
            amc=None,
            scheme_name=_text(fund.name, 500) or str(fund.isin),
            isin=_isin(fund.isin),
            amfi_code=_text(fund.amfi, 16),
            scheme_type=_text(fund.type, 32),
            open_units=None,
            units=_decimal(fund.balance) or Decimal(0),
            cost=_decimal(fund.total_cost),
            nav=_decimal(fund.nav),
            nav_date=statement_to,
        )
        for account in data.accounts
        for fund in account.mutual_funds
    ]
