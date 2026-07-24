"""fold case-variant account names onto one canonical spelling

Revision ID: account_case_fold_2026
Revises: partial_tx_indexes_2026
Create Date: 2026-07-15 10:00:00.000000

"CC: Axis Google Flex" and "CC: AXIS Google Flex" are the same real
account, but the app treated them as two: two rows in Settings ->
Account Classifications, two balances on the net-worth page, split
analytics. The transaction hash lowercases account names, so re-uploads
never duplicated rows -- but the stored ``account`` field is not
updateable, so rows imported before a casing fix kept the old spelling
forever alongside newer rows with the new spelling.

This migration folds every case-variant group (per user) onto one
canonical spelling -- the spelling used by the most transaction rows --
across:

- ``transactions`` (account, from_account, to_account) and the
  "Transfer: A → B" category label that embeds the account names
- ``account_classifications`` (duplicate rows merged, most recently
  updated row wins the classification value)
- ``scheduled_transactions`` / ``recurring_transactions``
- ``user_preferences.excluded_accounts`` (JSON array of exact names)

Rollup tables (transfer_flows, investment_holdings, summaries) are
rebuilt from transactions on the next analytics refresh, so they are
left untouched. Import-time canonicalization in
``SyncEngine._canonicalize_account_casing`` keeps future uploads from
reintroducing variants.

Follows the repo convention of an empty ``downgrade()`` (restore from a
database backup to roll back).
"""

import json
from collections import defaultdict

import sqlalchemy as sa
from alembic import op

revision: str = "account_case_fold_2026"
down_revision: str | None = "partial_tx_indexes_2026"
branch_labels: str | None = None
depends_on: str | None = None

_ACCOUNT_LEGS = ("account", "from_account", "to_account")


def _build_canonical_map(bind: sa.Connection) -> dict[tuple[int, str], str]:
    """Map (user_id, lowercased name) -> canonical spelling.

    Canonical = the spelling backing the most transaction rows across all
    three account legs (ties broken by first-seen). Only groups with more
    than one spelling are returned.
    """
    counts: dict[tuple[int, str], dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for col in _ACCOUNT_LEGS:
        rows = bind.execute(
            sa.text(
                f"SELECT user_id, {col}, COUNT(*) FROM transactions "  # noqa: S608
                f"WHERE {col} IS NOT NULL GROUP BY user_id, {col}"
            )
        )
        for user_id, name, n in rows:
            counts[(user_id, name.lower())][name] += n

    return {
        key: max(spellings.items(), key=lambda kv: kv[1])[0]
        for key, spellings in counts.items()
        if len(spellings) > 1
    }


def _fold_transactions(bind: sa.Connection, canonical: dict[tuple[int, str], str]) -> None:
    for (user_id, low), canon in canonical.items():
        for col in _ACCOUNT_LEGS:
            bind.execute(
                sa.text(
                    f"UPDATE transactions SET {col} = :canon "  # noqa: S608
                    f"WHERE user_id = :uid AND LOWER({col}) = :low AND {col} != :canon"
                ),
                {"canon": canon, "uid": user_id, "low": low},
            )

    # Transfer categories embed the account names ("Transfer: A → B");
    # rebuild any label that drifted from the folded from/to pair.
    xfers = bind.execute(
        sa.text(
            "SELECT transaction_id, from_account, to_account, category FROM transactions "
            "WHERE type = 'TRANSFER' AND from_account IS NOT NULL AND to_account IS NOT NULL"
        )
    ).fetchall()
    for tx_id, from_account, to_account, category in xfers:
        expected = f"Transfer: {from_account} → {to_account}"
        if category != expected:
            bind.execute(
                sa.text("UPDATE transactions SET category = :cat WHERE transaction_id = :tid"),
                {"cat": expected, "tid": tx_id},
            )


def _fold_classifications(bind: sa.Connection, canonical: dict[tuple[int, str], str]) -> None:
    """Merge duplicate classification rows and align spellings to canonical.

    Ordered newest-first so the keeper (first member) carries the user's
    latest classification choice. The (user_id, account_name) unique index
    means duplicates must be deleted before the keeper is renamed.
    """
    rows = bind.execute(
        sa.text(
            "SELECT id, user_id, account_name FROM account_classifications "
            "ORDER BY updated_at DESC, id DESC"
        )
    ).fetchall()

    groups: dict[tuple[int, str], list] = defaultdict(list)
    for row in rows:
        groups[(row.user_id, row.account_name.lower())].append(row)

    for key, members in groups.items():
        canon = canonical.get(key)
        keeper = next((m for m in members if m.account_name == canon), members[0])
        target_name = canon or keeper.account_name

        for member in members:
            if member.id != keeper.id:
                bind.execute(
                    sa.text("DELETE FROM account_classifications WHERE id = :id"),
                    {"id": member.id},
                )
        if keeper.account_name != target_name:
            bind.execute(
                sa.text("UPDATE account_classifications SET account_name = :name WHERE id = :id"),
                {"name": target_name, "id": keeper.id},
            )


def _fold_planning_tables(bind: sa.Connection, canonical: dict[tuple[int, str], str]) -> None:
    for table in ("scheduled_transactions", "recurring_transactions"):
        for (user_id, low), canon in canonical.items():
            bind.execute(
                sa.text(
                    f"UPDATE {table} SET account = :canon "  # noqa: S608
                    f"WHERE user_id = :uid AND LOWER(account) = :low AND account != :canon"
                ),
                {"canon": canon, "uid": user_id, "low": low},
            )


def _parse_excluded_account_names(raw: str | None) -> list[object] | None:
    try:
        names = json.loads(raw or "[]")
    except (TypeError, ValueError):
        return None
    return names if isinstance(names, list) else None


def _canonicalize_excluded_account_names(
    user_id: int,
    names: list[object],
    canonical: dict[tuple[int, str], str],
) -> tuple[list[object], bool]:
    folded: list[object] = []
    seen: set[str] = set()
    changed = False
    for name in names:
        if not isinstance(name, str):
            folded.append(name)
            continue
        canonical_name = canonical.get((user_id, name.lower()), name)
        changed = changed or canonical_name != name
        canonical_key = canonical_name.lower()
        if canonical_key in seen:
            changed = True
            continue
        seen.add(canonical_key)
        folded.append(canonical_name)
    return folded, changed


def _fold_excluded_accounts(bind: sa.Connection, canonical: dict[tuple[int, str], str]) -> None:
    prefs = bind.execute(
        sa.text("SELECT user_id, excluded_accounts FROM user_preferences")
    ).fetchall()
    for user_id, raw in prefs:
        names = _parse_excluded_account_names(raw)
        if names is None:
            continue

        folded, changed = _canonicalize_excluded_account_names(user_id, names, canonical)
        if changed:
            bind.execute(
                sa.text(
                    "UPDATE user_preferences SET excluded_accounts = :val WHERE user_id = :uid"
                ),
                {"val": json.dumps(folded), "uid": user_id},
            )


def upgrade() -> None:
    bind = op.get_bind()
    canonical = _build_canonical_map(bind)

    if canonical:
        _fold_transactions(bind, canonical)
        _fold_planning_tables(bind, canonical)
        _fold_excluded_accounts(bind, canonical)

    # Classifications can hold case-variants even when transactions are
    # already consistent (stale rows from before a casing fix), so this
    # runs unconditionally.
    _fold_classifications(bind, canonical)


def downgrade() -> None:
    """No downgrade -- restore from a database backup."""
