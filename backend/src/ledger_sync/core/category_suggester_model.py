"""Multinomial naive Bayes over one user's categorised rows, in plain Python.

A row is read as its distinct note tokens plus three categorical features: the
account, a log2 amount bucket and the weekday (``category_suggester_features``).
Income and expense rows train separate models, so the direction is a hard
filter and an expense is never offered an income category. Every family uses
add-one smoothing, and a token or value the training rows never contained is
skipped rather than charged to every label (which would penalise the large ones).

Counts are additive, so a row the model trained on is scored with its own
counts removed (leave one out). Otherwise it would mostly vote for the label it
already carries, and a "likely miscategorised" check could never flag it.

A row needs at least one note token the model has seen. Without one, only the
label sizes, account, amount and weekday are left, and on the dev ledger those
posteriors were not probabilities: scored leave one out, 2 of the 21 such rows
at 0.8 or more were right (rows with a known token: 4,058 of 4,205). So the
model ranks nothing for them rather than show a confident guess.
"""

from __future__ import annotations

import math
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from ledger_sync.core.category_suggester_features import Label, RowFeatures

_ALPHA = 1.0


def _label_counter() -> defaultdict[Label, Counter[str | int]]:
    return defaultdict(Counter)


@dataclass(slots=True)
class _Family:
    """Per-label counts of one categorical feature."""

    by_label: defaultdict[Label, Counter[str | int]] = field(default_factory=_label_counter)
    totals: Counter[str | int] = field(default_factory=Counter)

    def add(self, label: Label, value: str | int) -> None:
        self.by_label[label][value] += 1
        self.totals[value] += 1

    def log_likelihood(
        self, label: Label, value: str | int, docs: int, *, mine: int, held_out: int
    ) -> float:
        """Smoothed log P(value | label); 0 for a value no other row carries."""
        if self.totals[value] - held_out <= 0:
            return 0.0
        count = max(self.by_label[label][value] - mine, 0)
        return math.log((count + _ALPHA) / (docs + _ALPHA * len(self.totals)))


@dataclass(slots=True)
class DirectionModel:
    """Counts for the income or the expense rows of one user."""

    docs: Counter[Label] = field(default_factory=Counter)
    tokens: defaultdict[Label, Counter[str | int]] = field(default_factory=_label_counter)
    token_totals: Counter[Label] = field(default_factory=Counter)
    token_rows: Counter[str] = field(default_factory=Counter)
    accounts: _Family = field(default_factory=_Family)
    buckets: _Family = field(default_factory=_Family)
    weekdays: _Family = field(default_factory=_Family)

    def add(self, label: Label, features: RowFeatures) -> None:
        self.docs[label] += 1
        self.tokens[label].update(features.tokens)
        self.token_totals[label] += len(features.tokens)
        self.token_rows.update(features.tokens)
        self.accounts.add(label, features.account)
        self.buckets.add(label, features.amount_bucket)
        self.weekdays.add(label, features.weekday)

    def rank(self, features: RowFeatures, own: Label | None = None) -> list[tuple[Label, float]]:
        """Posterior per label, best first.

        [] when fewer than two labels compete, or when no note token of the row
        occurs in another training row (no evidence, see the module docstring).
        Pass ``own`` when the row itself is in the training data: its counts are
        then subtracted from that label and from the feature totals.
        """
        held_out = 0 if own is None else 1
        known = [token for token in features.tokens if self.token_rows[token] - held_out > 0]
        if not known:
            return []
        vocabulary = len(self.token_rows)
        scores: dict[Label, float] = {}
        for label, count in self.docs.items():
            mine = 1 if label == own else 0
            docs = count - mine
            if docs <= 0:
                continue
            score = math.log(docs)
            counts = self.tokens[label]
            total = max(self.token_totals[label] - mine * len(features.tokens), 0)
            denominator = math.log(total + _ALPHA * vocabulary)
            for token in known:
                score += math.log(max(counts[token] - mine, 0) + _ALPHA) - denominator
            for family, value in (
                (self.accounts, features.account),
                (self.buckets, features.amount_bucket),
                (self.weekdays, features.weekday),
            ):
                score += family.log_likelihood(label, value, docs, mine=mine, held_out=held_out)
            scores[label] = score
        if len(scores) < 2:
            return []
        best = max(scores.values())
        weights = {label: math.exp(score - best) for label, score in scores.items()}
        total_weight = sum(weights.values())
        ranked = [(label, weight / total_weight) for label, weight in weights.items()]
        ranked.sort(key=lambda item: (-item[1], item[0][0], item[0][1] or ""))
        return ranked
