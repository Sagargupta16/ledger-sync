"""Field extractors for ``bank_alert_parser``: account tail, reference, date and payee.

Each takes the cleaned alert text and returns one field, or None (the date
falls back to the day the text arrived). Account numbers survive only as
their last four digits, and any other run of six or more digits in a payee
label (a phone-number VPA, for one) is masked down to its last four.
"""

from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Literal

from ledger_sync.core.bank_alert_profiles import BankProfile

Direction = Literal["debit", "credit"]

_I = re.IGNORECASE
# A parsed date this far from the day the text arrived is a misread.
DATE_PAST = timedelta(days=45)
_DATE_FUTURE = timedelta(days=1)

_TAIL = re.compile(
    r"\b(?:a/c|acct|acc|account|card|ac)\.?(?:\s*(?:no|number)\b\.?)?"
    r"(?:\s*ending(?:\s+(?:with|in))?)?\s*[:\-]?\s*[x*#.]*\s?(\d{3,})",
    _I,
)
_REFERENCES = (
    re.compile(
        r"\bupi[\s:/-]*(?:ref(?:erence)?\.?\s*(?:no\b\.?|number|id)?\s*[:\-]?\s*)?(\d{12})\b", _I
    ),
    re.compile(r"\bupi/p2[am]/(\d{6,})", _I),
    re.compile(
        r"\b(?:ref(?:erence)?|refno|rrn|utr|txn\s*id|transaction\s*id)\b\.?"
        r"\s*(?:no\b\.?|number|id|#)?\s*[:\-]?\s*((?=[a-z]*\d)[a-z0-9]{6,24})\b",
        _I,
    ),
)

_MONTHS = {m: i for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split(), 1)}
_ISO_DATE = re.compile(r"\b(20\d{2})-(\d{1,2})-(\d{1,2})\b")
_NUMERIC_DATE = re.compile(r"\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b")
_NAMED_DATE = re.compile(
    r"\b(\d{1,2})[-\s/]?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[-\s/,]*(\d{4}|\d{2})\b",
    _I,
)
# "Oct 25, 2026" (ICICI card emails); a four-digit year keeps "Oct 26 14:22" out.
_MONTH_FIRST_DATE = re.compile(
    r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?"
    r"\s+(20\d{2})\b",
    _I,
)

_STOP = (
    r"(?=\s+(?:on|dated|via|using|for|from|by|with|txn|ref|refno|upi|avl|info|imps|neft|rtgs)\b"
    r"|\s*[.;,()\n]|$)"
)
_UPI_PATH = re.compile(
    r"\bupi/(?:p2[am]/)?\d{6,}/([^/\n.;,?]{2,40}?)"
    r"(?=\s*(?:[/\n.;,?]|$)|\s+(?:not you|sms|call|if not|avl|bal)\b)",
    _I,
)
_VPA = re.compile(r"\b(?:to|from|by)\s+(?:vpa\s+)?([a-z0-9][\w.\-]*@[a-z][\w.\-]*)", _I)
_PAYEES: dict[Direction, tuple[re.Pattern[str], ...]] = {
    "debit": (
        _UPI_PATH,
        _VPA,
        re.compile(r";\s*([^;\n.]{2,40}?)\s+credited\b", _I),
        re.compile(rf"\bat\s+([a-z][^\n]{{1,39}}?){_STOP}", _I),
        re.compile(
            rf"\b(?:trf to|transfer to|transferred to|paid to|sent to|to|towards)\s+"
            rf"([a-z][^\n]{{1,39}}?){_STOP}",
            _I,
        ),
    ),
    "credit": (
        _UPI_PATH,
        _VPA,
        re.compile(rf"\bfrom\s+([a-z][^\n]{{1,39}}?){_STOP}", _I),
        re.compile(rf"\bby\s+([a-z][^\n]{{1,39}}?){_STOP}", _I),
    ),
}
# Captures that are the user's own account or card, an amount or a footer, not a
# payee. Whole phrases only, so "The Coffee House" and "Card Factory" stay payees.
_NOT_A_PAYEE = re.compile(
    r"(?:your|ur|a/c|ac|acct|account|beneficiary|mobile|you|anyone|anybody|vpa|report|block|"
    r"dispute|know|call|sms|transfer|neft|imps)\b"
    r"|the\s+(?:beneficiary|account|a/c|card|payee|bank|registered)\b"
    r"|card\b\s*(?:(?:no\b\.?|number|ending(?:\s+(?:with|in))?)\s*)?[x*#.]*(?:\d|$)"
    r"|(?:rs|inr)\.?\s*\d",
    _I,
)
_LONG_DIGITS = re.compile(r"\d{6,}")


def account_tail(text: str) -> str | None:
    """Last digits (at most four) of the first account or card the text names."""
    found = _TAIL.search(text)
    return found.group(1)[-4:] if found else None


def reference(text: str) -> str | None:
    """The UPI, IMPS or transaction reference, upper-cased."""
    for pattern in _REFERENCES:
        found = pattern.search(text)
        if found:
            return found.group(1).upper()
    return None


def occurred_on(text: str, received_on: date) -> date:
    """The first plausible date in the text (Indian day-first order), else ``received_on``."""
    candidates: list[tuple[int, int, int, int]] = []
    for found in _ISO_DATE.finditer(text):
        candidates.append((found.start(), int(found[1]), int(found[2]), int(found[3])))
    for found in _NUMERIC_DATE.finditer(text):
        candidates.append((found.start(), int(found[3]), int(found[2]), int(found[1])))
    for found in _NAMED_DATE.finditer(text):
        month = _MONTHS[found[2].lower()[:3]]
        candidates.append((found.start(), int(found[3]), month, int(found[1])))
    for found in _MONTH_FIRST_DATE.finditer(text):
        month = _MONTHS[found[1].lower()[:3]]
        candidates.append((found.start(), int(found[3]), month, int(found[2])))
    for _, year, month, day in sorted(candidates):
        try:
            value = date(year + 2000 if year < 100 else year, month, day)
        except ValueError:
            continue
        if received_on - DATE_PAST <= value <= received_on + _DATE_FUTURE:
            return value
    return received_on


def payee(text: str, direction: Direction, profile: BankProfile | None) -> str | None:
    """A short display label for the merchant or person on the other side."""
    patterns = _PAYEES[direction] + (profile.merchant_patterns if profile else ())
    for pattern in patterns:
        for found in pattern.finditer(text):
            label = " ".join(found.group(1).split()).strip(" .,:;-")
            if len(label) >= 2 and not _NOT_A_PAYEE.match(label):
                masked = _LONG_DIGITS.sub(lambda m: "x" * (len(m[0]) - 4) + m[0][-4:], label)
                return masked[:60]
    return None
