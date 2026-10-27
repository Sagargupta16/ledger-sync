"""Money Manager repeat rules as the scheduled transactions they become.

A rule is labelled the way the backup's transactions are (normalization,
stored casing, then the user's categorization rules), so a schedule names its
account and category exactly as the rule's generated transactions do. Skipped
rules are counted by reason: ``unknown_type`` (a repeat or entry code nobody
has mapped), ``transfer`` (a schedule has no destination account, so readers
such as safe-to-spend would take a transfer between two of the user's own
accounts for money spent), ``not_inr``, ``ended``, ``incomplete`` (no account,
due date or amount) and ``invalid`` (a name or note the normalizer rejects,
such as one over 255 characters).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ledger_sync.core import rules as categorization
from ledger_sync.core.import_labels import canonicalize_accounts, canonicalize_categories
from ledger_sync.db.models import RecurrenceFrequency
from ledger_sync.ingest.money_manager_planning import BackupRepeatRule
from ledger_sync.ingest.normalizer import DataNormalizer, NormalizationError
from ledger_sync.schemas.upload import MAX_LABEL_LENGTH
from ledger_sync.services.external_ref_sync import Tally, Values

MAX_UID_LENGTH = 128
SCHEDULE_COLUMNS = (
    "name", "amount", "type", "category", "subcategory", "account", "frequency",
    "expected_day", "next_due_date", "end_date", "is_active", "note",
)  # fmt: skip
# A month-end rule is due on day 31; calendar readers clamp a day to the month.
_MONTH_END_DAY = 31
_VARIES_NOTE = "Amount varies in Money Manager; this is its latest amount."
_ROW_TYPES = {"income": "Income", "expense": "Expense"}


def schedule_values(
    db: Session, user_id: int, rules: list[BackupRepeatRule], tally: Tally
) -> dict[str, Values]:
    """The scheduled-transaction columns for each importable rule, by rule UID."""
    normalizer = DataNormalizer()
    rows: dict[str, dict[str, Any]] = {}
    by_uid = {rule.uid: rule for rule in rules}
    for rule in rules:
        row, problem = _rule_row(rule)
        if row is not None:
            try:
                rows[rule.uid] = normalizer.normalize_from_dict(row)
            except NormalizationError:
                problem = "invalid"
        if problem:
            tally.skipped[problem] += 1
    if not rows:
        return {}
    # The labelling steps SyncEngine applies to the backup's transactions.
    labelled = list(rows.values())
    canonicalize_accounts(db, user_id, labelled)
    canonicalize_categories(db, user_id, labelled)
    active_rules = categorization.load_active_rules(db, user_id)
    for row in labelled:
        categorization.apply_rules_to_row(active_rules, row)
    canonicalize_categories(db, user_id, labelled)
    return {uid: _schedule(by_uid[uid], row, normalizer) for uid, row in rows.items()}


def _rule_row(rule: BackupRepeatRule) -> tuple[dict[str, Any] | None, str | None]:
    """The rule as an upload row dated on its next due day, or why it is skipped."""
    if rule.cadence is None or rule.kind is None:
        return None, "unknown_type"
    if rule.kind == "transfer":
        return None, "transfer"
    if rule.currency not in (None, "INR"):
        return None, "not_inr"
    if rule.next_due is None or rule.end_date_unreadable:
        return None, "incomplete"
    if rule.end_date is not None and rule.end_date < rule.next_due:
        return None, "ended"
    if not rule.account or rule.amount is None or not 0 < len(rule.uid) <= MAX_UID_LENGTH:
        return None, "incomplete"
    return {
        "date": rule.next_due.isoformat(),
        "amount": rule.amount,
        "currency": "INR",
        "type": _ROW_TYPES[rule.kind],
        "account": rule.account,
        "category": rule.category,
        "subcategory": rule.subcategory,
        "note": rule.note,
    }, None


def _schedule(rule: BackupRepeatRule, row: dict[str, Any], normalizer: DataNormalizer) -> Values:
    due = row["date"]
    name = row["note"] or row["subcategory"] or row["category"]
    return {
        "name": name[:MAX_LABEL_LENGTH],
        "amount": row["amount"],
        "type": row["type"],
        "category": row["category"],
        "subcategory": row["subcategory"],
        "account": row["account"],
        "frequency": RecurrenceFrequency.MONTHLY,
        "expected_day": _MONTH_END_DAY if rule.cadence == "month_end" else due.day,
        "next_due_date": due,
        "end_date": normalizer.normalize_date(rule.end_date.isoformat()) if rule.end_date else None,
        "is_active": True,
        "note": _VARIES_NOTE if rule.amount_varies else None,
    }
