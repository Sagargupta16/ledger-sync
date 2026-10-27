"""A backup's repeat rules and budgets, imported beside its ledger snapshot.

Repeat rules become scheduled transactions (``money_manager_schedules``) and
monthly budgets become budgets, each linked to its Money Manager UID through
``external_refs``; ``external_ref_sync`` says how later edits, deletions and
hand-made rows are treated.

Budgets are labelled like the backup's transactions, so budget tracking
matches them. Skipped budgets are counted by reason: ``yearly`` (a budget here
holds one monthly limit), ``subcategory`` (budget tracking still sums the
whole category, so a subcategory budget would be measured against its
parent's spending), ``unsupported`` (account, total or unmapped budgets),
``missing_category`` (deleted in Money Manager), ``invalid`` (a category name
the normalizer rejects), ``no_amount``, and ``conflict`` (the category already
has a budget: one made in Ledger Sync, or another Money Manager budget).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import inspect
from sqlalchemy.orm import Session

from ledger_sync.core.analytics.refresh import mark_preferences_changed
from ledger_sync.core.import_labels import canonicalize_categories
from ledger_sync.core.ledger_clock import ledger_today_iso
from ledger_sync.db.models import Budget, ExternalRef, ScheduledTransaction
from ledger_sync.ingest.money_manager import SOURCE_SYSTEM
from ledger_sync.ingest.money_manager_planning import (
    BackupBudget,
    BackupPlanning,
    BackupRepeatRule,
)
from ledger_sync.ingest.normalizer import DataNormalizer, NormalizationError
from ledger_sync.schemas.money_manager import PlanningCounts, PlanningSummary
from ledger_sync.services.external_ref_sync import LinkedRows, Tally, Values
from ledger_sync.services.money_manager_schedules import (
    MAX_UID_LENGTH,
    SCHEDULE_COLUMNS,
    schedule_values,
)
from ledger_sync.utils.logging import logger

REPEAT_RULE_KIND = "repeat_rule"
BUDGET_KIND = "budget"
_BUDGET_COLUMNS = ("category", "subcategory", "monthly_limit", "is_active")


def sync_planning(
    db: Session, user_id: int, planning: BackupPlanning, *, apply: bool
) -> PlanningSummary | None:
    """Compare the backup's repeat rules and budgets with what is stored; write with apply."""
    if planning.repeat_rules is None and planning.budgets is None:
        return None
    # Vercel can serve this code before the migration that adds the link table
    # runs. Until it has, the ledger imports exactly as before.
    if not inspect(db.connection()).has_table(ExternalRef.__tablename__):
        logger.warning("Skipping repeat rules and budgets: external_refs is not migrated yet")
        return None
    rules, budgets = planning.repeat_rules, planning.budgets
    return PlanningSummary(
        repeat_rules=None if rules is None else _sync_rules(db, user_id, rules, apply),
        budgets=None if budgets is None else _sync_budgets(db, user_id, budgets, apply),
    )


def _sync_rules(
    db: Session, user_id: int, rules: list[BackupRepeatRule], apply: bool
) -> PlanningCounts:
    tally = Tally(found=len(rules))
    LinkedRows(
        db=db,
        user_id=user_id,
        system=SOURCE_SYSTEM,
        kind=REPEAT_RULE_KIND,
        model=ScheduledTransaction,
        columns=SCHEDULE_COLUMNS,
        apply=apply,
    ).sync(schedule_values(db, user_id, rules, tally), tally)
    return _counts(tally)


def _sync_budgets(
    db: Session, user_id: int, budgets: list[BackupBudget], apply: bool
) -> PlanningCounts:
    tally = Tally(found=len(budgets))
    LinkedRows(
        db=db,
        user_id=user_id,
        system=SOURCE_SYSTEM,
        kind=BUDGET_KIND,
        model=Budget,
        columns=_BUDGET_COLUMNS,
        apply=apply,
        scope=_category_scope,
    ).sync(_budget_values(db, user_id, budgets, tally), tally)
    # Budgets feed budget tracking and its alerts, so insights must rebuild.
    if apply and tally.changed:
        mark_preferences_changed(db, user_id)
    return _counts(tally)


def _counts(tally: Tally) -> PlanningCounts:
    return PlanningCounts(
        found=tally.found,
        added=tally.added,
        updated=tally.updated,
        unchanged=tally.unchanged,
        kept=tally.kept,
        removed=tally.removed,
        skipped=dict(sorted(tally.skipped.items())),
    )


def _budget_values(
    db: Session, user_id: int, budgets: list[BackupBudget], tally: Tally
) -> dict[str, Values]:
    """The budget columns for each importable budget, by budget UID."""
    normalizer = DataNormalizer()
    rows: dict[str, dict[str, Any]] = {}
    for budget in budgets:
        problem = _budget_problem(budget)
        if problem is None:
            # normalize_from_dict labels the category as it labels a transaction's;
            # the date and account only complete the row it expects.
            row = {
                "date": ledger_today_iso(),
                "amount": budget.amount,
                "type": "Expense",
                "account": "Budget",
                "category": budget.category,
            }
            try:
                rows[budget.uid] = normalizer.normalize_from_dict(row)
            except NormalizationError:
                problem = "invalid"
        if problem:
            tally.skipped[problem] += 1
    canonicalize_categories(db, user_id, list(rows.values()))
    return {
        uid: {
            "category": row["category"],
            "subcategory": None,
            "monthly_limit": row["amount"],
            "is_active": True,
        }
        for uid, row in rows.items()
    }


def _budget_problem(budget: BackupBudget) -> str | None:
    if budget.period == "yearly":
        return "yearly"
    if budget.period is None or not budget.category_budget:
        return "unsupported"
    if not 0 < len(budget.uid) <= MAX_UID_LENGTH:
        return "unsupported"
    if budget.category is None:
        return "missing_category"
    if budget.subcategory is not None:
        return "subcategory"
    if budget.amount is None:
        return "no_amount"
    return None


def _category_scope(values: Values) -> tuple[object, object]:
    """The budgets table allows one budget per category and subcategory pair."""
    return values["category"], values["subcategory"]
