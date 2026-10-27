"""The fee and interest charges the anomaly engine looks for.

Each entry of ``FEE_PATTERNS`` is ``(kind, label, pattern)``, matched against a
row's "category subcategory note". No pattern names a bank, card or account,
so the check reads the user's own wording. Add a row to catch another kind of
charge; ``frontend/src/lib/demo/demoAnomalyChecks.ts`` mirrors this list for
demo mode.

A card fee needs the card as its subject ("card annual fee", "annual fee for
the credit card"), so a card used to pay for something else ("gym annual fee
via card") is not one. Interest counts only on a card, revolving credit or an
overdue balance; loan interest is a cost the user chose.

A manually added note can run to 10,000 characters, and a whitespace run
split between two adjacent ``\\s*`` made one match take seconds, holding the
worker. ``fee_kind`` therefore collapses whitespace and reads the first
``SCAN_CHARS`` characters, and no pattern puts two unbounded whitespace runs
side by side.
"""

from __future__ import annotations

import re

#: How much of a row's free text the anomaly regexes read.
SCAN_CHARS = 300

#: A row that waives, reverses or refunds a charge is not one.
_REVERSAL = re.compile(r"\b(?:waiv(?:er|ed)|revers(?:al|ed)|refund(?:ed)?)\b", re.IGNORECASE)

FEE_PATTERNS: tuple[tuple[str, str, re.Pattern[str]], ...] = (
    (
        "late_fee",
        "Late payment fee",
        re.compile(
            r"\b(?:late\s*(?:payment\s*)?|overdue\s*)(?:fees?|charges?|penalty)\b", re.IGNORECASE
        ),
    ),
    (
        "finance_charge",
        "Finance charge or card interest",
        re.compile(
            r"\bfinance\s*charges?\b|\b(?:card|cc|revolving|overdue)\s*interest\b"
            r"|\binterest\s*(?:charged\s*)?on\s*(?:card|credit\s*card|outstanding|dues|overdue)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "forex_markup",
        "Forex markup",
        re.compile(
            r"\b(?:(?:forex|fx|dcc)(?:\s*conversion)?|cross[\s-]*currency|currency\s*conversion"
            r"|foreign(?:\s*(?:currency|exchange))?(?:\s*(?:transaction|txn))?"
            r"|(?:international|intl)\s*(?:transaction|txn))\s*(?:mark[\s-]*up|fees?|charges?)\b"
            r"|\bmark[\s-]*up\s*(?:fees?|charges?)\b",
            re.IGNORECASE,
        ),
    ),
    (
        "card_annual_fee",
        "Card annual fee",
        re.compile(
            r"\b(?:card|cc)\s*(?:(?:fees?|charges?)\s*)?(?:annual|renewal|joining)\s*fees?\b"
            r"|\b(?:annual|renewal|joining)\s*fees?\s*(?:[-:(,]\s*|(?:for|on|of)\s+)"
            r"(?:(?!(?:via|by|using|with|through|paid)\b)\w+\s+){0,3}card\b",
            re.IGNORECASE,
        ),
    ),
)

#: Penalties for paying late or in part, graded high; the rest are costs of
#: using a card, graded medium.
PENALTY_KINDS = frozenset({"late_fee", "finance_charge"})


def fee_kind(*texts: str | None) -> tuple[str, str] | None:
    """``(kind, label)`` of the first fee pattern the texts match, else None."""
    text = " ".join(" ".join(t for t in texts if t).split())[:SCAN_CHARS]
    if _REVERSAL.search(text):
        return None
    for kind, label, pattern in FEE_PATTERNS:
        if pattern.search(text):
            return kind, label
    return None
