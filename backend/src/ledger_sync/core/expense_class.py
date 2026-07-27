"""Realised-capital-loss taxonomy shared by the analytics engine and the API.

WHY THIS EXISTS
---------------
Cashbook workbooks routinely book a realised trading loss as an ``EXPENSE`` row
so the cash column balances. A realised loss is a NEGATIVE INVESTMENT RETURN,
not consumption: it never bought goods or services. Summed as spending it
inflates expense totals, category rankings, the essential/discretionary split,
the 50/30/20 Wants share and the anomaly baseline all at once, because nothing
sat between ``txn.type == EXPENSE`` and ``total_expenses += amount``.

Measured on one real 6,961-row ledger: 4 rows worth 216,985.85 at
``type='EXPENSE'`` -- 5.43% of the 3,994,751 live expense total -- and the
mirror case of 11 rows worth 65,360.09 at ``type='INCOME'``. The persisted
December-2024 rollup read a -180.1% savings rate where the loss-free figure is
-68.4%.

NEVER SILENTLY RECLASSIFY
-------------------------
The rows really are typed ``EXPENSE`` in the user's own ledger; only the user
can say a given row is a realised loss rather than spending. So this module
does not guess for them:

* ``capital_loss_keys`` reads the ``capital_loss_categories`` preference, which
  ships EMPTY. With nothing configured every consumer behaves exactly as it did
  before this module existed -- no historical number moves on its own.
* ``looks_like_capital_loss`` is DETECTION ONLY. It powers the
  ``/api/analytics/v2/data-health`` signal that tells the user "these rows look
  like realised losses, classify them if they are" and must never be wired into
  an aggregate.

MULTI-USER CONSTRAINT (do not regress this)
-------------------------------------------
No category, subcategory or account name is hardcoded anywhere here. The
preference carries exact ``"Category::Subcategory"`` keys drawn from the user's
own data (the same contract as the four income lists), and the detection
patterns are GENERIC word-boundary regexes so "Trading Losses", "F & O Loss" or
"Realised Capital Loss" all raise the signal in any taxonomy.

FAIL-SAFE DIRECTION
-------------------
Detection requires the row's OWN taxonomy to say both "investment" and "loss",
reads ``category``/``subcategory`` only (never the free-text ``note`` or
``account``, where an investment word in one field and a loss word in another
combined into a false positive), and lets a fee signal beat a loss signal:
brokerage, STT, demat AMC and advisory fees are the real cost of investing.
Wrongly excluding a row understates real spending, which is the dangerous
error; wrongly keeping one only leaves today's behaviour in place.

Realised-loss rows stay real ledger rows. They belong in investment P&L, and
under Indian tax law they carry forward against future capital gains, so they
are never deleted or hidden -- just not summed as consumption.
"""

from __future__ import annotations

import json
import re
from typing import Any

from sqlalchemy import ColumnElement, and_, func, not_, or_

from ledger_sync.db.models import Transaction

#: Separator for the exact-match preference keys, matching the four income
#: lists (``"Category::Subcategory"``).
KEY_SEPARATOR = "::"


def _norm(value: str | None) -> str:
    """Lower-case and strip *value* for key comparison.

    Deliberately limited to case folding plus trimming so the Python and SQL
    paths agree exactly -- ``func.lower(func.trim(col))`` is the SQL twin. The
    keys come from the user's own data through the Settings UI, so richer
    normalisation (collapsing inner whitespace, folding " and " to "&") would
    buy nothing here and could not be expressed identically in SQL. Spelling
    drift is the detection layer's job, not the preference's.
    """
    return (value or "").strip().lower()


def classification_key(category: str | None, subcategory: str | None) -> str:
    """Return the normalised ``"category::subcategory"`` key for a row."""
    return f"{_norm(category)}{KEY_SEPARATOR}{_norm(subcategory)}"


def capital_loss_keys(raw: str | list[Any] | None) -> set[str]:
    """Parse the stored ``capital_loss_categories`` JSON into normalised keys.

    Returns an EMPTY set for null, blank, malformed JSON, a non-list value or
    an empty list. Empty means "the user has classified nothing", which is the
    shipped state and must leave every aggregate untouched.
    """
    parsed: Any = raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            return set()
    if not isinstance(parsed, list):
        return set()
    keys: set[str] = set()
    for item in parsed:
        if not isinstance(item, str) or not item.strip():
            continue
        category, _, subcategory = item.partition(KEY_SEPARATOR)
        keys.add(classification_key(category, subcategory))
    return keys


def is_capital_loss(
    category: str | None,
    subcategory: str | None,
    keys: set[str],
) -> bool:
    """True when this row's taxonomy is one the user classified as a realised loss."""
    if not keys:
        return False
    return classification_key(category, subcategory) in keys


