"""rewrite the singular Refund & Cashbacks preference key to the plural spelling

Revision ID: cashback_key_drift_2026
Revises: recurring_pattern_kind_2026
Create Date: 2026-07-27 10:00:00.000000

``user_preferences.non_taxable_income_categories`` holds EXACT-MATCH
"Category::Subcategory" keys. A key no transaction carries contributes zero
SILENTLY: nothing raises, a KPI just reads 0.

Two keys seeded by 20260204_1200_income_subcategory_format drifted from the
category names real exports carry: the stored keys said "Refund & Cashbacks"
(SINGULAR) and "Deposits Return", while the data carries "Refunds & Cashbacks"
and "Deposit Return". Both stored keys match 0 rows.

The money-affecting consumer is ``api/calculations_helpers.py::
_compute_income_analysis``, which sums income rows whose Category::Subcategory
appears in the list the client forwards as ``cashback_categories`` -- so the
whole cashback/refund block summed to 0 in the income-analysis response and in
the dashboard cashback KPI. It does NOT change the tax base: nothing in
``ClassificationMixin`` reads this column (only ``taxable_income_categories``
and ``investment_returns_categories`` are read there), so these rows were
already outside taxable income.

Later code fixes to the shipped DEFAULTS cannot repair a stored value: a
non-empty stored list is honoured verbatim, so only a data migration reaches
these rows.

Rewrites the drifted keys to the spelling the data uses, for every user, and
appends the plural counterparts the singular ones were standing in for. The
singular keys are KEPT -- another user's export may legitimately carry them, and
an unmatched key costs nothing while a missing one costs money.

A plural key already filed in one of the three SIBLING income lists is skipped.
The four lists are a partition written by one exclusive-assignment UI, and the
consumers resolve them in a fixed order (``classifyIncomeType`` checks
non-taxable BEFORE other), so appending a key the user had already filed
elsewhere would silently move that money between buckets. This state is
reachable today: the 20260204_1200 seed leaves the singular refund keys in
non-taxable while a user who reclassified in Settings holds the plural spellings
under ``other_income_categories``. This migration repairs a spelling; it must not
reclassify.

Idempotent by construction: it works on the parsed JSON list, appends only keys
not already present, and writes only when the list actually changed. Rows
holding NULL, blank, malformed JSON, a non-list JSON value, or an empty list are
skipped -- empty means "unconfigured" for this field, and seeding it here would
convert a fallback into a stored opinion.

Follows the repo convention of an empty ``downgrade()`` (restore from a
database backup to roll back).
"""

import json

import sqlalchemy as sa
from alembic import op

revision: str = "cashback_key_drift_2026"
down_revision: str | None = "recurring_pattern_kind_2026"
branch_labels: str | None = None
depends_on: str | None = None

# Drifted stored key -> the spelling the real data carries. Applied to the
# parsed list, so a value already holding the plural key is left untouched.
_CASHBACK = "Refunds & Cashbacks"
_KEY_REWRITES = {
    "Refund & Cashbacks::Credit Card Cashbacks": f"{_CASHBACK}::Credit Card Cashbacks",
    "Refund & Cashbacks::Other Cashbacks": f"{_CASHBACK}::Other Cashbacks",
    "Refund & Cashbacks::Product/Service Refunds": f"{_CASHBACK}::Product/Service Refunds",
    "Refund & Cashbacks::Deposits Return": f"{_CASHBACK}::Deposit Return",
}

# The sibling income lists, read only to answer "is this key already filed
# somewhere else?" -- see the module docstring.
_SIBLING_COLUMNS = (
    "taxable_income_categories",
    "investment_returns_categories",
    "other_income_categories",
)


def _parse_key_list(raw: object) -> list[object] | None:
    """Return the stored JSON array, or ``None`` when it is unusable.

    Unusable = NULL, blank, malformed JSON, a non-list JSON value, or an empty
    list. Each is left exactly as found rather than rewritten.
    """
    if not isinstance(raw, str) or not raw.strip():
        return None
    try:
        parsed = json.loads(raw)
    except (TypeError, ValueError):
        return None
    if not isinstance(parsed, list) or not parsed:
        return None
    return parsed


def _string_members(raw: object) -> set[str]:
    """String members of a stored JSON list; empty set when it is unusable.

    Only used to answer "is this key already classified?", so an unusable
    sibling value simply claims nothing.
    """
    parsed = _parse_key_list(raw)
    if parsed is None:
        return set()
    return {k for k in parsed if isinstance(k, str)}


def _rewrite_keys(keys: list[object], claimed: set[str]) -> tuple[list[object], bool]:
    """Append the real-data spelling for every drifted key present.

    ``claimed`` holds the keys already filed in a sibling income list; those are
    skipped so a spelling repair never moves money between buckets. Order is
    preserved and non-string members pass through untouched, so a hand-edited
    value keeps its shape. Returns the new list and whether it differs from the
    input.
    """
    present = {k for k in keys if isinstance(k, str)}
    additions = [
        plural
        for singular, plural in _KEY_REWRITES.items()
        if singular in present and plural not in present and plural not in claimed
    ]
    if not additions:
        return keys, False
    return [*keys, *additions], True


def upgrade() -> None:
    bind = op.get_bind()
    columns = ", ".join(("non_taxable_income_categories", *_SIBLING_COLUMNS))
    rows = bind.execute(sa.text(f"SELECT user_id, {columns} FROM user_preferences")).fetchall()

    for user_id, raw, *sibling_raws in rows:
        keys = _parse_key_list(raw)
        if keys is None:
            continue

        claimed: set[str] = set()
        for sibling_raw in sibling_raws:
            claimed |= _string_members(sibling_raw)

        rewritten, changed = _rewrite_keys(keys, claimed)
        if not changed:
            continue

        bind.execute(
            sa.text(
                "UPDATE user_preferences SET non_taxable_income_categories = :val "
                "WHERE user_id = :uid"
            ),
            {"val": json.dumps(rewritten), "uid": user_id},
        )


def downgrade() -> None:
    """No downgrade -- restore from a database backup."""
