"""Canonical metric-definition predicates shared by the rollups and the API.

Each rule here is the ONE backend answer to "does this row count as X?" for a
figure that several surfaces publish. Before this module the same question had
up to three answers -- the persisted monthly rollup, the FY rollup and the
/budgets endpoint each carried their own keyword list, matching mode and case
rule -- so one ledger read different Needs, investment and tax figures
depending on the page. The frontend ports the same rules; change them in both
places or the pages drift apart again.

MULTI-USER CONSTRAINT: nothing here names one user's accounts or categories.
Defaults are generic word-boundary keywords, and every user-configured list is
matched as the user wrote it (case-insensitively), never widened.
"""

from __future__ import annotations

import re
from collections.abc import Iterable
from collections.abc import Set as AbstractSet
from functools import lru_cache
from typing import Literal

from ledger_sync.core.expense_class import KEY_SEPARATOR, classification_key

# ─── shared matcher ─────────────────────────────────────────────────────────


@lru_cache(maxsize=64)
def _word_regex(patterns: frozenset[str]) -> re.Pattern[str] | None:
    """One compiled ``\\b(?:p1|p2|...)\\b`` for a pattern set, or None when empty.

    Alternation backtracks through every alternative at each position, so it
    answers exactly what ``any(re.search(rf"\\b{p}\\b", text))`` answers, in one
    scan instead of one per keyword -- the rollups run this per ledger row.
    """
    if not patterns:
        return None
    body = "|".join(re.escape(pattern) for pattern in sorted(patterns))
    return re.compile(rf"\b(?:{body})\b")


def matches_any_word(text: str | None, patterns: Iterable[str]) -> bool:
    """True when any lower-cased *pattern* sits at word boundaries in *text*.

    Case-insensitive via lower-casing *text* once. Word boundaries stop short
    keywords such as "rd" or "mf" matching inside "weird" or "management firm",
    while multi-word patterns ("home loan", "food & dining") still match
    verbatim.
    """
    lowered = (text or "").lower().strip()
    if not lowered:
        return False
    regex = _word_regex(frozenset(patterns))
    return regex is not None and regex.search(lowered) is not None


# ─── essentials (Needs) ─────────────────────────────────────────────────────

#: Built-in Needs keywords, matched on category OR subcategory. The user's own
#: ``essential_categories`` list ADDS to these rather than replacing them:
#: replacing silently dropped Rent / Groceries / Education the moment a user
#: added one category of their own.
DEFAULT_NEEDS: frozenset[str] = frozenset(
    s.lower()
    for s in (
        "rent",
        "housing",
        "home loan",
        "home-loan",
        "emi",
        "utilities",
        "electricity",
        "water",
        "gas",
        "cooking gas",
        "cylinder",
        "groceries",
        "grocery",
        "food",
        "food & dining",
        "fuel",
        "petrol",
        "diesel",
        "transport",
        "transportation",
        "commute",
        "insurance",
        "health insurance",
        "life insurance",
        "healthcare",
        "medical",
        "medicine",
        "doctor",
        "hospital",
        "education",
        "school fees",
        "tuition",
        "family support",
        "family",
        "parents",
        "internet",
        "broadband",
        "phone",
        "mobile",
        "recharge",
    )
)


def essential_keywords(user_categories: Iterable[object]) -> set[str]:
    """The Needs keyword set: ``DEFAULT_NEEDS`` plus the user's list, lower-cased."""
    return set(DEFAULT_NEEDS) | {c.lower() for c in user_categories if isinstance(c, str) and c}


def is_essential_expense(
    category: str | None,
    subcategory: str | None,
    essentials: AbstractSet[str],
) -> bool:
    """The canonical Needs predicate: a keyword on category OR subcategory.

    Word-boundary so a compound template label ("Education & Learning",
    "Home Loan / EMI") matches the singular keyword, which an exact-string test
    misses. Everything that is not a Need is discretionary (Wants).
    """
    return matches_any_word(category, essentials) or matches_any_word(subcategory, essentials)


# ─── investment accounts ────────────────────────────────────────────────────

#: Fallback investment-account keywords, used ONLY when the user has mapped no
#: accounts. Word-boundary matched against the account name ("Groww MF",
#: "HDFC PPF Account" and "NPS Tier 1" all match).
DEFAULT_INVESTMENT_ACCOUNT_KEYWORDS: frozenset[str] = frozenset(
    s.lower()
    for s in (
        "sip",
        "mf",
        "mutual fund",
        "ppf",
        "epf",
        "nps",
        "stocks",
        "equity",
        "shares",
        "elss",
        "recurring deposit",
        "rd",
        "sukanya samriddhi",
        "ssy",
        "groww",
        "zerodha",
        "kite",
        "upstox",
        "kuvera",
        "coin",
    )
)


def normalize_account(name: str | None) -> str:
    """Case- and padding-insensitive account key (the mapping comparison form)."""
    return (name or "").strip().lower()


def investment_account_names(mapped: Iterable[str]) -> frozenset[str]:
    """Normalised names of the accounts the user mapped as investments."""
    return frozenset(key for key in (normalize_account(n) for n in mapped) if key)


def is_investment_account(account: str | None, mapped_names: AbstractSet[str]) -> bool:
    """ONE investment-account rule for every rollup and endpoint.

    With any mapping configured, only the mapped accounts count, matched on the
    EXACT account name case-insensitively: Settings maps real account names, so
    a substring rule let mapping "Groww" also claim "Groww Wallet". With no
    mapping at all, fall back to the default keyword list so an unconfigured
    user still sees their SIPs and PPF as investments.
    """
    name = normalize_account(account)
    if not name:
        return False
    if mapped_names:
        return name in mapped_names
    return matches_any_word(name, DEFAULT_INVESTMENT_ACCOUNT_KEYWORDS)


# ─── income splits ──────────────────────────────────────────────────────────

#: Keywords that make a taxable item salary or a bonus, matched case-insensitively
#: at word boundaries. Same rule as ``classifyEmploymentIncome`` in
#: ``frontend/src/lib/finance/metricRules.ts``.
SALARY_KEYWORDS: frozenset[str] = frozenset({"salary", "stipend", "stipends"})
BONUS_KEYWORDS: frozenset[str] = frozenset({"bonus", "bonuses", "rsu", "rsus"})

EmploymentIncomeKind = Literal["salary", "bonus"]


def _employment_kind_of(text: str | None) -> EmploymentIncomeKind | None:
    """Bonus wins inside one label, so "Salary Bonus" is a bonus."""
    if matches_any_word(text, BONUS_KEYWORDS):
        return "bonus"
    return "salary" if matches_any_word(text, SALARY_KEYWORDS) else None


def classify_employment_income(
    category: str | None, subcategory: str | None
) -> EmploymentIncomeKind | None:
    """Salary vs bonus split for an already-taxable income row.

    The keywords salary, stipend, bonus/bonuses and rsu/rsus, case-insensitive
    at word boundaries, subcategory first and the category only when the
    subcategory names neither. "Employment Income::Monthly Salary" and
    "Salary::Monthly" are salary; "Salary::Performance Bonus" is a bonus.
    """
    return _employment_kind_of(subcategory) or _employment_kind_of(category)


def income_keys(items: Iterable[str]) -> frozenset[str]:
    """Normalise ``"Category::Subcategory"`` preference entries for lookup."""
    keys: set[str] = set()
    for item in items:
        category, _, subcategory = item.partition(KEY_SEPARATOR)
        keys.add(classification_key(category, subcategory))
    return frozenset(keys)


#: Default investment-return vocabulary, used when the user has not configured
#: their own ``investment_returns_categories``. "returns" is deliberately the
#: plural only: the singular also reads "Deposit Return", which is money coming
#: back, not a return on an investment. Capital gains and mutual fund gains
#: share the one "gains" tail.
_INVESTMENT_INCOME_RE = re.compile(
    r"\b(?:interest|dividends?|(?:capital|mutual[\s-]?funds?)[\s-]?gains?|returns)\b",
    re.IGNORECASE,
)


def looks_like_investment_income(category: str | None, subcategory: str | None) -> bool:
    """Default investment-income keywords, word-boundary on category or subcategory."""
    return any(_INVESTMENT_INCOME_RE.search(part) for part in (category, subcategory) if part)


# ─── tax paid ───────────────────────────────────────────────────────────────

#: The one exact category name that always counts as tax paid.
TAX_CATEGORY = "Taxes"

#: Income-tax vocabulary, matched on the row's own category or subcategory.
#: The free-text note is deliberately NOT read: a purchase note "incl GST" or a
#: broker note "STCG tax adjustment" is not income tax the user paid. GST, cess
#: and surcharge are not listed for the same reason.
_TAX_PAID_RE = re.compile(
    r"\b(?:income[\s-]?tax(?:es)?|tds|advance[\s-]?tax|self[\s-]?assessment"
    r"|tax(?:es)?[\s-]?paid|professional[\s-]?tax)\b",
    re.IGNORECASE,
)


def is_tax_paid(category: str | None, subcategory: str | None) -> bool:
    """True for an expense row whose taxonomy says it paid income tax."""
    if category == TAX_CATEGORY:
        return True
    return any(_TAX_PAID_RE.search(part) for part in (category, subcategory) if part)
