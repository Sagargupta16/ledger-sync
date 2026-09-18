"""Copy compensation JSON into owner-scoped, independently identified records.

Revision ID: compensation_records_2026
Revises: ai_settings_2026
Create Date: 2026-09-18 12:00:00

Validation and table definitions are frozen here: never import runtime models or
schemas. Preflight every source before DDL. Unknown keys, duplicate JSON keys,
duplicate grant/event IDs, invalid dates/quantities and nonfinite decimals fail
closed. Repeated equal vestings are legitimate and are copied in source order.
Legacy columns remain for the coordinated final migration.
"""

from __future__ import annotations

import json
import re
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import NAMESPACE_URL, uuid5

import sqlalchemy as sa
from alembic import op

from ledger_sync.db.migrations.safety import irreversible

revision = "compensation_records_2026"
down_revision = "ai_settings_2026"
branch_labels = None
depends_on = None

_SALARY_DEFAULTS = {
    "base_salary_annual": "0",
    "hra_annual": None,
    "bonus_annual": "0",
    "epf_monthly": "3600",
    "nps_monthly": "0",
    "special_allowance_annual": "0",
    "other_taxable_annual": "0",
}
_GRANT_FIELDS = {"id", "stock_name", "stock_price", "grant_date", "notes", "vestings"}
_VESTING_FIELDS = {"id", "date", "quantity", "price_at_vest", "net_quantity"}


def _object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON object key.")
        result[key] = value
    return result


def _constant(value: str) -> None:
    raise ValueError("Nonfinite JSON number.")


def _json(raw: Any, expected: type) -> Any:
    if not isinstance(raw, str):
        raise ValueError("Expected a JSON text column, not null.")
    value = json.loads(
        raw, parse_float=Decimal, object_pairs_hook=_object, parse_constant=_constant
    )
    if not isinstance(value, expected):
        raise ValueError(f"Expected a JSON {expected.__name__}.")
    return value


def _fields(value: Any, allowed: set[str]) -> dict[str, Any]:
    if not isinstance(value, dict) or set(value) - allowed:
        raise ValueError("Expected an object containing only recognized compensation fields.")
    return value


def _decimal(value: Any, *, nullable: bool = False) -> Decimal | None:
    if value is None and nullable:
        return None
    if isinstance(value, bool) or not isinstance(value, (str, int, Decimal)):
        raise ValueError("Expected a finite decimal.")
    try:
        result = Decimal(value)
    except InvalidOperation as exc:
        raise ValueError("Invalid decimal.") from exc
    if not result.is_finite():
        raise ValueError("Nonfinite decimal.")
    # Unconstrained PostgreSQL NUMERIC still has these documented storage limits.
    # Refuse values it cannot represent instead of rounding a negative exponent.
    exponent = result.as_tuple().exponent
    if exponent < -16383 or result.adjusted() >= 131072:
        raise ValueError("Decimal exceeds exact PostgreSQL NUMERIC storage limits.")
    return result


def _date(value: Any, *, nullable: bool = False) -> date | None:
    if value is None and nullable:
        return None
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError("Expected an ISO calendar date.")
    return date.fromisoformat(value)


def _text(value: Any, *, nullable: bool = False, nonempty: bool = False) -> str | None:
    if value is None and nullable:
        return None
    if not isinstance(value, str) or (nonempty and not value) or "\x00" in value:
        raise ValueError("Expected valid text.")
    return value


def _salary_rows(user_id: int, raw: Any) -> list[dict[str, Any]]:
    rows = []
    for position, (fiscal_year, components) in enumerate(_json(raw, dict).items()):
        if (
            not re.fullmatch(r"[0-9]{4}-[0-9]{2}", fiscal_year)
            or int(fiscal_year[-2:]) != (int(fiscal_year[:4]) + 1) % 100
        ):
            raise ValueError("Invalid fiscal year; expected YYYY-YY for consecutive years.")
        values = _fields(components, set(_SALARY_DEFAULTS))
        rows.append(
            {
                "user_id": user_id,
                "fiscal_year": fiscal_year,
                "position": position,
                **{
                    field: _decimal(values.get(field, default), nullable=field == "hra_annual")
                    for field, default in _SALARY_DEFAULTS.items()
                },
            }
        )
    return rows


