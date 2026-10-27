"""Tax-convention rupee values for RSU vests, and sales and dividends of the shares.

Both tables are new rather than columns on ``rsu_vestings``: a deployment that
runs ahead of its migration then fails only the ``/api/rsu-tax`` routes.

``rsu_vest_fx`` records how one vest's perquisite becomes rupees. The employer's
reported figure governs when entered; otherwise the SBI telegraphic transfer
buying rate (TTBR) the user looked up, applied to the vest-date price per share;
otherwise the vest price the app already converted at the ECB reference rate.
``fx_source`` is derived from which of those is present on every write.

``foreign_asset_events`` holds user-entered sales (tied to the vest they came
from) and dividends (per stock, with the US tax withheld). Amounts are in the
stock's own trading currency, so the table stores none. Neither table feeds
the analytics rollups.

Tenancy: both tables reference ``rsu_vestings(id)`` alone, because that table
has no ``UNIQUE (user_id, id)`` for a composite key to point at. Every writer
checks that the vest belongs to the same user first (``owned_vesting``).
"""

from __future__ import annotations

from datetime import UTC, datetime
from datetime import date as calendar_date
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from ledger_sync.db._models._constants import USER_FK
from ledger_sync.db._models.compensation import CompensationDecimal
from ledger_sync.db.base import Base

FX_SOURCES = ("ecb", "sbi_ttbr", "employer")
EVENT_KINDS = ("sale", "dividend")
_VESTING_FK = "rsu_vestings.id"


def _utc_now() -> datetime:
    return datetime.now(UTC)


class RsuVestFx(Base):
    """Which exchange rate converts one vest's perquisite into rupees."""

    __tablename__ = "rsu_vest_fx"
    __table_args__ = (
        UniqueConstraint("vesting_id", name="uq_rsu_vest_fx_vesting"),
        Index("ix_rsu_vest_fx_user", "user_id"),
        CheckConstraint(
            "fx_source IN ('ecb', 'sbi_ttbr', 'employer')", name="ck_rsu_vest_fx_source"
        ),
        CheckConstraint(
            "fx_source <> 'employer' OR employer_perquisite_inr IS NOT NULL",
            name="ck_rsu_vest_fx_employer",
        ),
        CheckConstraint(
            "fx_source <> 'sbi_ttbr' OR "
            "(fx_rate IS NOT NULL AND fx_date IS NOT NULL AND quote_price IS NOT NULL)",
            name="ck_rsu_vest_fx_ttbr",
        ),
        CheckConstraint(
            "(fx_rate IS NULL OR fx_rate > 0) AND (quote_price IS NULL OR quote_price > 0) "
            "AND (employer_perquisite_inr IS NULL OR employer_perquisite_inr > 0)",
            name="ck_rsu_vest_fx_positive",
        ).ddl_if(dialect="postgresql"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(USER_FK, ondelete="CASCADE"))
    vesting_id: Mapped[str] = mapped_column(Text, ForeignKey(_VESTING_FK, ondelete="CASCADE"))
    fx_source: Mapped[str] = mapped_column(String(16))
    # Rupees per one unit of ``quote_currency``.
    fx_rate: Mapped[Decimal | None] = mapped_column(CompensationDecimal())
    # The rate card's date: the specified date or the last published day before it.
    fx_date: Mapped[calendar_date | None] = mapped_column(Date)
    # Fair market value per share on the vest date, in ``quote_currency``.
    quote_price: Mapped[Decimal | None] = mapped_column(CompensationDecimal())
    quote_currency: Mapped[str] = mapped_column(String(3), default="USD")
    # The perquisite for the whole gross vest, from Form 16 / 12BA or the payslip.
    employer_perquisite_inr: Mapped[Decimal | None] = mapped_column(CompensationDecimal())
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utc_now, onupdate=_utc_now)


class ForeignAssetEvent(Base):
    """A sale of shares from one vest, or a dividend on a stock, entered by the user."""

    __tablename__ = "foreign_asset_events"
    __table_args__ = (
        Index("ix_foreign_asset_events_user_date", "user_id", "event_date"),
        # Deleting a vest sets its sales' link to NULL; without this it scans the table.
        Index("ix_foreign_asset_events_vesting", "vesting_id"),
        CheckConstraint("kind IN ('sale', 'dividend')", name="ck_foreign_asset_events_kind"),
        CheckConstraint(
            "kind <> 'sale' OR quantity IS NOT NULL", name="ck_foreign_asset_events_sale_quantity"
        ),
        CheckConstraint(
            "gross_amount > 0 AND (quantity IS NULL OR quantity > 0) "
            "AND (tax_withheld IS NULL OR tax_withheld >= 0) AND (fx_rate IS NULL OR fx_rate > 0)",
            name="ck_foreign_asset_events_positive",
        ).ddl_if(dialect="postgresql"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(USER_FK, ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(16))
    # The vest (lot) a sale came from. A deleted vest leaves its sales unlinked.
    vesting_id: Mapped[str | None] = mapped_column(
        Text, ForeignKey(_VESTING_FK, ondelete="SET NULL")
    )
    symbol: Mapped[str] = mapped_column(Text)
    event_date: Mapped[calendar_date] = mapped_column(Date)
    quantity: Mapped[Decimal | None] = mapped_column(CompensationDecimal())
    # Sale proceeds or the gross dividend, before any tax, in the stock's currency.
    gross_amount: Mapped[Decimal] = mapped_column(CompensationDecimal())
    tax_withheld: Mapped[Decimal | None] = mapped_column(CompensationDecimal())
    # A user-entered SBI TTBR; without one the reports use the ECB rate (approximation).
    fx_rate: Mapped[Decimal | None] = mapped_column(CompensationDecimal())
    fx_date: Mapped[calendar_date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utc_now)
