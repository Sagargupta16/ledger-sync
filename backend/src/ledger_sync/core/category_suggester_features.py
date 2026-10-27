"""What the category suggester reads from a row: its label and its features.

A label is (category, subcategory). A row with placeholder labels on both is
not categorised: it never trains the model and is what suggestions are for. The
features are the distinct note words, the account, a doubling amount bucket and
the weekday.
"""

from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal

from ledger_sync.core.analytics.merchant_extract import is_placeholder
from ledger_sync.db.models import TransactionType

#: (category, subcategory), subcategory None when the row has none.
Label = tuple[str, str | None]

#: Labels that say "not categorised yet", compared trimmed and casefolded.
#: Deliberately not Data Health's uncategorised count, which takes category
#: Miscellaneous or blank with any subcategory (``CATCH_ALL_CATEGORY`` in
#: ``api/analytics_v2_impl/summaries_health.py``). Here both labels must be
#: placeholders, so "Miscellaneous / Bank Fees" is a real label that trains the
#: model, while "Other" with no subcategory is not. The two counts can differ.
PLACEHOLDER_LABELS = frozenset(
    {
        "", "-", "--", "?", "n/a", "na", "none", "null", "unknown", "uncategorized",
        "uncategorised", "misc", "miscellaneous", "other", "others", "general",
    }
)  # fmt: skip

_WORD = re.compile(r"[^\W_]+")
# Excel exports leave a literal carriage-return marker in text cells.
_XL_ARTIFACT = re.compile(r"_x000d_", re.IGNORECASE)
# Payment-rail boilerplate, filler and month names, which appear under every
# category. Whole words only: "Dmart" and "Instamart" keep their "mart".
_STOPWORDS = frozenset(
    {
        "upi", "neft", "imps", "rtgs", "nach", "ach", "ecs", "ref", "txn", "pos", "no",
        "the", "and", "to", "of", "for", "from", "by", "at", "in", "on", "via", "with",
        "ltd", "pvt", "private", "limited",
        "jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "sept", "oct", "nov",
        "dec", "january", "february", "march", "april", "june", "july", "august",
        "september", "october", "november", "december",
    }
)  # fmt: skip


def is_placeholder_label(value: str | None) -> bool:
    """True for an empty or catch-all label such as Other or Uncategorised."""
    return " ".join((value or "").split()).casefold() in PLACEHOLDER_LABELS


def is_uncategorised(category: str | None, subcategory: str | None) -> bool:
    """A placeholder category with no real subcategory under it."""
    return is_placeholder_label(category) and is_placeholder_label(subcategory)


def label_of(category: str, subcategory: str | None) -> Label | None:
    """The training label of a stored row, or None when it is not categorised."""
    return None if is_uncategorised(category, subcategory) else (category, subcategory or None)


@dataclass(frozen=True, slots=True)
class RowFeatures:
    """Everything the model reads from one row."""

    direction: TransactionType
    tokens: frozenset[str]
    account: str
    amount_bucket: int
    weekday: int


def note_tokens(note: str | None) -> frozenset[str]:
    """Distinct casefolded words of a note, without references or card digits.

    Any word that holds a digit is dropped, which removes UPI reference numbers,
    card endings, dates, amounts, quantities and IFSC-style codes. ``xxxx`` card
    masks, one-letter words and the stopwords go too, and a placeholder note
    such as "Unknown" yields nothing.
    """
    cleaned = _XL_ARTIFACT.sub(" ", note or "")
    if is_placeholder(cleaned):
        return frozenset()
    words = _WORD.findall(unicodedata.normalize("NFKC", cleaned).casefold())
    return frozenset(
        word
        for word in words
        if len(word) > 1
        and word.strip("x")
        and not any(char.isdigit() for char in word)
        and word not in _STOPWORDS
    )


def amount_bucket(amount: Decimal | float) -> int:
    """Doubling bucket of an amount: 0 below 2, 1 for [2, 4), 2 for [4, 8) and so on."""
    value = float(amount)
    return int(math.log2(value)) if value >= 1 else 0


def row_features(
    direction: TransactionType,
    note: str | None,
    account: str | None,
    amount: Decimal | float,
    when: date | datetime,
) -> RowFeatures:
    """Build the feature set of one stored or unsaved row."""
    day = when.date() if isinstance(when, datetime) else when
    return RowFeatures(
        direction=direction,
        tokens=note_tokens(note),
        account=" ".join((account or "").split()).casefold(),
        amount_bucket=amount_bucket(amount),
        weekday=day.weekday(),
    )
