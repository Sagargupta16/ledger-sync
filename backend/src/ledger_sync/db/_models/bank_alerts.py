"""Bank alerts (SMS or email) that check whether Money Manager has every spend.

An alert is never a ledger row. A full Money Manager snapshot soft-deletes any
stored row the backup lacks, a hand-added one included, so alerts live in their
own table and are matched against the ledger whenever they are read.

Only what matching and display need is kept. The raw text is not stored:
``text_hash`` (SHA-256 of the normalised text and the alert's day) makes a
retried delivery a no-op, ``ref_hash`` (SHA-256 of the bank's reference and the
amount, left NULL for a short, all-zero or masked reference) folds the SMS and
email copies of one payment into one alert, and the account survives only as
its last four digits. The balance most alerts quote is never read.
``core/bank_alert_store.py`` computes both hashes.
"""

from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint,
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


def _utc_now() -> datetime:
    """Naive UTC, like the other audit timestamps."""
    return datetime.now(UTC).replace(tzinfo=None)


class BankAlert(Base):
    """One parsed debit or credit alert for one user."""

    __tablename__ = "bank_alerts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(USER_FK, ondelete="CASCADE"), nullable=False)
    text_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    ref_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    direction: Mapped[str] = mapped_column(String(6), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=False)
    account_tail: Mapped[str | None] = mapped_column(String(4), nullable=True)
    # A display label for the payee; digit runs of six or more are masked.
    merchant: Mapped[str | None] = mapped_column(String(60), nullable=True)
    # bank_alert_profiles key, e.g. "hdfc".
    bank: Mapped[str | None] = mapped_column(String(16), nullable=True)
    # The IST day the alert says the money moved (or the day it arrived).
    occurred_on: Mapped[date] = mapped_column(Date, nullable=False)
    received_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now)
    ignored_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        UniqueConstraint("user_id", "text_hash", name="uq_bank_alerts_user_text_hash"),
        # NULL references are distinct, so only alerts that carry one fold together.
        UniqueConstraint("user_id", "direction", "ref_hash", name="uq_bank_alerts_user_ref"),
        Index("ix_bank_alerts_user_occurred_on", "user_id", "occurred_on"),
        CheckConstraint("direction IN ('debit', 'credit')", name="ck_bank_alerts_direction"),
        CheckConstraint(
            "amount > 0 AND amount <= 9999999999999.99", name="ck_bank_alerts_amount_bounds"
        ),
    )
