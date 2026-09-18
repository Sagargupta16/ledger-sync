"""Normalized compensation with exact decimals on PostgreSQL and SQLite."""

from __future__ import annotations

from datetime import date as calendar_date
from decimal import Decimal
from typing import Any
from uuid import uuid4

from sqlalchemy import (
    CheckConstraint,
    Date,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    Numeric,
    Text,
    UniqueConstraint,
)
from sqlalchemy.engine import Dialect
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import TypeDecorator

from ledger_sync.db.base import Base


class CompensationDecimal(TypeDecorator[Decimal]):
    """Unscaled NUMERIC in PostgreSQL; decimal text in SQLite.

    SQLite NUMERIC affinity converts decimal strings to binary floats before
    SQLAlchemy reads them. TEXT avoids that conversion, including for fractional
    share quantities. Never quantize these values to currency minor units.
    """

    impl = Numeric
    cache_ok = True

    def load_dialect_impl(self, dialect: Dialect) -> Any:
        return dialect.type_descriptor(Text() if dialect.name == "sqlite" else Numeric())

    def process_bind_param(self, value: Any, dialect: Dialect) -> Any:
        if value is None:
            return None
        decimal = Decimal(str(value))
        if not decimal.is_finite():
            raise ValueError("Compensation values must be finite decimals.")
        return str(decimal) if dialect.name == "sqlite" else decimal

    def process_result_value(self, value: Any, dialect: Dialect) -> Decimal | None:
        return None if value is None else Decimal(str(value))


class SalaryPlan(Base):
    """One complete SalaryComponents record for an owner's fiscal year."""

    __tablename__ = "salary_plans"
    __table_args__ = (
        UniqueConstraint("user_id", "fiscal_year", name="uq_salary_plans_user_fiscal_year"),
        CheckConstraint("position >= 0", name="ck_salary_plans_position"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    fiscal_year: Mapped[str] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer, default=0)
    base_salary_annual: Mapped[Decimal] = mapped_column(CompensationDecimal(), default=Decimal(0))
    hra_annual: Mapped[Decimal | None] = mapped_column(CompensationDecimal())
    bonus_annual: Mapped[Decimal] = mapped_column(CompensationDecimal(), default=Decimal(0))
    epf_monthly: Mapped[Decimal] = mapped_column(CompensationDecimal(), default=Decimal(3600))
    nps_monthly: Mapped[Decimal] = mapped_column(CompensationDecimal(), default=Decimal(0))
    special_allowance_annual: Mapped[Decimal] = mapped_column(
        CompensationDecimal(), default=Decimal(0)
    )
    other_taxable_annual: Mapped[Decimal] = mapped_column(CompensationDecimal(), default=Decimal(0))


class RsuGrantRecord(Base):
    """A grant's public ID is stable and unique within its owner."""

    __tablename__ = "rsu_grants"
    __table_args__ = (
        UniqueConstraint("user_id", "public_id", name="uq_rsu_grants_user_public_id"),
        UniqueConstraint("user_id", "id", name="uq_rsu_grants_user_id"),
        CheckConstraint("position >= 0", name="ck_rsu_grants_position"),
        CheckConstraint(
            "stock_price > 0 AND stock_price < CAST('Infinity' AS NUMERIC)",
            name="ck_rsu_grants_stock_price",
        ).ddl_if(dialect="postgresql"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    public_id: Mapped[str] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer)
    stock_name: Mapped[str] = mapped_column(Text)
    stock_price: Mapped[Decimal] = mapped_column(CompensationDecimal())
    grant_date: Mapped[calendar_date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)


class RsuVestingRecord(Base):
    """An independently identified event, including identical repeated vestings."""

    __tablename__ = "rsu_vestings"
    __table_args__ = (
        ForeignKeyConstraint(
            ["user_id", "grant_id"],
            ["rsu_grants.user_id", "rsu_grants.id"],
            name="fk_rsu_vestings_owner_grant",
            ondelete="CASCADE",
        ),
        Index("ix_rsu_vestings_user_grant_position", "user_id", "grant_id", "position"),
        CheckConstraint("position >= 0", name="ck_rsu_vestings_position"),
        CheckConstraint("quantity > 0", name="ck_rsu_vestings_quantity"),
        CheckConstraint(
            "price_at_vest IS NULL OR "
            "(price_at_vest > 0 AND price_at_vest < CAST('Infinity' AS NUMERIC))",
            name="ck_rsu_vestings_price",
        ).ddl_if(dialect="postgresql"),
        CheckConstraint(
            "net_quantity IS NULL OR (net_quantity >= 0 AND net_quantity <= quantity)",
            name="ck_rsu_vestings_net_quantity",
        ).ddl_if(dialect="postgresql"),
    )

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    grant_id: Mapped[int] = mapped_column(Integer)
    position: Mapped[int] = mapped_column(Integer)
    date: Mapped[calendar_date] = mapped_column(Date)
    quantity: Mapped[int] = mapped_column(Integer)
    price_at_vest: Mapped[Decimal | None] = mapped_column(CompensationDecimal())
    net_quantity: Mapped[Decimal | None] = mapped_column(CompensationDecimal())
