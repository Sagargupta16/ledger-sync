"""Authoritative account configuration, scoped to one owner.

Callers acquire the analytics/user lock, flush prior edits when appropriate, mark
analytics invalidation, and commit/rollback. These helpers never do so. Reads
reload clean account objects so a cached value cannot predate the caller's lock;
pending in-transaction account edits remain intact.
Reads and bulk replacements use a bounded number of queries per key batch,
never one query per account. Legacy classification/preferences storage is not
read at runtime; the account_settings_2026 migration performs that handoff.
"""

from __future__ import annotations

from collections.abc import Mapping
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import inspect, select
from sqlalchemy.orm import Session

from ledger_sync.db.models import AccountType, LedgerAccount, LedgerAccountAlias
from ledger_sync.services.ledger_dimensions import ensure_account_ids

MAX_CREDIT_LIMIT = Decimal("9999999999999.99")


def validate_credit_limit(value: Decimal | float | str | None) -> Decimal | None:
    """Accept exact nonnegative cents, rejecting silent NUMERIC rounding/overflow."""
    if value is None:
        return None
    if isinstance(value, bool):
        raise ValueError("Credit limits must be numeric amounts, not booleans.")
    try:
        amount = Decimal(str(value))
        if (
            not amount.is_finite()
            or amount < 0
            or amount > MAX_CREDIT_LIMIT
            or amount != amount.quantize(Decimal("0.01"))
        ):
            raise ValueError("Credit limits must be nonnegative amounts with at most two decimals.")
    except (InvalidOperation, TypeError) as exc:
        raise ValueError("Invalid credit limit.") from exc
    return amount


def _validate_label(label: str) -> str:
    if not isinstance(label, str) or not label or len(label) > 255:
        raise ValueError("Account names must contain between 1 and 255 characters.")
    return label.lower()


def _index(db: Session, user_id: int) -> tuple[list[LedgerAccount], dict[str, LedgerAccount]]:
    if user_id is None:
        raise ValueError("Account settings require a user.")
    with db.no_autoflush:
        # A preferences request may hold accounts loaded before waiting for the
        # user lock. Expiration itself issues no SQL; the following bulk SELECT
        # reloads them together. populate_existing would discard pending edits.
        for cached in list(db.identity_map.values()):
            if not isinstance(cached, LedgerAccount):
                continue
            state = inspect(cached)
            if state.dict.get("user_id", user_id) != user_id:
                continue
            if cached not in db.deleted and not db.is_modified(cached):
                db.expire(cached)
        accounts = list(db.scalars(select(LedgerAccount).where(LedgerAccount.user_id == user_id)))
        by_id = {account.id: account for account in accounts}
        by_key = {account.key: account for account in accounts}
        aliases = db.execute(
            select(LedgerAccountAlias.source_key, LedgerAccountAlias.account_id).where(
                LedgerAccountAlias.user_id == user_id
            )
        )
        for key, account_id in aliases:
            account = by_id.get(account_id)
            if account is None or (key in by_key and by_key[key].id != account_id):
                raise ValueError("Ambiguous or cross-owner account alias; resolve it explicitly.")
            by_key[key] = account
    return accounts, by_key


def get_account(db: Session, user_id: int, label: str) -> LedgerAccount | None:
    """Resolve an existing account through its canonical key or alias."""
    key = _validate_label(label)
    return _index(db, user_id)[1].get(key)


def _ensure_account(db: Session, user_id: int, label: str) -> LedgerAccount:
    account = get_account(db, user_id, label)
    if account is None:
        ids = ensure_account_ids(db, user_id, [label])
        with db.no_autoflush:
            account = db.get(LedgerAccount, ids[label])
        if account is None:
            raise ValueError("Account creation failed.")
    return account


def get_classification_map(db: Session, user_id: int) -> dict[str, str]:
    """Return the existing API shape using preserved canonical display names."""
    return {
        account.name: account.account_type.value
        for account in _index(db, user_id)[0]
        if account.account_type is not None
    }


def get_account_type_lookup(db: Session, user_id: int) -> dict[str, str]:
    """Return lowercased canonical/alias keys for historical-label consumers."""
    return {
        key: account.account_type.value
        for key, account in _index(db, user_id)[1].items()
        if account.account_type is not None
    }


def set_account_type(
    db: Session, user_id: int, label: str, account_type: AccountType | None
) -> tuple[LedgerAccount | None, bool]:
    """Set/clear classification only; clearing never deletes a durable identity."""
    if account_type is not None:
        account_type = AccountType(account_type)
    account = (
        _ensure_account(db, user_id, label)
        if account_type is not None
        else get_account(db, user_id, label)
    )
    changed = account is not None and account.account_type != account_type
    if account is not None and changed:
        account.account_type = account_type
        account.updated_at = datetime.now(UTC)
    return account, changed


def set_account_closed(
    db: Session, user_id: int, label: str, is_closed: bool
) -> tuple[LedgerAccount, bool]:
    """Set closure independently of type; repeat requests preserve closed_date."""
    account = _ensure_account(db, user_id, label)
    changed = account.is_closed != is_closed
    if changed:
        account.is_closed = is_closed
        account.closed_date = datetime.now(UTC) if is_closed else None
        account.updated_at = datetime.now(UTC)
    return account, changed


def get_closed_account_names(db: Session, user_id: int) -> list[str]:
    return [account.name for account in _index(db, user_id)[0] if account.is_closed]


def get_closed_account_keys(db: Session, user_id: int) -> set[str]:
    return {key for key, account in _index(db, user_id)[1].items() if account.is_closed}


def get_account_label_keys(db: Session, user_id: int, account_id: int) -> set[str]:
    return {key for key, account in _index(db, user_id)[1].items() if account.id == account_id}


def get_closed_account_dates(db: Session, user_id: int) -> dict[str, datetime]:
    return {
        key: account.closed_date
        for key, account in _index(db, user_id)[1].items()
        if account.is_closed and account.closed_date is not None
    }


def get_credit_card_limits(db: Session, user_id: int) -> dict[str, Decimal]:
    """Preferences-compatible name map; NULL is omitted and explicit zero remains."""
    return {
        account.name: account.credit_limit
        for account in _index(db, user_id)[0]
        if account.credit_limit is not None
    }


def replace_credit_card_limits(
    db: Session,
    user_id: int,
    limits: Mapping[str, Decimal | int | float | str | None],
) -> bool:
    """Replace the complete limit map; omitted/None entries clear existing limits.

    Validate every value and all case/alias collisions before any write. Equal
    duplicate labels are harmless. Returns whether values actually changed, for
    the caller's analytics invalidation. No implicit classification is assigned.
    """
    normalized: dict[str, tuple[str, Decimal | None]] = {}
    for label, value in limits.items():
        key = _validate_label(label)
        amount = validate_credit_limit(value)
        if key in normalized and normalized[key][1] != amount:
            raise ValueError("Conflicting credit limits for case-variant account labels.")
        normalized.setdefault(key, (label, amount))

    accounts, by_key = _index(db, user_id)
    by_id: dict[int, Decimal | None] = {}
    missing: dict[str, Decimal] = {}
    for key, (label, amount) in normalized.items():
        account = by_key.get(key)
        if account is None:
            if amount is not None:
                missing[label] = amount
        else:
            if account.id in by_id and by_id[account.id] != amount:
                raise ValueError("Conflicting credit limits for aliases of one account.")
            by_id[account.id] = amount

    # All collision checks above run before ensure_account_ids can insert rows.
    if missing:
        ids = ensure_account_ids(db, user_id, list(missing))
        by_id.update((ids[label], amount) for label, amount in missing.items())
        accounts = _index(db, user_id)[0]
    changed = False
    now = datetime.now(UTC)
    for account in accounts:
        amount = by_id.get(account.id)
        if account.credit_limit != amount:
            account.credit_limit = amount
            account.updated_at = now
            changed = True
    return changed