def capital_loss_sql_filter(
    keys: set[str],
    category_col: Any = None,
    subcategory_col: Any = None,
) -> ColumnElement[bool] | None:
    """Return a SQL predicate EXCLUDING the classified loss rows, or ``None``.

    ``None`` when nothing is configured, so callers leave their query byte-for-
    byte unchanged in the default case instead of appending a no-op clause.

    The columns are parameters because callers filter at two levels -- directly
    on ``Transaction`` (the analytics engine) and on a ``.subquery()``'s ``.c``
    (the conditional-aggregate helpers in ``query_helpers``). Both go through
    THIS function so the Python key comparison and its SQL twin can never drift
    apart; default to the ``Transaction`` columns for the common case.

    ``func.lower(func.trim(...))`` mirrors ``_norm`` exactly; ``coalesce`` maps a
    NULL subcategory onto the empty string the Python side produces.
    """
    if not keys:
        return None
    raw_category = Transaction.category if category_col is None else category_col
    raw_subcategory = Transaction.subcategory if subcategory_col is None else subcategory_col
    category = func.lower(func.trim(func.coalesce(raw_category, "")))
    subcategory = func.lower(func.trim(func.coalesce(raw_subcategory, "")))
    matches = [
        and_(category == key_category, subcategory == key_subcategory)
        for key_category, _, key_subcategory in (
            key.partition(KEY_SEPARATOR) for key in sorted(keys)
        )
    ]
    return not_(or_(*matches))


# --- detection patterns (signal only, never an aggregate) -------------------

#: The row's own taxonomy must look investment-related before any loss rule can
#: fire, so a consumption row that happens to say "loss" ("Card Loss
#: Replacement") is never flagged.
_INVESTMENT_CONTEXT_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"\binvest(?:ing|ment|ments)?\b",
        r"\bstock(?:s)?\b",
        r"\bshare(?:s)?\b",
        r"\bequit(?:y|ies)\b",
        r"\btrad(?:e|es|ing)\b",
        r"\bf\s*(?:&|and)\s*o\b",
        r"\bfno\b",
        r"\bfuture(?:s)?\b",
        r"\boption(?:s)?\b",
        r"\bderivative(?:s)?\b",
        r"\bintraday\b",
        r"\bspeculative\b",
        r"\bmutual\s*fund(?:s)?\b",
        r"\bmf\b",
        r"\betf(?:s)?\b",
        r"\bsip\b",
        r"\bdemat\b",
        # Bare "brokerage" is deliberately NOT an investment signal: a rental
        # agent's "Housing Brokerage" is ordinary consumption. Securities
        # brokerage always carries a second signal or one of these compounds.
        r"\b(?:stock|share|sub)[-\s]?broker(?:age)?\b",
        r"\bportfolio\b",
        r"\bsecurit(?:y|ies)\b",
        r"\bbond(?:s)?\b",
        r"\bdebenture(?:s)?\b",
        r"\bcrypto(?:currency)?\b",
        r"\bcapital\s*gain(?:s)?\b",
        r"\b(?:lt|st)cg\b",
        r"\bnps\b",
        r"\b[evp]?pf\b",
    )
)

#: Realised-loss signals. Optional groups absorb plural and hyphen drift; never
#: tighten these to one ledger's exact spelling.
_CAPITAL_LOSS_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"\bloss(?:es)?\b",
        r"\bwrite[-\s]?off(?:s)?\b",
        r"\bwritten[-\s]?off\b",
        r"\bnegative\s*return(?:s)?\b",
    )
)

#: Cost-of-investing signals: real cash paid to participate in a market, so
#: still spending. Checked BEFORE the loss rules (the fail-safe direction), so a
#: fee booked on a loss-making trade is never flagged.
_INVESTMENT_COST_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"\bfee(?:s)?\b",
        r"\bcharge(?:s)?\b",
        r"\bcommission(?:s)?\b",
        r"\bbrokerage\b",
        r"\bstt\b",
        r"\bsebi\b",
        r"\bstamp\s*duty\b",
        r"\bamc\b",
        r"\bexpense\s*ratio\b",
        r"\badvisor(?:y)?\b",
        r"\bsubscription(?:s)?\b",
        r"\btax(?:es)?\b",
    )
)


def looks_like_capital_loss(category: str | None, subcategory: str | None) -> bool:
    """DETECTION ONLY: does this row's taxonomy read like a realised loss?

    Never call this from an aggregate. Guessing on a user's behalf is exactly
    the silent reclassification this module refuses to do -- the return value
    only ever feeds the data-health signal that ASKS the user to classify.
    """
    taxonomy = " ".join(part for part in (category, subcategory) if part).strip()
    if not taxonomy:
        return False
    if not any(p.search(taxonomy) for p in _INVESTMENT_CONTEXT_PATTERNS):
        return False
    if any(p.search(taxonomy) for p in _INVESTMENT_COST_PATTERNS):
        return False
    return any(p.search(taxonomy) for p in _CAPITAL_LOSS_PATTERNS)
