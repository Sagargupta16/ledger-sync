"""V2 endpoint: data health (import freshness, rollup freshness, ledger quality).

Mounted by ``summaries`` so the route keeps its original position and path.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter
from sqlalchemy import desc, func, or_
from sqlalchemy.orm import Session

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.core.analytics.merchant_extract import PLACEHOLDER_NOTES
from ledger_sync.core.expense_class import (
    KEY_SEPARATOR,
    capital_loss_keys,
    is_capital_loss,
    looks_like_capital_loss,
)
from ledger_sync.core.ledger_clock import ledger_today_iso
from ledger_sync.core.query_helpers import fmt_date
from ledger_sync.db.models import (
    ImportLog,
    MonthlySummary,
    Transaction,
    TransactionType,
    UserPreferences,
)

router = APIRouter()

# The catch-all bucket the categoriser falls back to. Counted as
# uncategorised because it carries no analytical meaning.
CATCH_ALL_CATEGORY = "Miscellaneous"


def _last_import(db: Session, user_id: int) -> dict[str, Any]:
    """Most recent import for *user_id*, plus how stale it is in days.

    ``imported_at`` is stored naive (the column is a plain ``DateTime`` on both
    SQLite and Postgres) with UTC values, so ``now`` is stripped of its tzinfo
    before subtracting -- mixing aware and naive raises.
    """
    log = (
        db.query(ImportLog)
        .filter(ImportLog.user_id == user_id)
        .order_by(desc(ImportLog.imported_at))
        .first()
    )
    if log is None:
        return {
            "last_import_at": None,
            "days_stale": None,
            "last_import_file_name": None,
            "rows_processed": None,
            "rows_inserted": None,
            "rows_updated": None,
            "rows_skipped": None,
        }

    imported_at = log.imported_at
    reference = datetime.now(UTC)
    if imported_at.tzinfo is None:
        reference = reference.replace(tzinfo=None)
    days_stale = max(0, (reference - imported_at).days)

    return {
        "last_import_at": imported_at.isoformat(),
        "days_stale": days_stale,
        "last_import_file_name": log.file_name,
        "rows_processed": log.rows_processed,
        "rows_inserted": log.rows_inserted,
        "rows_updated": log.rows_updated,
        "rows_skipped": log.rows_skipped,
    }


def _rollup_freshness(db: Session, user_id: int) -> dict[str, Any]:
    """Whether the pre-aggregated tables kept up with the last import.

    Every analytics page reads rollups, not raw transactions, so a refresh that
    failed after a successful import leaves the whole workspace quietly serving
    the previous import's numbers. That is exactly what happened on this
    ledger: the 2026-07-26 import committed 508 inserts and 373 deletes, the
    post-upload refresh did not land, and every rollup table stayed stamped
    2026-07-04 -- July expenses displayed 74,523.22 against a true 107,651.65,
    understated by 33,128.43 (44%), for 22 days with nothing on screen to say so.

    ``upload.py`` deliberately does not fail an upload when the refresh blows up
    (the raw rows are already committed, and a Neon statement timeout must not
    reject good data), and the frontend's explicit ``/refresh`` pass can miss the
    same way. Neither leaves a mark the user can see. Comparing the newest
    ``last_calculated`` against the newest ``imported_at`` turns that silent
    divergence into a fact the client can render and act on.

    Both columns are naive UTC audit timestamps, so they compare directly.
    """
    rollups_at = (
        db.query(func.max(MonthlySummary.last_calculated))
        .filter(MonthlySummary.user_id == user_id)
        .scalar()
    )
    imported_at = (
        db.query(func.max(ImportLog.imported_at)).filter(ImportLog.user_id == user_id).scalar()
    )

    # Stale means "an import happened that the rollups have not absorbed". No
    # import at all is not stale -- there is nothing to be behind. Rollups
    # missing entirely while an import exists IS stale: that is the first-run
    # failure, and it reads as an empty workspace rather than a wrong one.
    if imported_at is None:
        stale = False
    else:
        stale = rollups_at is None or rollups_at < imported_at

    return {
        "rollups_calculated_at": rollups_at.isoformat() if rollups_at else None,
        "rollups_stale": stale,
    }


def _ledger_quality(db: Session, user_id: int) -> dict[str, Any]:
    """Row counts, date span, and the three data-quality counts.

    Dates go through ``fmt_date`` so the min/max compare and the
    future-dated test are plain ``YYYY-MM-DD`` string operations -- correct on
    both SQLite (``strftime``) and Postgres (``to_char``), and immune to the
    driver returning a naive vs aware datetime.

    Placeholder notes reuse ``PLACEHOLDER_NOTES``, the same canonical set
    merchant extraction refuses to turn into a merchant, matched on the
    lowercased and trimmed note. A single case-sensitive literal reported
    "unknown", "N/A", "-" and "misc" as clean data.
    """
    base = db.query(Transaction).filter(
        Transaction.user_id == user_id,
        Transaction.is_deleted.is_(False),
    )
    day = fmt_date(Transaction.date)
    # IST, via the central ledger clock: "after today" has to be judged in the
    # user's wall clock, and the rule lives in one place rather than being
    # restated per endpoint.
    today = ledger_today_iso()

    count, earliest, latest = base.with_entities(
        func.count(),
        func.min(day),
        func.max(day),
    ).one()

    future_dated_count = base.filter(day > today).count()
    placeholder_note_count = base.filter(
        func.lower(func.trim(Transaction.note)).in_(sorted(PLACEHOLDER_NOTES))
    ).count()
    uncategorized_count = base.filter(
        or_(
            Transaction.category.is_(None),
            func.trim(Transaction.category) == "",
            Transaction.category == CATCH_ALL_CATEGORY,
        )
    ).count()

    return {
        "transaction_count": count,
        "earliest_date": earliest,
        "latest_date": latest,
        "future_dated_count": future_dated_count,
        "placeholder_note_count": placeholder_note_count,
        "uncategorized_count": uncategorized_count,
    }


def _unclassified_capital_losses(db: Session, user_id: int) -> dict[str, Any]:
    """Surface EXPENSE taxonomies that read like realised investment losses.

    THIS IS THE WHOLE POINT OF THE DETECTION LAYER. A realised trading loss has
    to be booked as an ``EXPENSE`` for a cashbook's cash column to balance, but
    it bought nothing, so summing it as spending inflates expense totals, the
    essential/discretionary split, the 50/30/20 Wants share and the anomaly
    baseline simultaneously. Measured on one real ledger: 216,985.85 across 4
    rows, 5.43% of live expenses, dragging one month's savings rate from -68.4%
    to -180.1%.

    The fix is NOT to reclassify. The rows are typed ``EXPENSE`` in the user's
    own ledger and only they can say a given row is a loss, so this reports
    candidates and the user decides via ``PUT
    /api/preferences/capital-loss-categories``. Anything already classified is
    filtered out, so the signal empties as they work through it.

    Aggregation happens in SQL over the DISTINCT taxonomy pairs, not per row, so
    the regex pass is bounded by the size of the user's taxonomy (tens) rather
    than their ledger (thousands).
    """
    rows = (
        db.query(
            Transaction.category,
            Transaction.subcategory,
            func.count().label("txn_count"),
            func.coalesce(func.sum(Transaction.amount), 0).label("total"),
        )
        .filter(
            Transaction.user_id == user_id,
            Transaction.is_deleted.is_(False),
            Transaction.type == TransactionType.EXPENSE,
        )
        .group_by(Transaction.category, Transaction.subcategory)
        .all()
    )

    prefs = (
        db.query(UserPreferences.capital_loss_categories)
        .filter(UserPreferences.user_id == user_id)
        .scalar()
    )
    already_classified = capital_loss_keys(prefs)

    candidates = [
        {
            "category": row.category,
            "subcategory": row.subcategory,
            # The exact key PUT /api/preferences/capital-loss-categories
            # expects, so the client never has to build it and cannot drift
            # from the separator the backend parses.
            "key": f"{row.category or ''}{KEY_SEPARATOR}{row.subcategory or ''}",
            "transaction_count": int(row.txn_count or 0),
            "total_amount": float(row.total or 0),
        }
        for row in rows
        if looks_like_capital_loss(row.category, row.subcategory)
        and not is_capital_loss(row.category, row.subcategory, already_classified)
    ]
    candidates.sort(key=lambda c: float(c["total_amount"]), reverse=True)

    return {
        "capital_loss_candidates": candidates,
        "capital_loss_candidate_count": sum(int(c["transaction_count"]) for c in candidates),
        "capital_loss_candidate_amount": sum(float(c["total_amount"]) for c in candidates),
    }


@router.get("/data-health")
def get_data_health(
    current_user: CurrentUser,
    db: DatabaseSession,
) -> dict[str, Any]:
    """Report freshness and quality of the user's imported ledger.

    Answers the questions a finance workspace should not make its user guess
    at: when did I last import, is that stale, and how much of what I imported
    is unusable?

    * Freshness -- ``last_import_at`` / ``days_stale`` and the row stats of the
      most recent ``import_logs`` entry, plus ``rollups_calculated_at`` /
      ``rollups_stale``: a successful import whose analytics refresh did not
      land leaves every page serving the PREVIOUS import's numbers, and that is
      otherwise invisible (see ``_rollup_freshness``).
    * Coverage -- ``transaction_count`` plus the ``earliest_date`` /
      ``latest_date`` span.
    * Quality -- ``future_dated_count`` (dated after today in IST, which skews
      any "current month" total), ``placeholder_note_count`` (the note is one of
      the canonical placeholders -- "Unknown", "N/A", "-", "misc" -- so
      merchant/recurring detection has nothing to match), and
      ``uncategorized_count`` (no category, or the ``Miscellaneous`` catch-all).
    * Misclassification -- ``capital_loss_candidates``: EXPENSE taxonomies that
      read like realised investment losses and are therefore being summed as
      spending. Reported, never auto-applied, because only the user can confirm
      it and confirming moves their historical expense totals.

    Excluded-accounts is deliberately NOT applied: this is a diagnostic about
    what was imported, and hiding rows the user has excluded from analytics
    would understate the real quality problem.
    """
    return {
        **_last_import(db, current_user.id),
        **_rollup_freshness(db, current_user.id),
        **_ledger_quality(db, current_user.id),
        **_unclassified_capital_losses(db, current_user.id),
    }
