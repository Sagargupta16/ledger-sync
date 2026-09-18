"""Verify the copied domains before retiring legacy settings storage.

Revision ID: domain_storage_cutover_2026
Revises: compensation_records_2026
Create Date: 2026-09-18 13:00:00.000000

This revision shares the coordinated deployment boundary with the three domain
backfills. It never guesses identity or repairs a disagreement. Frozen earlier
revision functions reconstruct the expected source representation; application
models and current serializers are deliberately not imported.
"""

from decimal import Decimal
from importlib import import_module
from typing import Any

import sqlalchemy as sa
from alembic import op

from ledger_sync.db.migrations.safety import irreversible

revision: str = "domain_storage_cutover_2026"
down_revision: str | None = "compensation_records_2026"
branch_labels: str | None = None
depends_on: str | None = None

_AI_COLUMNS = (
    "ai_mode",
    "ai_provider",
    "ai_model",
    "ai_api_key_encrypted",
    "ai_daily_token_limit",
    "ai_monthly_token_limit",
)
_RETIRED_COLUMNS = (*_AI_COLUMNS, "credit_card_limits", "salary_structure", "rsu_grants")
_LOCKED_TABLES = (
    "users",
    "user_preferences",
    "account_classifications",
    "ledger_accounts",
    "ledger_account_aliases",
    "user_ai_settings",
    "salary_plans",
    "rsu_grants",
    "rsu_vestings",
)


def _prepare(bind: sa.Connection) -> None:
    if bind.dialect.name == "postgresql":
        bind.exec_driver_sql("LOCK TABLE users IN EXCLUSIVE MODE")
        bind.exec_driver_sql(
            f"LOCK TABLE {', '.join(_LOCKED_TABLES[1:])} IN SHARE ROW EXCLUSIVE MODE"
        )
    elif bind.dialect.name == "sqlite":
        if not bind.connection.driver_connection.in_transaction:
            bind.exec_driver_sql("BEGIN IMMEDIATE")
        else:
            bind.exec_driver_sql("UPDATE user_preferences SET id=id WHERE 1=0")
    else:
        raise RuntimeError("Domain storage supports PostgreSQL and SQLite only.")


def _assert_no_external_dependents(bind: sa.Connection) -> None:
    inspector = sa.inspect(bind)
    for name in inspector.get_table_names():
        for foreign_key in inspector.get_foreign_keys(name):
            if foreign_key["referred_table"] in {"account_classifications", "user_preferences"}:
                raise RuntimeError(
                    "Legacy settings have a dependent foreign key; resolve the dependency "
                    "explicitly before cutover. No legacy storage was removed."
                )


def _verify_ai(bind: sa.Connection) -> None:
    metadata = sa.MetaData()
    source = sa.Table("user_preferences", metadata, autoload_with=bind)
    target = sa.Table("user_ai_settings", metadata, autoload_with=bind)
    difference = sa.or_(
        target.c.user_id.is_(None),
        *(source.c[name].is_distinct_from(target.c[name]) for name in _AI_COLUMNS),
    )
    mismatch = bind.execute(
        sa.select(source.c.id)
        .select_from(source.outerjoin(target, source.c.user_id == target.c.user_id))
        .where(source.c.user_id.is_not(None), difference)
        .limit(1)
    ).first()
    if mismatch:
        # Never put ciphertext or provider details into migration exceptions.
        raise RuntimeError("AI settings copy differs from its source; no legacy storage removed.")

    ownerless = bind.execute(
        sa.select(source.c.id).where(
            source.c.user_id.is_(None),
            sa.or_(
                source.c.ai_mode.is_distinct_from("app_bedrock"),
                *(source.c[name].is_not(None) for name in _AI_COLUMNS if name != "ai_mode"),
            ),
        )
    ).first()
    if ownerless:
        raise RuntimeError("Ownerless AI configuration cannot be retired without an owner.")


