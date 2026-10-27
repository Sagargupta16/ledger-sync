"""What the bank or card said an account held at the end of a day.

A balance check is the user's own reading of a statement or banking app ("HDFC
says 52,340.50 on 20 Oct"). Nothing here stores the ledger's figure: every read
recomputes the running balance for that account and day, so a re-import that
changes old rows moves the verdict with it. The account is the exact label the
transactions carry, the same name every other per-account view groups by.
"""

from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ledger_sync.db._models._constants import USER_FK
from ledger_sync.db.base import Base


class BalanceCheck(Base):
    """One account balance read off a bank or card, for one day."""

    __tablename__ = "balance_checks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(USER_FK, ondelete="CASCADE"), nullable=False)
    # Matched against transactions.account, from_account and to_account exactly.
    account: Mapped[str] = mapped_column(String(255), nullable=False)
    # Compared with the ledger at the END of this IST day, that day's rows included.
    check_date: Mapped[date] = mapped_column(Date, nullable=False)
    # Signed INR as the ledger shows it: card dues and overdrafts are negative.
    balance: Mapped[Decimal] = mapped_column(Numeric(precision=15, scale=2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    # One check per account per day, so "the latest check" is never ambiguous.
    # Its index leads with user_id, which serves every read here.
    __table_args__ = (
        UniqueConstraint(
            "user_id", "account", "check_date", name="uq_balance_checks_user_account_date"
        ),
    )
