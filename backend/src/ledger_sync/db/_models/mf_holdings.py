"""Mutual-fund holdings imported from a CAS PDF, and the AMFI NAV cache that values them.

A CAMS or KFintech CAS (Consolidated Account Statement) lists folios, schemes and
dated transactions. An NSDL or CDSL CAS lists demat and folio holdings with no
transactions. A new import replaces the user's holdings from the same kind of
issuer (CAMS/KFintech, or NSDL/CDSL), so the two kinds can sit side by side.

Nothing here keeps the PDF, its password, the PAN or the investor's name, email,
address or phone: only what valuation and XIRR need.
"""

from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from ledger_sync.db._models._constants import USER_FK
from ledger_sync.db.base import Base


class MfHolding(Base):
    """One scheme in one folio, as the statement printed it."""

    __tablename__ = "mf_holdings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(USER_FK, ondelete="CASCADE"), nullable=False)
    # The statement's issuer: CAMS, KFINTECH, NSDL or CDSL.
    source: Mapped[str] = mapped_column(String(16), nullable=False)
    # DETAILED or SUMMARY for a CAMS/KFintech CAS; null for a depository CAS.
    cas_type: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # Null for units held in a demat account, which have no folio.
    folio: Mapped[str | None] = mapped_column(String(64), nullable=True)
    amc: Mapped[str | None] = mapped_column(String(255), nullable=True)
    scheme_name: Mapped[str] = mapped_column(String(500), nullable=False)
    isin: Mapped[str | None] = mapped_column(String(12), nullable=True)
    # AMFI scheme code, the first column of NAVAll.txt.
    amfi_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # EQUITY, DEBT and so on, from casparser's ISIN database.
    scheme_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # Units on the statement's first day. Above zero, the transactions do not reach
    # back to the first purchase, so they cannot give an XIRR. Null when the
    # statement prints no opening balance (a depository CAS).
    open_units: Mapped[Decimal | None] = mapped_column(Numeric(20, 6), nullable=True)
    units: Mapped[Decimal] = mapped_column(Numeric(20, 6), nullable=False)
    # Cost of the units still held: the statement's own figure, else FIFO over
    # the transactions when they start from zero units.
    cost: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True)
    statement_nav: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    statement_nav_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    statement_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    statement_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    imported_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(UTC)
    )

    __table_args__ = (Index("ix_mf_holdings_user_source", "user_id", "source"),)


class MfTransaction(Base):
    """One dated row of a holding's CAMS/KFintech statement."""

    __tablename__ = "mf_transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    holding_id: Mapped[int] = mapped_column(
        ForeignKey("mf_holdings.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[int] = mapped_column(ForeignKey(USER_FK, ondelete="CASCADE"), nullable=False)
    # Statement order within the holding; same-day rows keep their printed order.
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    txn_date: Mapped[date] = mapped_column(Date, nullable=False)
    # casparser's TransactionType name: PURCHASE_SIP, REDEMPTION, STAMP_DUTY_TAX...
    txn_type: Mapped[str] = mapped_column(String(32), nullable=False)
    # Signed as printed: purchases positive, redemptions negative. Null on rows
    # that move no money.
    amount: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True)
    units: Mapped[Decimal | None] = mapped_column(Numeric(20, 6), nullable=True)
    nav: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    # Running unit balance after this row.
    balance: Mapped[Decimal | None] = mapped_column(Numeric(20, 6), nullable=True)

    __table_args__ = (
        UniqueConstraint("holding_id", "sequence", name="uq_mf_transactions_holding_sequence"),
        Index("ix_mf_transactions_user", "user_id"),
    )


class MfNavPrice(Base):
    """The latest AMFI NAV for one lookup key a held scheme uses.

    Public AMFI data, not user data: one row per key that some holding asked
    for, refreshed at most once a day (see core/amfi_nav.py).
    """

    __tablename__ = "mf_nav_prices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # "isin:INF179K01VY8" or "code:118834". A holding tries its ISIN, then its code.
    lookup_key: Mapped[str] = mapped_column(String(40), nullable=False)
    scheme_code: Mapped[str | None] = mapped_column(String(16), nullable=True)
    scheme_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Null when the key was looked for and the AMFI file did not list it.
    nav: Mapped[Decimal | None] = mapped_column(Numeric(18, 6), nullable=True)
    nav_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # When a downloaded file was last searched for this key (naive UTC).
    checked_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    # The upsert in core/mf_nav_store.py conflicts on this key.
    __table_args__ = (UniqueConstraint("lookup_key", name="uq_mf_nav_prices_lookup_key"),)
