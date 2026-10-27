"""Per-tax-year totals a user imported from their AIS (Annual Information Statement).

The AIS JSON is decrypted and parsed in the browser. The PAN and date of birth
that make up its password never reach the server, and neither does any AIS
row: only four totals per tax year arrive here. They are user records that let
/tax show the TDS actually reported, not ledger data, so nothing here feeds
analytics.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from ledger_sync.db._models._constants import USER_FK
from ledger_sync.db.base import Base


class TaxAisSummary(Base):
    """One owner's AIS totals for one tax year ("2025-26": April 2025 to March 2026).

    ``tds_salary`` is TDS under section 192, ``tds_other`` every other TDS row
    (TCS excluded), and ``interest`` / ``dividends`` the gross amounts after the
    browser drops lines that one payer reported twice (SFT and TDS). Importing
    the same year again replaces the row.
    """

    __tablename__ = "tax_ais_summaries"
    __table_args__ = (
        UniqueConstraint("user_id", "tax_year", name="uq_tax_ais_summaries_user_year"),
        CheckConstraint(
            "tds_salary >= 0 AND tds_other >= 0 AND interest >= 0 AND dividends >= 0",
            name="ck_tax_ais_summaries_amounts_non_negative",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(USER_FK, ondelete="CASCADE"), nullable=False)
    tax_year: Mapped[str] = mapped_column(String(7), nullable=False)
    tds_salary: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=False)
    tds_other: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=False)
    interest: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=False)
    dividends: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