def _vesting_row(
    value: Any, owner: tuple[int, str], position: int, used_ids: set[str]
) -> dict[str, Any]:
    value = _fields(value, _VESTING_FIELDS)
    quantity = _decimal(value.get("quantity"))
    if quantity is None or quantity <= 0 or quantity != quantity.to_integral_value():
        raise ValueError("Vesting quantity must be a positive integer.")
    if quantity > 2147483647:
        raise ValueError("Vesting quantity exceeds PostgreSQL INTEGER capacity.")
    net = _decimal(value.get("net_quantity"), nullable=True)
    price = _decimal(value.get("price_at_vest"), nullable=True)
    if net is not None and not 0 <= net <= quantity:
        raise ValueError("Vesting net quantity must be between zero and gross quantity.")
    if price is not None and price <= 0:
        raise ValueError("Vesting price must be positive or unknown.")
    event_id = value.get("id")
    if event_id is None:
        event_id = str(
            uuid5(NAMESPACE_URL, "ledger-sync/compensation/" + json.dumps([*owner, position]))
        )
    event_id = _text(event_id, nonempty=True)
    if event_id in used_ids:
        raise ValueError("Duplicate vesting ID.")
    used_ids.add(event_id)
    return {
        "id": event_id,
        "user_id": owner[0],
        "public_grant_id": owner[1],
        "position": position,
        "date": _date(value.get("date")),
        "quantity": int(quantity),
        "price_at_vest": price,
        "net_quantity": net,
    }


