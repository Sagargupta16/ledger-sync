"""Attach additive ledger IDs without changing display strings or committing.

Call ``attach_ledger_dimensions`` after upload normalization/canonicalization;
call ``sync_transaction_dimensions`` after manual label edits, or the plural
helper once for a batch of rule edits. All five IDs are recomputed from the
labels, including clearing obsolete IDs. Callers own the transaction/flush.

Only exact lowercased labels share an identity. Empty/missing labels have no
ID; a subcategory without a category remains an unnormalized label snapshot.
Transfer category strings remain as supplied. Preferences, classifications,
planning records and existing string-based API/analytics remain unchanged.
"""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any, cast

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from ledger_sync.db.models import (
    LedgerAccount,
    LedgerAccountAlias,
    LedgerCategory,
    LedgerSubcategory,
    Transaction,
)

# Five values per subcategory insert stay below SQLite's legacy 999 bind limit.
_CHUNK_SIZE = 150
_ACCOUNT_FIELDS = ("account", "from_account", "to_account")
_LABEL_FIELDS = (*_ACCOUNT_FIELDS, "category", "subcategory")
_ACCOUNTS = cast(sa.Table, LedgerAccount.__table__)
_ALIASES = cast(sa.Table, LedgerAccountAlias.__table__)
_CATEGORIES = cast(sa.Table, LedgerCategory.__table__)
_SUBCATEGORIES = cast(sa.Table, LedgerSubcategory.__table__)


def _label_key(value: str | None) -> str | None:
    return value.lower() if value else None


def _insert_missing(
    db: Session, table: sa.Table, rows: list[dict[str, Any]], unique: Sequence[str]
) -> None:
    if not rows:
        return
    dialect = db.get_bind().dialect.name
    if dialect not in {"sqlite", "postgresql"}:
        raise ValueError("Ledger dimensions support SQLite and PostgreSQL.")
    insert = pg_insert if dialect == "postgresql" else sqlite_insert
    for start in range(0, len(rows), _CHUNK_SIZE):
        statement = insert(table).values(rows[start : start + _CHUNK_SIZE])
        db.execute(statement.on_conflict_do_nothing(index_elements=list(unique)))


def _read_ids(
    db: Session,
    table: sa.Table,
    user_id: int,
    keys: list[tuple[Any, ...]],
    key_columns: Sequence[str],
    id_column: str = "id",
) -> dict[tuple[Any, ...], int]:
    columns = [table.c[name] for name in key_columns]
    result: dict[tuple[Any, ...], int] = {}
    for start in range(0, len(keys), _CHUNK_SIZE):
        chunk = keys[start : start + _CHUNK_SIZE]
        predicate = (
            columns[0].in_([key[0] for key in chunk])
            if len(columns) == 1
            else sa.tuple_(*columns).in_(chunk)
        )
        records = db.execute(
            sa.select(*columns, table.c[id_column]).where(table.c.user_id == user_id, predicate)
        )
        result.update((tuple(record[:-1]), record[-1]) for record in records)
    return result


def _resolve_named(
    db: Session,
    table: sa.Table,
    user_id: int,
    names: dict[tuple[Any, ...], str],
    key_columns: Sequence[str],
) -> dict[tuple[Any, ...], int]:
    ids = _read_ids(db, table, user_id, list(names), key_columns)
    missing = [key for key in names if key not in ids]
    _insert_missing(
        db,
        table,
        [
            {"user_id": user_id, "name": names[key], **dict(zip(key_columns, key, strict=True))}
            for key in missing
        ],
        ("user_id", *key_columns),
    )
    # Re-read after ON CONFLICT: concurrent imports may have created these keys.
    ids.update(_read_ids(db, table, user_id, missing, key_columns))
    return ids


def _resolve_accounts(
    db: Session, user_id: int, names: dict[tuple[Any, ...], str]
) -> dict[tuple[Any, ...], int]:
    aliases = _ALIASES
    ids = _read_ids(db, aliases, user_id, list(names), ("source_key",), "account_id")
    missing = {key: name for key, name in names.items() if key not in ids}
    accounts = _resolve_named(db, _ACCOUNTS, user_id, missing, ("key",))
    _insert_missing(
        db,
        aliases,
        [
            {
                "user_id": user_id,
                "source_key": key[0],
                "label": name,
                "account_id": accounts[key],
            }
            for key, name in missing.items()
        ],
        ("user_id", "source_key"),
    )
    ids.update(_read_ids(db, aliases, user_id, list(missing), ("source_key",), "account_id"))
    return ids


def attach_ledger_dimensions(
    db: Session, user_id: int, rows: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Mutate/return normalized rows with IDs in O(tables * distinct-key chunks)."""
    if not rows:
        return rows
    if user_id is None:
        raise ValueError("Ledger dimensions require a user.")
    accounts: dict[tuple[Any, ...], str] = {}
    categories: dict[tuple[Any, ...], str] = {}
    for row in rows:
        if row.get("user_id", user_id) != user_id:
            raise ValueError("Every row must belong to the requested user.")
        for field in _LABEL_FIELDS:
            value = row.get(field)
            if value is not None and not isinstance(value, str):
                raise TypeError(f"Normalized {field} must be a string or None.")
        for field in _ACCOUNT_FIELDS:
            if key := _label_key(row.get(field)):
                accounts.setdefault((key,), row[field])
        if key := _label_key(row.get("category")):
            categories.setdefault((key,), row["category"])

    with db.no_autoflush:
        account_ids = _resolve_accounts(db, user_id, accounts)
        category_ids = _resolve_named(db, _CATEGORIES, user_id, categories, ("key",))
        subcategories: dict[tuple[Any, ...], str] = {}
        for row in rows:
            category_id = category_ids.get((_label_key(row.get("category")),))
            key = _label_key(row.get("subcategory"))
            if category_id is not None and key:
                subcategories.setdefault((category_id, key), row["subcategory"])
        subcategory_ids = _resolve_named(
            db,
            _SUBCATEGORIES,
            user_id,
            subcategories,
            ("category_id", "key"),
        )
        for row in rows:
            for field in _ACCOUNT_FIELDS:
                row[f"{field}_id"] = account_ids.get((_label_key(row.get(field)),))
            category_id = category_ids.get((_label_key(row.get("category")),))
            row["category_id"] = category_id
            row["subcategory_id"] = subcategory_ids.get(
                (category_id, _label_key(row.get("subcategory")))
            )
    return rows


def sync_transactions_dimensions(
    db: Session, user_id: int, transactions: Sequence[Transaction]
) -> None:
    """Synchronize a manual/rule-edit batch; never flush partially edited rows."""
    with db.no_autoflush:
        if any(transaction.user_id != user_id for transaction in transactions):
            raise ValueError("Every transaction must belong to the requested user.")
        rows = [
            {field: getattr(transaction, field) for field in _LABEL_FIELDS}
            for transaction in transactions
        ]
        attach_ledger_dimensions(db, user_id, rows)
        for transaction, row in zip(transactions, rows, strict=True):
            for field in _LABEL_FIELDS:
                setattr(transaction, f"{field}_id", row[f"{field}_id"])


def sync_transaction_dimensions(db: Session, transaction: Transaction) -> None:
    """Synchronize one new or edited transaction in the caller's transaction."""
    with db.no_autoflush:
        sync_transactions_dimensions(db, transaction.user_id, [transaction])
