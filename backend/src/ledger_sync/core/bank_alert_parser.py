"""Read one Indian bank SMS or email alert into the fields matching needs.

``parse_bank_alert`` returns the direction, the INR amount, the last digits of
the account or card, a payee label for display, the bank's reference number
(used only to fold the SMS and email copies of one payment together) and the
transaction date, or None when the text is not a completed debit or credit.
Generic patterns cover the common Indian layouts; ``bank_alert_profiles``
adds sender codes and the few bank-specific ones, ``bank_alert_fields`` holds
the per-field extractors and ``bank_alert_direction`` the debit or credit rules.

Deliberately strict, because a wrong alert is worse than a skipped one. A text
counts only when it has:

* an INR amount ("Rs", "INR", "₹", or "debited by 20.0"), skipping zero and
  figures labelled as a balance, a limit or a bill's due amount;
* a completed debit or credit word, the first one deciding ("Refund of Rs 500
  credited" is a credit, "Rs 500 debited ... Refund, if any, ..." a debit).
  Future, conditional and negated wording ("will be debited", "get ...
  credited", "charged if unpaid"), bills and reminders with only a weak word,
  OTPs with their code, collect requests, request acknowledgements and
  declined payments are refused;
* the last digits of an account or card, or a reference number. Promotional
  texts that merely say "credited" have neither.

The raw text is never kept; ``bank_alert_store`` stores digests instead.
"""

from __future__ import annotations

import html
import re
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation

from ledger_sync.core.bank_alert_direction import clause_before, direction, failed
from ledger_sync.core.bank_alert_fields import (
    Direction,
    account_tail,
    occurred_on,
    payee,
    reference,
)
from ledger_sync.core.bank_alert_profiles import profile_for_sender, profile_in_text

MAX_AMOUNT = Decimal("9999999999999.99")
_MAX_CHARS = 3000

_I = re.IGNORECASE
_NUMBER = r"(\d[\d,]*(?:\.\d{1,2})?)"
_CURRENCY_AMOUNT = re.compile(rf"(?:₹|\b(?:rs|inr))\.?\s*[:.]?\s*{_NUMBER}", _I)
_BARE_AMOUNT = re.compile(rf"\b(?:debited|credited)\s+(?:by|for|with)\s+{_NUMBER}", _I)
_NOT_THE_AMOUNT = re.compile(r"\b(?:bal|balance|limit|lmt|avl|available|outstanding|due)\b", _I)
_OTP_WORDS = r"(?:otp|one[- ]time password|verification code)"
_REFUSE = re.compile(
    # An OTP with its code; a footer such as "never share your OTP" does not count.
    rf"\b\d{{4,8}}\s+(?:is|as)\s+(?:the\s+|your\s+)?{_OTP_WORDS}\b"
    rf"|\b{_OTP_WORDS}(?:\s*\(otp\))?(?:\s*(?:is|:|-))?\s*\d{{4,8}}\b"
    rf"|\b{_OTP_WORDS}\b(?:[^\n.]|\.\d){{0,80}}?\bis\s*:?\s*\d{{4,8}}\b"
    r"|\b(?:has requested|requested money|collect request|your request|request (?:for|of)|"
    r"pre-?approved|apply now)\b",
    _I,
)
_WORD = re.compile(r"\S+")
# IFSCs, UTRs and masked numbers ("SBIN0001234", "HDFC52612...") start with a bank's letters.
_CODES = re.compile(r"\b[a-z]+\d[a-z\d]*", _I)


@dataclass(frozen=True, slots=True)
class ParsedAlert:
    direction: Direction
    amount: Decimal
    account_tail: str | None
    merchant: str | None
    reference: str | None
    occurred_on: date
    bank: str | None


def _clean(text: str) -> str:
    # A tag cannot contain "<", so each attempt stops at the next one: linear on "<<<<".
    text = html.unescape(re.sub(r"<[^<>]*>", " ", text)).replace("\r\n", "\n")
    return re.sub(r"[ \t\r\f\v\u00a0]+", " ", text)[:_MAX_CHARS]


def _without_addresses(text: str) -> str:
    """Blank every word with an "@" inside it (a VPA or an email address).

    Word by word rather than one ``\\S+@\\S+`` pattern, which backtracks over a
    long run of non-space characters that holds no "@".
    """
    return _WORD.sub(lambda word: " " if "@" in word.group()[1:-1] else word.group(), text)


def _decimal(raw: str) -> Decimal | None:
    try:
        value = Decimal(raw.replace(",", "")).quantize(Decimal("0.01"))
    except InvalidOperation:
        return None
    return value if Decimal(0) < value <= MAX_AMOUNT else None


def _amount(text: str) -> Decimal | None:
    """The first INR figure that is not zero, a balance, a limit or a due amount."""
    floor = 0
    for found in _CURRENCY_AMOUNT.finditer(text):
        label = clause_before(text, found.start(), floor, 24)
        floor = found.end()
        value = None if _NOT_THE_AMOUNT.search(label) else _decimal(found.group(1))
        if value is not None:
            return value
    bare = _BARE_AMOUNT.search(text)
    return _decimal(bare.group(1)) if bare else None


def parse_bank_alert(
    text: str, sender: str | None = None, *, received_on: date
) -> ParsedAlert | None:
    """The alert in ``text``, or None when it is not a completed INR debit or credit."""
    cleaned = _clean(text)
    if _REFUSE.search(cleaned):
        return None
    amount, moved = _amount(cleaned), direction(cleaned)
    if amount is None or moved is None:
        return None
    if moved == "debit" and failed(cleaned):
        return None
    tail, ref = account_tail(cleaned), reference(cleaned)
    if tail is None and ref is None:
        return None
    # VPAs, email addresses and IFSC or UTR codes name other banks, so they cannot pick it.
    profile = profile_for_sender(sender) or profile_in_text(
        _CODES.sub(" ", _without_addresses(cleaned))
    )
    return ParsedAlert(
        direction=moved,
        amount=amount,
        account_tail=tail,
        merchant=payee(cleaned, moved, profile),
        reference=ref,
        occurred_on=occurred_on(cleaned, received_on),
        bank=profile.key if profile else None,
    )
