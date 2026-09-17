"""Add tenant-qualified ledger dimensions without rewriting financial history.

Revision ID: ledger_dimensions_2026
Revises: analytics_versions_2026
Create Date: 2026-09-17 13:00:00.000000

Frozen definitions and Python lowercase keys deliberately live in this revision:
neither runtime models nor runtime normalization code are imported. Only the new
ID columns are updated, including on soft-deleted transactions. Existing labels,
IDs, fingerprints, amounts, timestamps, and child annotations remain unchanged.

SQLite table rebuilds require a dedicated migration connection with foreign_keys
OFF before its transaction begins. Enabling it during DROP TABLE can cascade
delete transaction children. Fail before any writes rather than toggle the pragma
inside a transaction (where SQLite silently ignores it). The runner must re-enable
enforcement after commit; this revision checks all foreign keys before returning.
PostgreSQL needs no such connection setting.
"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op
from alembic.util import CommandError
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

revision: str = "ledger_dimensions_2026"
down_revision: str | None = "analytics_versions_2026"
branch_labels: str | None = None
depends_on: str | None = None

_ID_FIELDS = ("account_id", "from_account_id", "to_account_id", "category_id", "subcategory_id")
_LABEL_FIELDS = ("account", "from_account", "to_account", "category", "subcategory")
_CHUNK = 150
_FK_SPECS = (
    (
        "fk_transactions_account_dimension",
        ["user_id", "account_id"],
        "ledger_accounts",
        ["user_id", "id"],
    ),
    (
        "fk_transactions_from_account_dimension",
        ["user_id", "from_account_id"],
        "ledger_accounts",
        ["user_id", "id"],
    ),
    (
        "fk_transactions_to_account_dimension",
        ["user_id", "to_account_id"],
        "ledger_accounts",
        ["user_id", "id"],
    ),
    (
        "fk_transactions_category_dimension",
        ["user_id", "category_id"],
        "ledger_categories",
        ["user_id", "id"],
    ),
    (
        "fk_transactions_subcategory_dimension",
        ["user_id", "category_id", "subcategory_id"],
        "ledger_subcategories",
        ["user_id", "category_id", "id"],
    ),
)
_PARENT_CHECK = "ck_transactions_subcategory_parent"


def _dimension_tables() -> dict[str, sa.Table]:
    metadata = sa.MetaData()
    sa.Table("users", metadata, sa.Column("id", sa.Integer, primary_key=True))

    def identity_columns() -> list[sa.Column]:
        return [
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column(
                "user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
            ),
        ]

    accounts = sa.Table(
        "ledger_accounts",
        metadata,
        *identity_columns(),
        sa.Column("key", sa.String(765), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.UniqueConstraint("user_id", "id", name="uq_ledger_accounts_user_id"),
        sa.UniqueConstraint("user_id", "key", name="uq_ledger_accounts_user_key"),
        sqlite_autoincrement=True,
    )
    aliases = sa.Table(
        "ledger_account_aliases",
        metadata,
        *identity_columns(),
        sa.Column("account_id", sa.Integer, nullable=False),
        sa.Column("source_key", sa.String(765), nullable=False),
        sa.Column("label", sa.String(255), nullable=False),
        sa.UniqueConstraint("user_id", "source_key", name="uq_ledger_aliases_user_source"),
        sa.ForeignKeyConstraint(
            ["user_id", "account_id"],
            ["ledger_accounts.user_id", "ledger_accounts.id"],
            name="fk_ledger_aliases_account",
        ),
        sqlite_autoincrement=True,
    )
    categories = sa.Table(
        "ledger_categories",
        metadata,
        *identity_columns(),
        sa.Column("key", sa.String(765), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.UniqueConstraint("user_id", "id", name="uq_ledger_categories_user_id"),
        sa.UniqueConstraint("user_id", "key", name="uq_ledger_categories_user_key"),
        sqlite_autoincrement=True,
    )
    subcategories = sa.Table(
        "ledger_subcategories",
        metadata,
        *identity_columns(),
        sa.Column("category_id", sa.Integer, nullable=False),
        sa.Column("key", sa.String(765), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.UniqueConstraint(
            "user_id", "category_id", "id", name="uq_ledger_subcategories_user_parent_id"
        ),
        sa.UniqueConstraint(
            "user_id", "category_id", "key", name="uq_ledger_subcategories_user_parent_key"
        ),
        sa.ForeignKeyConstraint(
            ["user_id", "category_id"],
            ["ledger_categories.user_id", "ledger_categories.id"],
            name="fk_ledger_subcategories_category",
        ),
        sqlite_autoincrement=True,
    )
    return {
        "accounts": accounts,
        "aliases": aliases,
        "categories": categories,
        "subcategories": subcategories,
    }


def _load_ids(
    bind: sa.Connection, table: sa.Table, user_id: int, keys: Sequence[str], id_column: str = "id"
) -> dict[tuple[Any, ...], int]:
    return {
        tuple(row[:-1]): row[-1]
        for row in bind.execute(
            sa.select(*(table.c[key] for key in keys), table.c[id_column]).where(
                table.c.user_id == user_id
            )
        )
    }


def _ensure_names(
    bind: sa.Connection,
    table: sa.Table,
    user_id: int,
    names: dict[tuple[Any, ...], str],
    ids: dict[tuple[Any, ...], int],
    keys: Sequence[str],
) -> None:
    missing = [key for key in names if key not in ids]
    insert = pg_insert if bind.dialect.name == "postgresql" else sqlite_insert
    for start in range(0, len(missing), _CHUNK):
        chunk = missing[start : start + _CHUNK]
        bind.execute(
            insert(table)
            .values(
                [
                    {"user_id": user_id, "name": names[key], **dict(zip(keys, key, strict=True))}
                    for key in chunk
                ]
            )
            .on_conflict_do_nothing(index_elements=["user_id", *keys])
        )
        columns = [table.c[key] for key in keys]
        predicate = (
            columns[0].in_([key[0] for key in chunk])
            if len(keys) == 1
            else sa.tuple_(*columns).in_(chunk)
        )
        for row in bind.execute(
            sa.select(*columns, table.c.id).where(table.c.user_id == user_id, predicate)
        ):
            ids[tuple(row[:-1])] = row[-1]


def _backfill_user(
    bind: sa.Connection, transactions: sa.Table, tables: dict[str, sa.Table], user_id: int
) -> None:
    accounts = _load_ids(bind, tables["accounts"], user_id, ("key",))
    aliases = _load_ids(bind, tables["aliases"], user_id, ("source_key",), "account_id")
    categories = _load_ids(bind, tables["categories"], user_id, ("key",))
    subcategories = _load_ids(bind, tables["subcategories"], user_id, ("category_id", "key"))
    cursor = None
    while True:
        query = (
            sa.select(
                transactions.c.transaction_id, *(transactions.c[name] for name in _LABEL_FIELDS)
            )
            .where(transactions.c.user_id == user_id)
            .order_by(transactions.c.transaction_id)
            .limit(500)
        )
        if cursor is not None:
            query = query.where(transactions.c.transaction_id > cursor)
        rows = bind.execute(query).mappings().all()
        if not rows:
            break
        account_names: dict[tuple[Any, ...], str] = {}
        category_names: dict[tuple[Any, ...], str] = {}
        for row in rows:
            for field in _LABEL_FIELDS[:3]:
                if row[field]:
                    account_names.setdefault((row[field].lower(),), row[field])
            if row["category"]:
                category_names.setdefault((row["category"].lower(),), row["category"])
        _ensure_names(bind, tables["accounts"], user_id, account_names, accounts, ("key",))
        _ensure_names(bind, tables["categories"], user_id, category_names, categories, ("key",))
        new_aliases = [
            {"user_id": user_id, "source_key": key[0], "label": label, "account_id": accounts[key]}
            for key, label in account_names.items()
            if key not in aliases
        ]
        insert = pg_insert if bind.dialect.name == "postgresql" else sqlite_insert
        for start in range(0, len(new_aliases), _CHUNK):
            chunk = new_aliases[start : start + _CHUNK]
            bind.execute(
                insert(tables["aliases"])
                .values(chunk)
                .on_conflict_do_nothing(index_elements=["user_id", "source_key"])
            )
            for row in bind.execute(
                sa.select(tables["aliases"].c.source_key, tables["aliases"].c.account_id).where(
                    tables["aliases"].c.user_id == user_id,
                    tables["aliases"].c.source_key.in_([item["source_key"] for item in chunk]),
                )
            ):
                aliases[(row[0],)] = row[1]
        subcategory_names = {}
        for row in rows:
            if row["category"] and row["subcategory"]:
                parent = categories[(row["category"].lower(),)]
                subcategory_names.setdefault(
                    (parent, row["subcategory"].lower()), row["subcategory"]
                )
        _ensure_names(
            bind,
            tables["subcategories"],
            user_id,
            subcategory_names,
            subcategories,
            ("category_id", "key"),
        )
        updates = []
        for row in rows:
            category = categories.get(((row["category"] or "").lower(),))
            updates.append(
                {
                    "_transaction_id": row["transaction_id"],
                    "account_id": aliases.get(((row["account"] or "").lower(),)),
                    "from_account_id": aliases.get(((row["from_account"] or "").lower(),)),
                    "to_account_id": aliases.get(((row["to_account"] or "").lower(),)),
                    "category_id": category,
                    "subcategory_id": subcategories.get(
                        (category, (row["subcategory"] or "").lower())
                    ),
                }
            )
        bind.execute(
            transactions.update()
            .where(
                transactions.c.user_id == user_id,
                transactions.c.transaction_id == sa.bindparam("_transaction_id"),
            )
            .values({field: sa.bindparam(field) for field in _ID_FIELDS}),
            updates,
        )
        cursor = rows[-1]["transaction_id"]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    columns = {column["name"] for column in inspector.get_columns("transactions")}
    foreign_keys = {key["name"] for key in inspector.get_foreign_keys("transactions")}
    checks = {check["name"] for check in inspector.get_check_constraints("transactions")}
    needs_rebuild = (
        not set(_ID_FIELDS).issubset(columns)
        or any(name not in foreign_keys for name, *_ in _FK_SPECS)
        or _PARENT_CHECK not in checks
    )
    if bind.dialect.name == "sqlite":
        if needs_rebuild and bind.exec_driver_sql("PRAGMA foreign_keys").scalar():
            raise RuntimeError(
                "Ledger dimension migration requires a dedicated SQLite connection with "
                "PRAGMA foreign_keys=OFF before beginning the migration transaction, to preserve "
                "transaction children during the table rebuild. Re-enable it after commit."
            )
        if not bind.connection.driver_connection.in_transaction:
            bind.exec_driver_sql("BEGIN IMMEDIATE")
    elif bind.dialect.name == "postgresql":
        bind.exec_driver_sql("LOCK TABLE transactions IN SHARE ROW EXCLUSIVE MODE")
    else:
        raise RuntimeError("Ledger dimensions support SQLite and PostgreSQL only.")

    tables = _dimension_tables()
    for table in tables.values():
        table.create(bind, checkfirst=True)
    if needs_rebuild:
        with op.batch_alter_table("transactions") as batch:
            for field in _ID_FIELDS:
                if field not in columns:
                    batch.add_column(sa.Column(field, sa.Integer, nullable=True))
            for name, local, remote_table, remote in _FK_SPECS:
                if name not in foreign_keys:
                    batch.create_foreign_key(name, remote_table, local, remote)
            if _PARENT_CHECK not in checks:
                batch.create_check_constraint(
                    _PARENT_CHECK, "subcategory_id IS NULL OR category_id IS NOT NULL"
                )
    transactions = sa.Table("transactions", sa.MetaData(), autoload_with=bind)
    users = (
        bind.execute(sa.select(transactions.c.user_id).distinct().order_by(transactions.c.user_id))
        .scalars()
        .all()
    )
    for user_id in users:
        _backfill_user(bind, transactions, tables, user_id)
    if bind.dialect.name == "sqlite" and bind.exec_driver_sql("PRAGMA foreign_key_check").first():
        raise RuntimeError("Foreign key validation failed; roll back the dimension migration.")


def downgrade() -> None:
    """Preserve durable dimension IDs; recovery uses a backup or forward repair."""
    raise CommandError(
        "Revision ledger_dimensions_2026 has no supported downgrade. "
        "Restore a verified backup or apply a forward repair."
    )


# The migration runner recognizes this marker before applying any downgrade.
downgrade.unsupported_downgrade = True
