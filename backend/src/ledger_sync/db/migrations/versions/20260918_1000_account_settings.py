"""Copy account settings onto stable, owner-qualified ledger identities.

Revision ID: account_settings_2026
Revises: live_index_predicates_2026

This additive revision retains account_classifications and the preference JSON
for the separately validated cutover. No transaction text, ID, child, account
name or existing alias is changed. Legacy classification IDs remain in their
old table; the classification API has never exposed them. Equivalent labels
share the existing ledger ID. For equivalent classification rows, preserve the
earliest created_at and latest updated_at.

Preflight ALL owners, labels, aliases, types, closure metadata and Decimal limits
before any DDL/DML. Ambiguous sources fail rather than pick a winner. Frozen
normalization uses Python lower, never SQL lower, trimming or casefold. Only
ADD COLUMN is used on SQLite: no parent rebuild, FK toggling, or cascading DROP.
"""

import json
from decimal import Decimal, InvalidOperation
from typing import Any

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

from ledger_sync.db.migrations.safety import irreversible

revision: str = "account_settings_2026"
down_revision: str | None = "live_index_predicates_2026"
branch_labels: str | None = None
depends_on: str | None = None

_TYPES = ("CASH", "BANK_ACCOUNTS", "CREDIT_CARDS", "INVESTMENTS", "LOANS", "OTHER_WALLETS")
_CHUNK = 150
# (owner, existing account ID) or, for an account still to create, (owner, key).
type _Identity = tuple[int, int | str]
type _Key = tuple[int, str]


def _label(value: Any) -> str:
    if not isinstance(value, str) or not value or len(value) > 255:
        raise RuntimeError("Invalid legacy account label; resolve explicitly before migration.")
    return value.lower()


def _limit(value: Any) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (str, int, Decimal)):
        raise RuntimeError("Invalid legacy credit limit; expected a numeric amount.")
    try:
        amount = Decimal(str(value))
        if (
            not amount.is_finite()
            or amount < 0
            or amount > Decimal("9999999999999.99")
            or amount != amount.quantize(Decimal("0.01"))
        ):
            raise RuntimeError(
                "Legacy credit limit cannot be represented exactly as NUMERIC(15,2)."
            )
    except (InvalidOperation, ValueError) as exc:
        raise RuntimeError("Invalid legacy credit limit.") from exc
    return amount


