"""What current health is measured over: employment start, months and balances.

Ports of ``resolveEarningStart`` / ``resolveAnalysisPeriod``
(``frontend/src/lib/finance/analysisPeriod.ts``) and of ``computeBalancePosition``
with ``resolveAccountCategory`` (``components/analytics/health/healthScoreBalances.ts``,
``pages/net-worth/netWorthUtils.ts``). The keyword patterns are the frontend's,
which carry no ``u`` flag, so ``re.ASCII`` gives them the same ASCII-only
word boundaries and case folding.
"""

from __future__ import annotations

import calendar
import math
import re
from collections.abc import Iterable, Mapping
from datetime import date

from ledger_sync.core.dashboard_metrics_base import LedgerRow, js_key_order

_ISO_DAY = re.compile(r"[0-9]{4}-[0-9]{2}-[0-9]{2}")
_MONTH_KEY = re.compile(r"[0-9]{4}-(?:0[1-9]|1[0-2])")
# Classification is evidence of employment; incidental words in a bank note are not.
_NOT_EARNINGS = re.compile(
    r"\b(?:gift|gifts|allowance|allowances|refund|refunds|reimbursement|reimbursements"
    r"|cashback|scholarship|scholarships|interest|dividend|dividends)\b",
    re.IGNORECASE | re.ASCII,
)
_EARNINGS = re.compile(
    r"\b(?:employment|salary|wages?|payroll|paycheck|stipend|freelance|freelancing|consulting)\b",
    re.IGNORECASE | re.ASCII,
)


def _valid_day(value: str | None) -> str | None:
    """*value* when it is a real ``YYYY-MM-DD`` calendar day."""
    if not value or not _ISO_DAY.fullmatch(value):
        return None
    try:
        date.fromisoformat(value)
    except ValueError:
        return None
    return value


def earning_start(
    saved: str | None, rows: Iterable[LedgerRow], today: date
) -> tuple[str | None, str]:
    """The saved employment start, else the first salary-like income up to *today*."""
    day = _valid_day(saved)
    if day:
        return day, "saved"
    today_key = today.isoformat()
    first: str | None = None
    for row in rows:
        if row.type != "Income" or not math.isfinite(row.amount) or row.amount <= 0:
            continue
        day = row.date.date().isoformat()
        if day > today_key:
            continue
        label = f"{row.category} {row.subcategory}"
        if _NOT_EARNINGS.search(label) or not _EARNINGS.search(label):
            continue
        if first is None or day < first:
            first = day
    return first, "inferred" if first else "unknown"


def _shift_month(key: str, months: int) -> str:
    """The ``YYYY-MM`` key *months* after *key*."""
    index = int(key[:4]) * 12 + int(key[5:7]) - 1 + months
    return f"{index // 12:04d}-{index % 12 + 1:02d}"


def _months_between(first: str, last: str) -> list[str]:
    """Every month key from *first* to *last* inclusive (at most 100 years)."""
    keys: list[str] = []
    key = first
    while key <= last and len(keys) < 1200:
        keys.append(key)
        key = _shift_month(key, 1)
    return keys


def analysis_period(
    month_keys: Iterable[str], earning_day: str | None, today: date, recent_months: int = 24
) -> tuple[list[str], str | None, str | None]:
    """The trailing completed months from employment start: (months, first day, last day).

    Ends on the month before today's whatever the day of the month, and spans at
    most *recent_months*, empty months included.
    """
    current = today.isoformat()[:7]
    first_observed = min(
        (key for key in month_keys if _MONTH_KEY.fullmatch(key) and key <= current), default=None
    )
    if first_observed is None:
        return [], None, None
    end = _shift_month(current, -1)
    start = max(
        earning_day[:7] if earning_day else first_observed, _shift_month(end, 1 - recent_months)
    )
    if start > end:
        return [], None, None
    last_day = calendar.monthrange(int(end[:4]), int(end[5:7]))[1]
    first_day = max(f"{start}-01", earning_day or "")
    return _months_between(start, end), first_day, f"{end}-{last_day}"


_LIQUID_TYPES = frozenset({"Cash", "Other Wallets", "Bank Accounts"})
# The wire vocabulary the frontend knows (``ACCOUNT_TYPE_VALUES``); anything else,
# ``Other`` included, falls through to the name heuristics.
_ACCOUNT_TYPES = _LIQUID_TYPES | {"Investments", "Credit Cards", "Loans/Lended"}


def _is_liquid(
    name: str, classifications: Mapping[str, str], mappings: Mapping[str, object]
) -> bool:
    """``resolveAccountCategory`` lands on Bank Accounts or Cash & Wallets."""
    account_type = classifications.get(name)
    if account_type in _ACCOUNT_TYPES:
        return account_type in _LIQUID_TYPES
    if mappings.get(name):
        return False
    lowered = name.lower()
    if "credit" in lowered or "card" in lowered:
        return False
    return "bank" in lowered or "cash" in lowered or "wallet" in lowered


def balance_position(
    balances: Mapping[str, float],
    classifications: Mapping[str, str],
    mappings: Mapping[str, object],
) -> dict[str, float] | None:
    """Liquid, invested and owed money from the balances; None with no account."""
    if not balances:
        return None
    liquid = 0.0
    invested = 0.0
    owed = 0.0
    for name in js_key_order(balances):
        balance = balances[name]
        if balance < 0:
            owed += -balance
        elif balance != 0:
            if _is_liquid(name, classifications, mappings):
                liquid += balance
            else:
                invested += balance
    total = liquid + invested
    return {
        "liquid_assets": liquid,
        "investment_assets": invested,
        "total_liabilities": owed,
        "total_assets": total,
        "net_worth": total - owed,
    }
