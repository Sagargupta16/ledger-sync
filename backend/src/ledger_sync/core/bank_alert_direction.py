"""Which way the money in one bank alert moved, and whether it has moved yet.

The first debit or credit word decides, once "credit card" and "debit card"
are set aside: "Refund of Rs 500 credited" is a credit and "Rs 500 debited ...
Refund, if any, ..." a debit, while "has been reversed" or "credited back"
turns a debit into its reversal. ``direction`` returns None when that first
word is future, conditional or negated ("will be debited", "scheduled to be",
"get ... credited", "charged if unpaid", "Already paid?", "Refund ...
initiated") and when a reminder or bill carries only a weak word such as
"paid". ``failed`` reads "declined" or "failed", but not "if the txn failed".
"""

from __future__ import annotations

import re

from ledger_sync.core.bank_alert_fields import Direction

_I = re.IGNORECASE
# Case-sensitive on purpose: "Rs. 500" and "A/c no. 12" do not end a sentence. Line
# breaks do not either, since forwarded emails wrap mid-sentence.
_SENTENCE_END = re.compile(r"[;!?]|\.(?=\s+[A-Z])")

_CARD_WORDS = re.compile(r"\b(?:credit|debit)\s+(?:card|limit)\b|\bavailable\s+credit\b", _I)
# The first match decides. "Rs.500.00 Dr." and "Rs 500 Cr" mark it right after the
# figure; the weak words also turn up in bills and offers.
_MARKERS = re.compile(
    r"(?P<debit>\b(?:debited|spent|withdrawn|sent|deducted|charged)\b|(?<=\d)\s?dr\b)"
    r"|(?P<credit>\b(?:credited|received|deposited|refunded|reversed)\b|(?<=\d)\s?cr\b)"
    r"|(?P<weak_debit>\b(?:paid(?!\s+(?:by|from))|purchase|withdrawal|(?:a|has a) debit)\b"
    r"|\busing your\b(?=[^\n]{0,60}?\bfor\s+(?:₹|rs\b|inr\b))"
    r"|\bused\s+(?:at|for|on)\b(?=[^\n]{0,40}?(?:₹|\brs\b|\binr\b)))"
    r"|(?P<weak_credit>\b(?:refund|reversal|(?:a|has a) credit of)\b)",
    _I,
)
_REVERSED_BACK = re.compile(
    r"\b(?:has|have)\s+been\s+(?:reversed|refunded)\b|\b(?:credited|refunded|reversed)\s+back\b",
    _I,
)
# Shortly before a debit or credit word, these make it a future, conditional or negated
# one. "May" counts only as a verb, not in a date such as "25 May 26".
_PENDING_BEFORE = re.compile(
    r"\b(?:will|shall|would|might|can|could|should|going to|scheduled|about to|to be|being|"
    r"get|gets|getting|if|when|once|upon|approval|not)\b"
    r"|(?<!\b\d[-\s/])(?<!\b\d\d[-\s/])\bmay\b(?![-\s/]*\d)",
    _I,
)
# Matched after the marker once its leading whitespace is skipped (see _pending).
_PENDING_AFTER = re.compile(r"\?|(?:if|unless|in case)\b", _I)
# After a refund or reversal noun: "Refund of Rs 500 initiated", "Refund, if any, ...".
_UNFINISHED = re.compile(
    r"\b(?:initiated|will|shall|would|may|if any|in process|under process|being processed|"
    r"to be)\b",
    _I,
)
_NOTICE = re.compile(
    r"\b(?:reminder|upcoming|(?:is|are|falls?) due|due (?:on|by|date)|"
    r"(?:total|min(?:imum)?) (?:amount |amt\.? )?due|amount due|pay (?:now|by|before))\b",
    _I,
)
_FAILED = re.compile(r"\b(?:declined|failed|unsuccessful|rejected|not been processed)\b", _I)


def clause_before(text: str, start: int, floor: int, width: int) -> str:
    """Up to ``width`` characters before ``start``, not reaching back past ``floor``
    or the end of the previous sentence."""
    return _SENTENCE_END.split(text[max(floor, start - width) : start])[-1]


def _pending(text: str, found: re.Match[str]) -> bool:
    before = clause_before(text, found.start(), 0, 30)
    after = text[found.end() : found.end() + 40].lstrip()
    if _PENDING_BEFORE.search(before) or _PENDING_AFTER.match(after):
        return True
    if found.lastgroup != "weak_credit":
        return False
    return bool(_UNFINISHED.search(_SENTENCE_END.split(text[found.end() : found.end() + 60])[0]))


def direction(text: str) -> Direction | None:
    """The completed direction of the alert, or None when nothing has moved yet."""
    neutral = _CARD_WORDS.sub(" card ", text)
    if any(not _pending(neutral, found) for found in _REVERSED_BACK.finditer(neutral)):
        return "credit"
    first = _MARKERS.search(neutral)
    if first is None or first.lastgroup is None or _pending(neutral, first):
        return None
    if first.lastgroup.startswith("weak_") and _NOTICE.search(neutral):
        return None
    return "debit" if first.lastgroup.endswith("debit") else "credit"


def failed(text: str) -> bool:
    """Declined or failed, unless only as a condition ("if the txn failed, ...")."""
    return any(not _pending(text, found) for found in _FAILED.finditer(text))
