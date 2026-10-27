"""Small per-bank profiles for reading Indian bank alerts.

A profile names a bank, the DLT sender codes and email domains its alerts come
from, the words its messages (and a user's own account names) use for it, and
any merchant pattern its format needs beyond the generic ones in
``bank_alert_parser``. Sender codes are the common six-letter DLT headers
(``VM-HDFCBK-S`` reads as ``HDFCBK``); they are hints only, so a missing or
unknown sender still parses through the body aliases.

Nothing here names a person's account. Aliases are bank names, matched against
whatever the user called their own accounts.
"""

from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class BankProfile:
    key: str
    name: str
    aliases: tuple[str, ...]
    senders: tuple[str, ...] = ()
    domains: tuple[str, ...] = ()
    merchant_patterns: tuple[re.Pattern[str], ...] = ()


def _alias_pattern(aliases: tuple[str, ...]) -> re.Pattern[str]:
    words = "|".join(r"\s+".join(map(re.escape, alias.split())) for alias in aliases)
    return re.compile(rf"\b(?:{words})", re.IGNORECASE)


# Axis card alerts put the merchant on its own line after the timestamp.
_AXIS_LINE = re.compile(
    r"\d{2}-\d{2}-\d{2,4},?\s+\d{2}:\d{2}(?::\d{2})?(?:\s*ist)?\s*\n\s*([^\n]{2,40}?)\s*\n",
    re.IGNORECASE,
)
# ICICI card alerts read "... on 25-Oct-26 on MERCHANT." or "... at 10:15:32. Info: MERCHANT."
_ICICI_ON = re.compile(r"\bon\s+\d{1,2}-[a-z]{3}-\d{2,4}\s+on\s+([^\n.;]{2,40})", re.IGNORECASE)
_ICICI_INFO = re.compile(r"\binfo\s*:\s*([^.\n;]{2,40}?)\s*(?:[.\n;]|$)", re.IGNORECASE)

PROFILES: tuple[BankProfile, ...] = (
    BankProfile("hdfc", "HDFC Bank", ("hdfc",), ("HDFCBK",), ("hdfcbank",)),
    BankProfile(
        "sbi",
        "State Bank of India",
        ("sbi", "state bank"),
        ("SBIINB", "SBIUPI", "CBSSBI", "ATMSBI", "SBIPSG", "SBICRD"),
        ("sbi.co.in", "sbicard"),
    ),
    BankProfile(
        "icici",
        "ICICI Bank",
        ("icici",),
        ("ICICIB",),
        ("icicibank",),
        merchant_patterns=(_ICICI_ON, _ICICI_INFO),
    ),
    BankProfile(
        "axis", "Axis Bank", ("axis",), ("AXISBK",), ("axisbank",), merchant_patterns=(_AXIS_LINE,)
    ),
    BankProfile("kotak", "Kotak Mahindra Bank", ("kotak",), ("KOTAKB",), ("kotak",)),
    BankProfile("idfc", "IDFC FIRST Bank", ("idfc",), ("IDFCFB",), ("idfcfirstbank",)),
    BankProfile("indusind", "IndusInd Bank", ("indusind",), ("INDUSB",), ("indusind",)),
    BankProfile("yes", "Yes Bank", ("yes bank",), ("YESBNK",), ("yesbank",)),
    BankProfile("pnb", "Punjab National Bank", ("pnb", "punjab national"), ("PNBSMS",), ("pnb",)),
    BankProfile("bob", "Bank of Baroda", ("baroda",), ("BOBTXN", "BOBSMS"), ("bankofbaroda",)),
    BankProfile("canara", "Canara Bank", ("canara",), ("CANBNK",), ("canarabank",)),
    BankProfile("union", "Union Bank of India", ("union bank",), ("UNIONB",), ("unionbank",)),
    BankProfile("federal", "Federal Bank", ("federal bank",), ("FEDBNK",), ("federalbank",)),
    BankProfile("au", "AU Small Finance Bank", ("au small finance", "au bank"), ("AUBANK",)),
    BankProfile("idbi", "IDBI Bank", ("idbi",), ("IDBIBK",), ("idbibank",)),
    BankProfile("rbl", "RBL Bank", ("rbl",), ("RBLBNK",), ("rblbank",)),
    BankProfile("hsbc", "HSBC", ("hsbc",), ("HSBCIN",), ("hsbc",)),
    BankProfile("sc", "Standard Chartered", ("standard chartered", "stanchart"), (), ("sc.com",)),
    BankProfile("amex", "American Express", ("amex", "american express"), (), ("americanexpress",)),
)

BY_KEY = {profile.key: profile for profile in PROFILES}
# Word-start matches, so "HDFC Bank", "hdfcbank.net" and "Swiggy HDFC Card" all count.
ALIAS_PATTERNS = {profile.key: _alias_pattern(profile.aliases) for profile in PROFILES}
_SENDER_TOKEN = re.compile(r"[A-Z0-9]{5,8}")


def profile_for_sender(sender: str | None) -> BankProfile | None:
    """The bank a DLT sender code (``AX-HDFCBK-S``) or alert email address belongs to."""
    if not sender:
        return None
    tokens = set(_SENDER_TOKEN.findall(sender.upper()))
    lowered = sender.lower()
    for profile in PROFILES:
        if tokens.intersection(profile.senders) or any(d in lowered for d in profile.domains):
            return profile
    return None


def profile_in_text(text: str) -> BankProfile | None:
    """The bank whose name appears first in the message body."""
    best: tuple[int, BankProfile] | None = None
    for profile in PROFILES:
        found = ALIAS_PATTERNS[profile.key].search(text)
        if found and (best is None or found.start() < best[0]):
            best = (found.start(), profile)
    return best[1] if best else None


def display_name(key: str | None) -> str | None:
    if key is None:
        return None
    profile = BY_KEY.get(key)
    return profile.name if profile else key
