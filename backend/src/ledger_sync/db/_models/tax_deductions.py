"""Old-regime deduction amounts a user saved for one tax year."""

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


class TaxDeduction(Base):
    """One section's amount, such as 80C, for one owner and tax year ("2026-27").

    Section keys are the 1961 Act names the /tax page has always used; from Tax
    Year 2026-27 the page shows the Income-tax Act 2025 number beside them. Only
    positive amounts are stored: saving zero for a section removes its row.
    These are user inputs to a client-side estimate, not analytics inputs.
    """

    __tablename__ = "tax_deductions"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "tax_year", "section_key", name="uq_tax_deductions_user_year_section"
        ),
        CheckConstraint("amount > 0", name="ck_tax_deductions_amount_positive"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(USER_FK, ondelete="CASCADE"), nullable=False)
    tax_year: Mapped[str] = mapped_column(String(7), nullable=False)
    section_key: Mapped[str] = mapped_column(String(16), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )
