"""Merchant label extraction from free-text transaction notes.

The previous implementation matched a 4-regex brand whitelist and, on a miss,
fell back to the note's FIRST WORD. Measured against a real 5,015-row expense
ledger that produced three distinct failures:

1. Coverage -- the whitelist matched 18.6% of rows carrying 1.9% of spend.
   Everything else went through the first-word fallback.
2. Fragmentation -- the first-word fallback collapsed unrelated purchases into
   one label ("Fruits", "Milk", "Egg", "Flight" for six different routes),
   yielding 391 labels for 939 distinct notes.
3. Mis-attribution and silent drops -- "Milk Shake - Apple" and
   "Fruit Bowl - Apple/Guava" were booked to the merchant Apple (the tech
   company), while lowercase or quantity-prefixed notes ("3* Jeans",
   "Q1 FY27 Brokerage") returned None and were dropped entirely.

This module fixes all three: brands are matched with an ambiguity guard, and
the fallback keeps the WHOLE normalized note as a descriptor instead of one
token, so nothing is dropped and nothing is over-merged.
"""

from __future__ import annotations

import re

# Excel exports carry a literal carriage-return artifact in text columns.
_XL_ARTIFACT = re.compile(r"_x000[dD]_", re.IGNORECASE)
# Leading quantity prefixes: "3* Jeans", "2 x Track Pants", and the U+00D7
# MULTIPLICATION SIGN variant real note text uses. That non-ASCII character is
# deliberately in the character class -- dropping it would stop stripping the
# quantity prefix on those notes -- so RUF001's homoglyph warning is expected.
_QTY_PREFIX = re.compile(r"^\d+\s*[*x×]\s*", re.IGNORECASE)  # noqa: RUF001
# Trailing month/year tokens so "Rent Mar 2026" and "Rent Apr 2026" merge.
_MONTH_TRAILER = re.compile(
    r"[\s\-,]*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*"
    r"[\s\-,']*(\d{2,4})?$",
    re.IGNORECASE,
)
_DATE_TRAILER = re.compile(r"[\s\-,]*\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?$")
_FY_TRAILER = re.compile(r"[\s\-,]*(fy\s?\d{2,4}(-\d{2,4})?|q[1-4]\s*fy\s?\d{2,4})$", re.IGNORECASE)

#: Notes that are placeholders, not merchants. These must never become a
#: merchant row -- the real ledger has 408 rows literally reading "Unknown",
#: which the old code surfaced as a merchant named "Unknown".
PLACEHOLDER_NOTES = frozenset(
    {"unknown", "unknowns", "n/a", "na", "none", "-", "--", "?", "misc", "miscellaneous", "other"},
)

MAX_LABEL_LEN = 60

# Words that are BOTH a brand name and an everyday word. When the match is one
# of these the note must also carry a supporting context token, otherwise
# "Banana & Apple" reads as a purchase from Apple Inc. Keyed by the matched
# token (lowercased), not the canonical brand, so an unambiguous product name
# such as "iPhone" resolves to Apple with no context needed.
_AMBIGUOUS_TOKENS: dict[str, tuple[str, ...]] = {
    "apple": ("store", "care", "music", "tv+", "itunes", "pencil", "id"),
    "prime": ("amazon", "video", "membership", "subscription"),
    "orange": ("telecom", "mobile", "money"),
    "jio": ("recharge", "fiber", "fibre", "mart", "cinema", "saavn", "postpaid", "prepaid"),
}

#: Canonical brand -> match pattern. Ordered longest-name-first at match time,
#: so "Amazon Pay" wins over "Amazon" and "Google Play" over "Google".
_BRANDS: dict[str, str] = {
    # Ride hailing and delivery
    "Uber": r"uber",
    "Ola": r"ola\s?cabs?|\bola\b",
    "Rapido": r"rapido",
    "Swiggy": r"swiggy",
    "Zomato": r"zomato",
    "Dunzo": r"dunzo",
    "Blinkit": r"blinkit|grofers",
    "Zepto": r"zepto",
    "BigBasket": r"big\s?basket",
    "Instamart": r"instamart",
    "Rebel Foods": r"rebel\s?foods",
    "Domino's": r"domino'?s",
    "McDonald's": r"mc\s?donald'?s|mcd\b",
    "KFC": r"\bkfc\b",
    "Starbucks": r"starbucks",
    "Chai Point": r"chai\s?point",
    "Third Wave Coffee": r"third\s?wave",
    "Subway": r"subway",
    # Commerce
    "Amazon Pay": r"amazon\s?pay",
    "Amazon": r"amazon",
    "Flipkart": r"flipkart",
    "Myntra": r"myntra",
    "Ajio": r"\bajio\b",
    "Meesho": r"meesho",
    "Nykaa": r"nykaa",
    "Croma": r"croma",
    "Reliance Digital": r"reliance\s?digital",
    "Decathlon": r"decathlon",
    "IKEA": r"\bikea\b",
    "Pepperfry": r"pepperfry",
    "Lenskart": r"lenskart",
    "Boat": r"\bboat\s?(lifestyle|headphone|airdopes)",
    # Media and software
    "Netflix": r"netflix",
    "Spotify": r"spotify",
    "YouTube": r"you\s?tube",
    "Disney+ Hotstar": r"hotstar|disney\+?",
    "SonyLIV": r"sony\s?liv",
    "ZEE5": r"zee\s?5",
    "JioCinema": r"jio\s?cinema",
    "Audible": r"audible",
    "Google Play": r"google\s?play",
    "Google": r"google",
    "Microsoft": r"micro\s?soft",
    "Adobe": r"adobe",
    "OpenAI": r"open\s?ai|chat\s?gpt",
    "Anthropic": r"anthropic|claude\.ai",
    "AWS": r"\baws\b|amazon\s?web\s?services",
    "Azure": r"\bazure\b",
    "GitHub": r"git\s?hub",
    "Notion": r"notion",
    "Figma": r"figma",
    # Telecom and utilities
    "Airtel": r"airtel",
    "Vi": r"\bvodafone\b|\bvi\s?(recharge|postpaid)",
    "BSNL": r"\bbsnl\b",
    "ACT Fibernet": r"\bact\s?(fibernet|broadband)",
    # Financial
    "HDFC": r"\bhdfc\b",
    "SBI": r"\bsbi\b",
    "ICICI": r"\bicici\b",
    "Axis": r"\baxis\b",
    "Kotak": r"\bkotak\b",
    "IndusInd": r"indus\s?ind",
    "CRED": r"\bcred\b",
    "Groww": r"groww",
    "Zerodha": r"zerodha",
    "INDmoney": r"\bind\s?money\b",
    "Paytm": r"paytm",
    "PhonePe": r"phone\s?pe",
    "Slice": r"\bslice\b",
    "Jupiter": r"jupiter",
    # Travel
    "IRCTC": r"\birctc\b",
    "MakeMyTrip": r"make\s?my\s?trip|\bmmt\b",
    "Goibibo": r"goibibo",
    "IndiGo": r"indi\s?go",
    "Vistara": r"vistara",
    "Air India": r"air\s?india",
    "OYO": r"\boyo\b",
    "Airbnb": r"air\s?bnb",
    "RedBus": r"red\s?bus",
    "Cleartrip": r"cleartrip",
    # Unambiguous Apple product names resolve with no context needed.
    "Apple": r"iphone|ipad|macbook|\bimac\b|airpods|icloud|apple",
    # Ambiguous tokens -- gated by _AMBIGUOUS_TOKENS
    "Prime": r"prime",
    "Orange": r"orange",
    "Jio": r"jio",
}

# Compile once, longest canonical name first so specific brands win. The
# lookarounds prevent a brand matching inside a larger word ("Pineapple" must
# not match "apple", "Slicer" must not match "slice").
_COMPILED: list[tuple[str, re.Pattern[str]]] = sorted(
    (
        (name, re.compile(rf"(?<![a-z0-9])({pat})(?![a-z0-9])", re.IGNORECASE))
        for name, pat in _BRANDS.items()
    ),
    key=lambda pair: -len(pair[0]),
)


def clean_note(note: str | None) -> str | None:
    """Strip export artifacts, quantity prefixes, and trailing period tokens."""
    if not note:
        return None
    text = _XL_ARTIFACT.sub(" ", note)
    text = " ".join(text.split())
    text = _QTY_PREFIX.sub("", text)
    for trailer in (_FY_TRAILER, _MONTH_TRAILER, _DATE_TRAILER):
        text = trailer.sub("", text)
    text = text.strip(" -,;:/|")
    return text or None


def is_placeholder(note: str | None) -> bool:
    """True when the note is a filler value rather than a real payee."""
    if not note:
        return True
    stripped = " ".join(note.split()).strip(" -.").lower()
    return not stripped or stripped in PLACEHOLDER_NOTES


def match_brand(note: str, category: str | None = None) -> str | None:
    """Return the canonical brand named in ``note``, or None.

    When the matched token is an everyday word (apple, prime, orange, jio) the
    note must carry a supporting context token, and the match is rejected
    outright inside food categories -- so a fruit purchase is never attributed
    to a technology company.
    """
    lowered = note.lower()
    is_food = bool(category) and "food" in (category or "").lower()
    for name, pattern in _COMPILED:
        m = pattern.search(note)
        if not m:
            continue
        context = _AMBIGUOUS_TOKENS.get(m.group(1).lower())
        if context is None:
            return name
        if is_food or not any(token in lowered for token in context):
            continue
        return name
    return None


def extract_merchant(note: str | None, category: str | None = None) -> tuple[str, str] | None:
    """Extract ``(label, kind)`` from a note, where kind is brand or descriptor.

    Unlike the old first-word heuristic this never drops a populated note and
    never merges unrelated purchases: when no brand is recognised the whole
    cleaned note becomes the descriptor, so "Milk Shake - Apple" stays
    "Milk Shake - Apple" instead of collapsing into "Milk" or "Apple".
    """
    cleaned = clean_note(note)
    if not cleaned or is_placeholder(cleaned):
        return None
    brand = match_brand(cleaned, category)
    if brand:
        return brand, "brand"
    descriptor = cleaned[:MAX_LABEL_LEN].strip(" -,;:/|")
    return (descriptor, "descriptor") if descriptor else None