def _json_object(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        _label(key)
        amount = _limit(value)
        if key in result and result[key] != amount:
            raise RuntimeError("Conflicting duplicate credit-limit JSON keys.")
        result[key] = amount
    return result


def _read_limits(raw: str) -> dict[str, Any]:
    try:
        result = json.loads(
            raw, parse_float=Decimal, parse_int=Decimal, object_pairs_hook=_json_object
        )
    except (TypeError, ValueError) as exc:
        raise RuntimeError("Invalid legacy credit-limit JSON; resolve before migration.") from exc
    if not isinstance(result, dict):
        raise RuntimeError("Legacy credit limits must be a JSON object.")
    return result


def _prepare(bind: sa.Connection) -> None:
    if bind.dialect.name == "postgresql":
        # Drain application user-row locks before blocking their dependent writes.
        bind.exec_driver_sql("LOCK TABLE users IN EXCLUSIVE MODE")
        bind.exec_driver_sql(
            "LOCK TABLE ledger_accounts, ledger_account_aliases, "
            "account_classifications, user_preferences IN SHARE ROW EXCLUSIVE MODE"
        )
    elif bind.dialect.name == "sqlite":
        if not bind.connection.driver_connection.in_transaction:
            bind.exec_driver_sql("BEGIN IMMEDIATE")
        else:
            # Reserve the writer without changing data, including in supplied transactions.
            bind.exec_driver_sql("UPDATE ledger_accounts SET id=id WHERE 1=0")
        if bind.exec_driver_sql("PRAGMA foreign_key_check").first():
            raise RuntimeError("Foreign key validation failed before account settings migration.")
    else:
        raise RuntimeError("Account settings support SQLite and PostgreSQL only.")


def _existing_accounts(
    bind: sa.Connection, accounts: sa.Table, users: set[int]
) -> tuple[dict[_Identity, dict[str, Any]], dict[_Key, _Identity]]:
    existing: dict[_Identity, dict[str, Any]] = {
        (row.user_id, row.id): dict(row) for row in bind.execute(sa.select(accounts)).mappings()
    }
    keys: dict[_Key, _Identity] = {}
    for identity, account in existing.items():
        if account["user_id"] not in users or account["key"] != _label(account["name"]):
            raise RuntimeError("Invalid account owner or canonical key; no settings were changed.")
        keys[(account["user_id"], account["key"])] = identity
    return existing, keys


def _existing_alias_keys(
    bind: sa.Connection,
    aliases: sa.Table,
    existing: dict[_Identity, dict[str, Any]],
    keys: dict[_Key, _Identity],
) -> set[_Key]:
    alias_keys = set()
    for alias in bind.execute(sa.select(aliases)).mappings():
        key = (alias.user_id, alias.source_key)
        identity = (alias.user_id, alias.account_id)
        if (
            identity not in existing
            or alias.source_key != _label(alias.label)
            or (key in keys and keys[key] != identity)
        ):
            raise RuntimeError("Ambiguous or cross-owner account alias; no settings were changed.")
        keys[key] = identity
        alias_keys.add(key)
    return alias_keys


class _SettingsPlan:
    """Target accounts and aliases accumulated while reading legacy settings."""

    def __init__(self, users: set[int], keys: dict[_Key, _Identity], alias_keys: set[_Key]) -> None:
        self.users = users
        self.keys = keys
        self.alias_keys = alias_keys
        self.accounts: dict[_Identity, dict[str, Any]] = {}
        self.new_aliases: dict[_Key, tuple[str, _Identity]] = {}

    def target(self, user_id: int, label: str) -> dict[str, Any]:
        if user_id not in self.users:
            raise RuntimeError("Legacy settings reference an unknown owner; no changes were made.")
        key = (user_id, _label(label))
        identity = self.keys.get(key, key)
        if key not in self.alias_keys:
            self.new_aliases.setdefault(key, (label, identity))
        return self.accounts.setdefault(
            identity,
            {"user_id": user_id, "name": label, "key": key[1], "values": {}},
        )


def _merge_classification(plan: _SettingsPlan, row: Any) -> None:
    if row.account_type not in _TYPES or row.is_closed not in (False, True):
        raise RuntimeError("Invalid legacy classification or closure state.")
    entry = plan.target(row.user_id, row.account_name)
    values = entry["values"]
    incoming = {
        "account_type": row.account_type,
        "is_closed": row.is_closed,
        "closed_date": row.closed_date,
    }
    if "account_type" in values and any(values[key] != value for key, value in incoming.items()):
        raise RuntimeError(
            "Conflicting legacy classifications/closure metadata resolve to one account; "
            "resolve explicitly with the owner before migration. No data was changed."
        )
    values.update(incoming)
    for field, choose in (("created_at", min), ("updated_at", max)):
        candidates = [value for value in (values.get(field), row[field]) if value is not None]
        values[field] = choose(candidates) if candidates else None


def _merge_credit_limits(plan: _SettingsPlan, row: Any) -> None:
    limits = _read_limits(row.credit_card_limits)
    # The original preferences revision seeded an anonymous default row.
    # An empty map has no settings to transfer and no owner to infer.
    if row.user_id is None and not limits:
        return
    if row.user_id not in plan.users:
        raise RuntimeError("Legacy credit limits reference an unknown owner.")
    for label, raw_amount in limits.items():
        values = plan.target(row.user_id, label)["values"]
        amount = _limit(raw_amount)
        if "credit_limit" in values and values["credit_limit"] != amount:
            raise RuntimeError(
                "Conflicting legacy credit limits resolve to one account; no data was changed."
            )
        values["credit_limit"] = amount


def _check_existing_settings(current: dict[str, Any], values: dict[str, Any]) -> None:
    # A create_all-first or repeated run must not overwrite already configured
    # target metadata. Default False is neutral only while type/date are unset.
    for field in ("account_type", "closed_date", "credit_limit"):
        if current.get(field) is not None and field in values and current[field] != values[field]:
            raise RuntimeError("Existing account settings conflict with legacy data.")
    if (
        "is_closed" in values
        and (current.get("is_closed") or current.get("account_type") is not None)
        and current.get("is_closed") != values["is_closed"]
    ):
        raise RuntimeError("Existing account closure conflicts with legacy data.")


def _preflight(bind: sa.Connection) -> tuple[dict, dict, dict]:
    metadata = sa.MetaData()
    accounts = sa.Table("ledger_accounts", metadata, autoload_with=bind)
    aliases = sa.Table("ledger_account_aliases", metadata, autoload_with=bind)
    legacy = sa.Table("account_classifications", metadata, autoload_with=bind)
    prefs = sa.Table("user_preferences", metadata, autoload_with=bind)
    users = set(bind.execute(sa.text("SELECT id FROM users")).scalars())
    existing, keys = _existing_accounts(bind, accounts, users)
    alias_keys = _existing_alias_keys(bind, aliases, existing, keys)
    plan = _SettingsPlan(users, keys, alias_keys)
    for row in bind.execute(sa.select(legacy).order_by(legacy.c.id)).mappings():
        _merge_classification(plan, row)
    for row in bind.execute(sa.select(prefs.c.user_id, prefs.c.credit_card_limits)).mappings():
        _merge_credit_limits(plan, row)
    for identity, entry in plan.accounts.items():
        _check_existing_settings(existing.get(identity, {}), entry["values"])
    return existing, plan.accounts, plan.new_aliases


def _add_columns(bind: sa.Connection) -> None:
    existing = {column["name"] for column in sa.inspect(bind).get_columns("ledger_accounts")}
    account_type = (
        postgresql.ENUM(*_TYPES, name="accounttype", create_type=False)
        if bind.dialect.name == "postgresql"
        else sa.Enum(*_TYPES, name="accounttype")
    )
    columns = (
        sa.Column("account_type", account_type, nullable=True),
        sa.Column("is_closed", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("closed_date", sa.DateTime(), nullable=True),
        sa.Column("credit_limit", sa.Numeric(15, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    for column in columns:
        if column.name not in existing:
            op.add_column("ledger_accounts", column)


def _apply(bind: sa.Connection, existing: dict, plan: dict, new_aliases: dict) -> None:
    accounts = sa.Table("ledger_accounts", sa.MetaData(), autoload_with=bind)
    aliases = sa.Table("ledger_account_aliases", sa.MetaData(), autoload_with=bind)
    missing = [
        {key: entry[key] for key in ("user_id", "name", "key")}
        for identity, entry in plan.items()
        if identity not in existing
    ]
    for start in range(0, len(missing), _CHUNK):
        bind.execute(accounts.insert(), missing[start : start + _CHUNK])
    ids = {
        (row.user_id, row.key): row.id
        for row in bind.execute(sa.select(accounts.c.user_id, accounts.c.key, accounts.c.id))
    }

    def account_id(identity: tuple[int, int | str]) -> int:
        return identity[1] if isinstance(identity[1], int) else ids[identity]

    alias_rows = [
        {
            "user_id": key[0],
            "source_key": key[1],
            "label": label,
            "account_id": account_id(identity),
        }
        for key, (label, identity) in new_aliases.items()
    ]
    for start in range(0, len(alias_rows), _CHUNK):
        bind.execute(aliases.insert(), alias_rows[start : start + _CHUNK])
    # Group by changed-column set so missing settings remain NULL/unconfigured.
    groups: dict[tuple[str, ...], list[dict[str, Any]]] = {}
    for identity, entry in plan.items():
        values = entry["values"]
        fields = tuple(sorted(values))
        groups.setdefault(fields, []).append(
            {"_owner": identity[0], "_id": account_id(identity), **values}
        )
    for fields, rows in groups.items():
        statement = (
            accounts.update()
            .where(
                accounts.c.user_id == sa.bindparam("_owner"), accounts.c.id == sa.bindparam("_id")
            )
            .values({field: sa.bindparam(field) for field in fields})
        )
        for start in range(0, len(rows), _CHUNK):
            bind.execute(statement, rows[start : start + _CHUNK])


def upgrade() -> None:
    if op.get_context().as_sql:
        raise RuntimeError("Account settings require an online connection for preflight.")
    bind = op.get_bind()
    _prepare(bind)
    existing, plan, new_aliases = _preflight(bind)
    _add_columns(bind)
    _apply(bind, existing, plan, new_aliases)
    if bind.dialect.name == "sqlite" and bind.exec_driver_sql("PRAGMA foreign_key_check").first():
        raise RuntimeError("Foreign key validation failed; roll back account settings migration.")


@irreversible
def downgrade() -> None:
    """Preserve configured identities; recover with a verified backup or forward repair."""