def _grant_rows(
    user_id: int, raw: Any, used_ids: set[str]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    grants, vestings = [], []
    public_ids: set[str] = set()
    for position, value in enumerate(_json(raw, list)):
        value = _fields(value, _GRANT_FIELDS)
        public_id = _text(value.get("id"), nonempty=True)
        if public_id in public_ids:
            raise ValueError("Duplicate public grant ID within an owner.")
        public_ids.add(public_id)
        price = _decimal(value.get("stock_price"))
        if price is None or price <= 0:
            raise ValueError("Grant stock price must be positive.")
        schedule = value.get("vestings")
        if not isinstance(schedule, list) or not schedule:
            raise ValueError("A grant must have a nonempty vesting list.")
        grants.append(
            {
                "user_id": user_id,
                "public_id": public_id,
                "position": position,
                "stock_name": _text(value.get("stock_name"), nonempty=True),
                "stock_price": price,
                "grant_date": _date(value.get("grant_date"), nullable=True),
                "notes": _text(value.get("notes"), nullable=True),
            }
        )
        vestings.extend(
            _vesting_row(event, (user_id, public_id), index, used_ids)
            for index, event in enumerate(schedule)
        )
    return grants, vestings


def _preflight(bind: sa.Connection) -> tuple[list[Any], list[Any], list[Any]]:
    salary, grants, vestings = [], [], []
    owners: set[int] = set()
    used_ids: set[str] = set()
    for row in bind.execute(
        sa.text(
            "SELECT p.id, p.user_id, p.salary_structure, p.rsu_grants, u.id AS owner_id "
            "FROM user_preferences p LEFT JOIN users u ON u.id=p.user_id ORDER BY p.id"
        )
    ).mappings():
        try:
            # Early bootstrap migrations seeded one ownerless defaults row.
            # It carries no compensation to attribute; never infer an owner.
            if (
                row["user_id"] is None
                and row["salary_structure"] == "{}"
                and row["rsu_grants"] == "[]"
            ):
                continue
            if row["owner_id"] is None or row["user_id"] in owners:
                raise ValueError("Missing or ambiguous preference owner.")
            owners.add(row["user_id"])
            salary.extend(_salary_rows(row["user_id"], row["salary_structure"]))
            new_grants, new_vestings = _grant_rows(row["user_id"], row["rsu_grants"], used_ids)
            grants.extend(new_grants)
            vestings.extend(new_vestings)
        except (ValueError, TypeError, KeyError) as exc:
            # Log only row identity and the rule; never dump salary or grant data.
            raise RuntimeError(
                f"Compensation preflight failed at preference ID {row['id']}: {exc} "
                "No compensation tables were created. Resolve the source explicitly; "
                "no rounding, field dropping or automatic repair is performed."
            ) from exc
    return salary, grants, vestings


def _create_tables(bind: sa.Connection) -> tuple[sa.Table, sa.Table, sa.Table]:
    numeric = sa.Text() if bind.dialect.name == "sqlite" else sa.Numeric()
    salary = op.create_table(
        "salary_plans",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("fiscal_year", sa.Text(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        *(sa.Column(field, numeric, nullable=field == "hra_annual") for field in _SALARY_DEFAULTS),
        sa.UniqueConstraint("user_id", "fiscal_year", name="uq_salary_plans_user_fiscal_year"),
        sa.CheckConstraint("position >= 0", name="ck_salary_plans_position"),
    )
    grants = op.create_table(
        "rsu_grants",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("public_id", sa.Text(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("stock_name", sa.Text(), nullable=False),
        sa.Column("stock_price", numeric, nullable=False),
        sa.Column("grant_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.UniqueConstraint("user_id", "public_id", name="uq_rsu_grants_user_public_id"),
        sa.UniqueConstraint("user_id", "id", name="uq_rsu_grants_user_id"),
        sa.CheckConstraint("position >= 0", name="ck_rsu_grants_position"),
        *(
            [
                sa.CheckConstraint(
                    "stock_price > 0 AND stock_price < CAST('Infinity' AS NUMERIC)",
                    name="ck_rsu_grants_stock_price",
                )
            ]
            if bind.dialect.name == "postgresql"
            else []
        ),
    )
    vestings = op.create_table(
        "rsu_vestings",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column(
            "user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("grant_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("price_at_vest", numeric, nullable=True),
        sa.Column("net_quantity", numeric, nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id", "grant_id"],
            ["rsu_grants.user_id", "rsu_grants.id"],
            name="fk_rsu_vestings_owner_grant",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint("position >= 0", name="ck_rsu_vestings_position"),
        sa.CheckConstraint("quantity > 0", name="ck_rsu_vestings_quantity"),
        *(
            [
                sa.CheckConstraint(
                    "price_at_vest IS NULL OR "
                    "(price_at_vest > 0 AND price_at_vest < CAST('Infinity' AS NUMERIC))",
                    name="ck_rsu_vestings_price",
                ),
                sa.CheckConstraint(
                    "net_quantity IS NULL OR (net_quantity >= 0 AND net_quantity <= quantity)",
                    name="ck_rsu_vestings_net_quantity",
                ),
            ]
            if bind.dialect.name == "postgresql"
            else []
        ),
    )
    op.create_index(
        "ix_rsu_vestings_user_grant_position", "rsu_vestings", ["user_id", "grant_id", "position"]
    )
    return salary, grants, vestings


def upgrade() -> None:
    if op.get_context().as_sql:
        raise RuntimeError("Compensation backfill requires an online validation connection.")
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        bind.exec_driver_sql("LOCK TABLE users IN EXCLUSIVE MODE")
        bind.exec_driver_sql("LOCK TABLE user_preferences IN SHARE ROW EXCLUSIVE MODE")
    elif bind.dialect.name == "sqlite":
        if not bind.connection.driver_connection.in_transaction:
            bind.exec_driver_sql("BEGIN IMMEDIATE")
        else:
            bind.exec_driver_sql("UPDATE user_preferences SET id=id WHERE 1=0")
    else:
        raise RuntimeError("Compensation records support PostgreSQL and SQLite only.")
    if {"salary_plans", "rsu_grants", "rsu_vestings"} & set(sa.inspect(bind).get_table_names()):
        raise RuntimeError("Compensation destination tables already exist; refusing to overwrite.")
    salary_rows, grant_rows, vesting_rows = _preflight(bind)
    salary, grants, vestings = _create_tables(bind)
    if bind.dialect.name == "sqlite":
        for row in [*salary_rows, *grant_rows, *vesting_rows]:
            for key, value in row.items():
                if isinstance(value, Decimal):
                    row[key] = str(value)
    if salary_rows:
        bind.execute(salary.insert(), salary_rows)
    if grant_rows:
        inserted = bind.execute(
            grants.insert().returning(grants.c.id, grants.c.user_id, grants.c.public_id),
            grant_rows,
        )
        grant_ids = {(row.user_id, row.public_id): row.id for row in inserted}
        for row in vesting_rows:
            row["grant_id"] = grant_ids[row["user_id"], row.pop("public_grant_id")]
        bind.execute(vestings.insert(), vesting_rows)


@irreversible
def downgrade() -> None:
    """Later edits cannot safely be restored from the retained legacy columns."""