def _verify_accounts(bind: sa.Connection) -> None:
    migration = import_module("ledger_sync.db.migrations.versions.20260918_1000_account_settings")
    existing, plan, new_aliases = migration._preflight(bind)
    if new_aliases:
        raise RuntimeError("Account alias backfill is incomplete; no legacy storage removed.")
    for identity, entry in plan.items():
        actual = existing.get(identity)
        if actual is None or any(
            actual.get(field) != value for field, value in entry["values"].items()
        ):
            raise RuntimeError(
                "Account settings copy differs from its source; no legacy storage removed."
            )


def _assert_rows_equal(
    expected: list[dict[str, Any]],
    actual: list[dict[str, Any]],
    keys: tuple[str, ...],
    fields: tuple[str, ...],
) -> None:
    actual_by_key = {tuple(row[key] for key in keys): row for row in actual}
    if len(actual_by_key) != len(actual) or len(expected) != len(actual):
        raise RuntimeError("Compensation copy row count differs; no legacy storage removed.")
    for source in expected:
        target = actual_by_key.get(tuple(source[key] for key in keys))
        if target is None:
            raise RuntimeError("Compensation copy is incomplete; no legacy storage removed.")
        for field in fields:
            left, right = source[field], target[field]
            if isinstance(left, Decimal) and right is not None:
                right = Decimal(str(right))
            if left != right:
                raise RuntimeError(
                    "Compensation copy differs from its source; no legacy storage removed."
                )


def _verify_compensation(bind: sa.Connection) -> None:
    migration = import_module(
        "ledger_sync.db.migrations.versions.20260918_1200_compensation_records"
    )
    salary_rows, grant_rows, vesting_rows = migration._preflight(bind)
    metadata = sa.MetaData()
    salary = sa.Table("salary_plans", metadata, autoload_with=bind)
    grants = sa.Table("rsu_grants", metadata, autoload_with=bind)
    vestings = sa.Table("rsu_vestings", metadata, autoload_with=bind)
    actual_salary = [dict(row) for row in bind.execute(sa.select(salary)).mappings()]
    actual_grants = [dict(row) for row in bind.execute(sa.select(grants)).mappings()]
    actual_vestings = [
        dict(row)
        for row in bind.execute(
            sa.select(
                vestings,
                grants.c.public_id.label("public_grant_id"),
            ).select_from(
                vestings.join(
                    grants,
                    sa.and_(
                        vestings.c.user_id == grants.c.user_id,
                        vestings.c.grant_id == grants.c.id,
                    ),
                )
            )
        ).mappings()
    ]
    # A join must not hide orphan rows when SQLite FK checks are disabled.
    if len(actual_vestings) != bind.scalar(sa.select(sa.func.count()).select_from(vestings)):
        raise RuntimeError("Orphan compensation event; no legacy storage removed.")
    _assert_rows_equal(
        salary_rows,
        actual_salary,
        ("user_id", "fiscal_year"),
        ("position", *migration._SALARY_DEFAULTS),
    )
    _assert_rows_equal(
        grant_rows,
        actual_grants,
        ("user_id", "public_id"),
        ("position", "stock_name", "stock_price", "grant_date", "notes"),
    )
    _assert_rows_equal(
        vesting_rows,
        actual_vestings,
        ("user_id", "id"),
        ("public_grant_id", "position", "date", "quantity", "price_at_vest", "net_quantity"),
    )


def upgrade() -> None:
    if op.get_context().as_sql:
        raise RuntimeError("Domain storage cutover requires online copy verification.")
    bind = op.get_bind()
    _prepare(bind)
    _assert_no_external_dependents(bind)
    _verify_ai(bind)
    _verify_accounts(bind)
    _verify_compensation(bind)
    with op.batch_alter_table("user_preferences") as batch:
        for column in _RETIRED_COLUMNS:
            batch.drop_column(column)
    op.drop_table("account_classifications")
    if bind.dialect.name == "sqlite" and bind.exec_driver_sql("PRAGMA foreign_key_check").first():
        raise RuntimeError("Foreign key validation failed; roll back domain storage cutover.")


@irreversible
def downgrade() -> None:
    """New writes require a verified backup or an explicit forward migration."""
