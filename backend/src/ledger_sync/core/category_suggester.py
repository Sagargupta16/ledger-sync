"""Per-user category suggestions learned from the user's own categorised rows.

The model is trained and cached by ``category_suggester_store``. It abstains for
a row whose note has no word another row taught it, and when its best label is
below ``CONFIDENCE_FLOOR``; otherwise it returns that label plus the runner-up
when the runner-up reaches ``RUNNER_UP_FLOOR``. Nothing here writes: callers
show the suggestions and the user decides.

Measured on the dev ledger (5,309 categorised rows). Time split, each of the
last 12 months scored by a model of the months before it (1,662 rows): 94.6%
got a suggestion and 96.6% of those were right. Leave one out over every row:
89.5% got one and 91.7% of those were right. Placeholder rows are another
matter: 570 of the 587 have no note word the model knows, and 4 got one.
"""

from __future__ import annotations

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from ledger_sync.core import rules
from ledger_sync.core.category_suggester_features import Label, RowFeatures, label_of, row_features
from ledger_sync.core.category_suggester_store import SuggesterModel, load_model
from ledger_sync.db.models import Transaction, TransactionType
from ledger_sync.ingest.normalizer import DataNormalizer, NormalizationError

CONFIDENCE_FLOOR = 0.5
MAX_SUGGESTIONS = 2
# Time split on the dev ledger: a runner-up under 0.05 was right for 12 of 1,461
# rows, one at or above it for 28 of 111, so a weaker runner-up is noise.
RUNNER_UP_FLOOR = 0.05

#: What one row is scored on: its features and, for a stored row, its own label.
_Key = tuple[RowFeatures, Label | None]


@dataclass(frozen=True, slots=True)
class CategorySuggestion:
    """One suggested label with the model's probability for it."""

    category: str
    subcategory: str | None
    confidence: float


@dataclass(frozen=True, slots=True)
class RowSuggestions:
    """Suggestions for unsaved rows in input order, and how many a rule will set."""

    ready: bool
    suggestions: list[list[CategorySuggestion]]
    rule_matched: int


def _suggest(
    model: SuggesterModel, features: RowFeatures, own: Label | None
) -> list[CategorySuggestion]:
    direction_model = model.models.get(features.direction)
    if not model.ready or direction_model is None:
        return []
    ranked = direction_model.rank(features, own)
    if not ranked or ranked[0][1] < CONFIDENCE_FLOOR:
        return []
    return [
        CategorySuggestion(category=label[0], subcategory=label[1], confidence=round(share, 3))
        for index, (label, share) in enumerate(ranked[:MAX_SUGGESTIONS])
        if index == 0 or share >= RUNNER_UP_FLOOR
    ]


def _score_all(
    model: SuggesterModel, keys: Iterable[_Key | None]
) -> list[list[CategorySuggestion]]:
    """``_suggest`` per key in order, ranking each distinct key once; None abstains.

    Rows repeat: the 587 placeholder rows of the dev ledger hold 225 distinct keys.
    """
    memo: dict[_Key, list[CategorySuggestion]] = {}
    results: list[list[CategorySuggestion]] = []
    for key in keys:
        if key is None:
            results.append([])
            continue
        if key not in memo:
            memo[key] = _suggest(model, *key)
        results.append(list(memo[key]))
    return results


def suggest_for_transactions(
    session: Session, user_id: int, transactions: Sequence[Transaction]
) -> dict[str, list[CategorySuggestion]]:
    """Top suggestions per stored transaction ID; an empty list means abstain.

    A categorised row is part of the training data, so it is scored with its own
    counts left out: the result reflects the rest of the ledger, not the label
    the row already has. Transfers, deleted rows and other users' rows always
    get an empty list.
    """
    model = load_model(session, user_id)
    keys = [
        None
        if tx.user_id != user_id or tx.is_deleted or tx.type == TransactionType.TRANSFER
        else (
            row_features(tx.type, tx.note, tx.account, tx.amount, tx.date),
            label_of(tx.category, tx.subcategory),
        )
        for tx in transactions
    ]
    picks = _score_all(model, keys)
    return {tx.transaction_id: items for tx, items in zip(transactions, picks, strict=True)}


def suggest_for_rows(
    session: Session, user_id: int, rows: Sequence[dict[str, Any]]
) -> RowSuggestions:
    """Suggestions for unsaved upload rows, read the way the import will store them.

    ``rows`` take the upload's shape (an ISO date string, amount, type, account,
    category, subcategory, note) and go through the import normalizer, so notes
    and accounts are scored in their stored spelling. Transfers abstain, and so
    does a row an active categorization rule will recategorize on import: the
    rule decides its category, so it is counted in ``rule_matched`` instead.
    """
    model = load_model(session, user_id)
    active_rules = rules.load_active_rules(session, user_id)
    normalizer = DataNormalizer()
    keys: list[_Key | None] = []
    rule_matched = 0
    for raw in rows:
        try:
            # A datetime skips the normalizer's pandas date parse, which was two
            # thirds of its time; the upload schema has already checked the date.
            row = normalizer.normalize_from_dict(
                {**raw, "date": datetime.fromisoformat(raw["date"])}
            )
        except NormalizationError:
            keys.append(None)
            continue
        if row["is_transfer"]:
            keys.append(None)
        elif any(rules.match_rule(rule, row["note"], row["account"]) for rule in active_rules):
            rule_matched += 1
            keys.append(None)
        else:
            features = row_features(
                row["type"], row["note"], row["account"], row["amount"], row["date"]
            )
            keys.append((features, None))
    return RowSuggestions(
        ready=model.ready, suggestions=_score_all(model, keys), rule_matched=rule_matched
    )
