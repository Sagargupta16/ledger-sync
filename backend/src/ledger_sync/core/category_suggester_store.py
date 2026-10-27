"""Training and per-process caching of each user's category suggester.

The model trains on the user's live income and expense rows whose label is real
(transfers never train it). Income and expense are separate models, so it turns
on only at ``MIN_TRAINING_ROWS`` such rows with ``MIN_CATEGORIES`` categories
within one of the two types: two categories split across them would leave each
model a single label to offer.

A trained model is cached per process and user, keyed by a cheap ledger version
(the analytics ledger generation plus the live row count and newest
``updated_at``), so it is rebuilt only after the ledger changes.
"""

from __future__ import annotations

import threading
from collections import OrderedDict
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ledger_sync.core.category_suggester_features import label_of, row_features
from ledger_sync.core.category_suggester_model import DirectionModel
from ledger_sync.db.models import AnalyticsState, Transaction, TransactionType

MIN_TRAINING_ROWS = 30
MIN_CATEGORIES = 2
# A model keeps its user's note words per label (0.2 MB for the 5,309-row dev
# ledger), and a few users per process is plenty.
_CACHE_SIZE = 4


@dataclass(frozen=True, slots=True)
class SuggesterModel:
    """One user's trained models and the size of what they learned from.

    ``category_count`` is the most categories within one type, income or
    expense, since that is what one model can choose between.
    """

    models: dict[TransactionType, DirectionModel]
    training_rows: int
    category_count: int

    @property
    def ready(self) -> bool:
        return self.training_rows >= MIN_TRAINING_ROWS and self.category_count >= MIN_CATEGORIES


_cache: OrderedDict[int, tuple[tuple[object, ...], SuggesterModel]] = OrderedDict()
_cache_lock = threading.Lock()


def _ledger_version(session: Session, user_id: int) -> tuple[object, ...]:
    generation = session.scalar(
        select(AnalyticsState.ledger_version).where(AnalyticsState.user_id == user_id)
    )
    count, newest = session.execute(
        select(func.count(), func.max(Transaction.updated_at)).where(
            Transaction.user_id == user_id, Transaction.is_deleted.is_(False)
        )
    ).one()
    return (generation, count, newest)


def _train(session: Session, user_id: int) -> SuggesterModel:
    rows = session.execute(
        select(
            Transaction.type,
            Transaction.category,
            Transaction.subcategory,
            Transaction.note,
            Transaction.account,
            Transaction.amount,
            Transaction.date,
        ).where(
            Transaction.user_id == user_id,
            Transaction.is_deleted.is_(False),
            Transaction.type != TransactionType.TRANSFER,
        )
    )
    models: dict[TransactionType, DirectionModel] = {}
    categories: dict[TransactionType, set[str]] = {}
    count = 0
    for kind, category, subcategory, note, account, amount, when in rows:
        label = label_of(category, subcategory)
        if label is None:
            continue
        models.setdefault(kind, DirectionModel()).add(
            label, row_features(kind, note, account, amount, when)
        )
        categories.setdefault(kind, set()).add(category)
        count += 1
    widest = max((len(names) for names in categories.values()), default=0)
    return SuggesterModel(models=models, training_rows=count, category_count=widest)


def load_model(session: Session, user_id: int) -> SuggesterModel:
    """The user's model, trained at most once per ledger version in this process."""
    version = _ledger_version(session, user_id)
    with _cache_lock:
        cached = _cache.get(user_id)
        if cached is not None and cached[0] == version:
            _cache.move_to_end(user_id)
            return cached[1]
    model = _train(session, user_id)
    with _cache_lock:
        _cache[user_id] = (version, model)
        _cache.move_to_end(user_id)
        while len(_cache) > _CACHE_SIZE:
            _cache.popitem(last=False)
    return model
