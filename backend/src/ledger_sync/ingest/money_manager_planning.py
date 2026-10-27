"""Read a backup's optional repeat rules and budgets.

These tables are optional: a backup without them, or with a layout this
reader does not know, yields ``None`` for that part and the transactions
import exactly as before.

Realbyte documents none of the codes. The ones mapped here were read from a
real backup's own data, and any other code is passed on as unknown so the
import can skip it with a count:

- Repeat type 1 rules recur on one day of the month: their generated
  transactions are 26 to 33 days apart and share the rule's day. Type 8
  rules recur on a month's last day.
- Budget period 6 defaults sit near one month of the category's spending and
  take ``yyyymm`` overrides, so they are monthly; period 4 defaults sit near
  twelve months and take ``yyyy`` overrides, so they are yearly. A monthly
  budget is read with the limit Money Manager applies this month: the
  current IST month's override when it has one, else its default.
"""

from __future__ import annotations

import sqlite3
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Literal

from ledger_sync.core.ledger_clock import IST_OFFSET, ledger_today
from ledger_sync.ingest.money_manager_labels import category_labels, clean_text
from ledger_sync.schemas.upload import MAX_AMOUNT

type Cadence = Literal["monthly", "month_end"]
type BudgetPeriod = Literal["monthly", "yearly"]
type EntryKind = Literal["income", "expense", "transfer"]

_REPEAT_CADENCES: dict[int, Cadence] = {1: "monthly", 8: "month_end"}
_BUDGET_PERIODS: dict[int, BudgetPeriod] = {6: "monthly", 4: "yearly"}
_ENTRY_KINDS: dict[str, EntryKind] = {"0": "income", "1": "expense", "3": "transfer"}
_CENT = Decimal("0.01")
# Repeat dates are Unix milliseconds; anything outside 2001 to 2100 is not a date.
_MIN_MILLIS, _MAX_MILLIS = 978_307_200_000, 4_102_444_800_000

_REPEAT_COLUMNS = {
    "ZUID", "ZISDEL", "ZREPEATTYPE", "ZDOTYPE", "ZNEXTDATE", "ZENDDATE", "ZAMOUNTSUB",
    "ZASSETUID", "ZCATEGORYUID", "ZCURRENCYUID", "ZPAYEE",
}  # fmt: skip
_BUDGET_COLUMNS = {
    "ZBUDGET": {
        "ZUID", "ZISDEL", "ZPERIODTYPEINT", "ZTOTALTYPEINT", "ZTRANSTYPEINT", "ZDOTYPESTR",
        "ZTARGETUID",
    },
    "ZBUDGETAMOUNT": {"ZBUDGETUID", "ZBUDGETPERIOD", "ZISDEL", "ZAMOUNT"},
    "ZCATEGORY": {"ZISDEL"},
}  # fmt: skip

_RULES_SQL = """
SELECT r.ZUID, r.ZREPEATTYPE, r.ZDOTYPE, r.ZNEXTDATE, r.ZENDDATE, r.ZAMOUNTSUB, r.ZPAYEE,
       a.ZNICNAME, c.ZNAME, p.ZNAME, cur.ZISO
FROM ZREPEATTRANSACTION r
LEFT JOIN ZASSET a ON a.ZUID = r.ZASSETUID
LEFT JOIN ZCATEGORY c ON c.ZUID = r.ZCATEGORYUID
LEFT JOIN ZCATEGORY p ON p.ZUID = c.ZPUID
LEFT JOIN ZCURRENCY cur ON cur.ZUID = r.ZCURRENCYUID
WHERE COALESCE(r.ZISDEL, 0) = 0
ORDER BY r.ZUID
"""
# A generated transaction's UID is the rule's UID, "_" and 12 more characters.
# Ascending, so the last row read for a rule is its latest.
_INSTANCES_SQL = """
SELECT ZUID, ZAMOUNT FROM ZINOUTCOME
WHERE COALESCE(ZISDEL, 0) = 0 AND ZAMOUNT > 0 AND instr(ZUID, '_') > 0
ORDER BY ZDATE, ZUID
"""
# The target category by name: a subcategory under its live parent, a top-level
# category on its own, and NULL for a deleted category, an account or the total.
_BUDGETS_SQL = """
SELECT b.ZUID, b.ZPERIODTYPEINT, b.ZTOTALTYPEINT, b.ZTRANSTYPEINT, b.ZDOTYPESTR,
       CASE
           WHEN c.ZUID IS NULL OR COALESCE(c.ZISDEL, 0) <> 0 THEN NULL
           WHEN TRIM(COALESCE(c.ZPUID, '')) = '' THEN c.ZNAME
           WHEN p.ZUID IS NULL OR COALESCE(p.ZISDEL, 0) <> 0 THEN NULL
           ELSE p.ZNAME
       END,
       CASE WHEN TRIM(COALESCE(c.ZPUID, '')) <> '' THEN c.ZNAME END
FROM ZBUDGET b
LEFT JOIN ZCATEGORY c ON c.ZUID = b.ZTARGETUID
LEFT JOIN ZCATEGORY p ON p.ZUID = c.ZPUID
WHERE COALESCE(b.ZISDEL, 0) = 0
ORDER BY b.ZUID
"""
# Only the default (period key 0) and this month's override (key yyyymm).
_AMOUNTS_SQL = """
SELECT ZBUDGETUID, ZBUDGETPERIOD, ZAMOUNT FROM ZBUDGETAMOUNT
WHERE COALESCE(ZISDEL, 0) = 0 AND ZBUDGETPERIOD IN (0, ?)
"""


@dataclass(frozen=True, slots=True)
class BackupRepeatRule:
    """A live repeat rule. A ``None`` cadence or kind is a code nobody has mapped."""

    uid: str
    cadence: Cadence | None
    kind: EntryKind | None
    next_due: date | None
    # None means the rule runs until it is deleted.
    end_date: date | None
    end_date_unreadable: bool
    # The rule's own amount, or its latest generated transaction's when the
    # rule leaves the amount to be typed each time (``amount_varies``).
    amount: Decimal | None
    amount_varies: bool
    account: str
    category: str
    subcategory: str | None
    note: str | None
    currency: str | None


@dataclass(frozen=True, slots=True)
class BackupBudget:
    """A live budget, its target category by name and the limit it sets this month."""

    uid: str
    period: BudgetPeriod | None
    # An expense budget on one category; account and total budgets are not.
    category_budget: bool
    # None when the target is not a live category.
    category: str | None
    subcategory: str | None
    # This month's override, else the default (key 0); None unless that key
    # has exactly one readable amount. A budget here holds one limit.
    amount: Decimal | None


@dataclass(frozen=True, slots=True)
class BackupPlanning:
    """``None`` for a part means the backup has no such tables."""

    repeat_rules: list[BackupRepeatRule] | None
    budgets: list[BackupBudget] | None


def read_planning(connection: sqlite3.Connection) -> BackupPlanning:
    """Read whichever optional tables the backup has, in a layout this reader knows."""
    has_rules = _has(connection, "ZREPEATTRANSACTION", _REPEAT_COLUMNS)
    has_budgets = all(_has(connection, table, cols) for table, cols in _BUDGET_COLUMNS.items())
    return BackupPlanning(
        repeat_rules=_read_rules(connection) if has_rules else None,
        budgets=_read_budgets(connection) if has_budgets else None,
    )


def _has(connection: sqlite3.Connection, table: str, columns: set[str]) -> bool:
    kind = connection.execute("SELECT type FROM sqlite_master WHERE name = ?", (table,)).fetchone()
    if kind is None or kind[0] != "table":
        return False
    present = {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}
    return columns <= present


def _read_rules(connection: sqlite3.Connection) -> list[BackupRepeatRule]:
    records = connection.execute(_RULES_SQL).fetchall()
    # A rule that leaves its amount to be typed each time takes its latest generated one.
    varying = {clean_text(record[0]) for record in records if _amount(record[5]) is None}
    latest = _latest_instance_amounts(connection, varying - {""})
    rules: list[BackupRepeatRule] = []
    for record in records:
        uid, code, kind, next_due, end, amount, payee, account, name, parent, iso = record
        key, own_amount, end_date = clean_text(uid), _amount(amount), _millis_date(end)
        category, subcategory = category_labels(name, parent)
        rules.append(
            BackupRepeatRule(
                uid=key,
                cadence=_REPEAT_CADENCES.get(code) if isinstance(code, int) else None,
                kind=_ENTRY_KINDS.get(clean_text(kind)),
                next_due=_millis_date(next_due),
                end_date=end_date,
                end_date_unreadable=end_date is None and clean_text(end) not in ("", "0"),
                amount=latest.get(key) if own_amount is None else own_amount,
                amount_varies=own_amount is None,
                account=clean_text(account),
                category=category,
                subcategory=subcategory,
                note=clean_text(payee) or None,
                currency=clean_text(iso) or None,
            )
        )
    return rules


def _latest_instance_amounts(
    connection: sqlite3.Connection, uids: set[str]
) -> dict[str, Decimal | None]:
    """Each rule's latest generated amount, in one pass over the transactions."""
    if not uids:
        return {}
    latest: dict[str, object] = {}
    for uid, amount in connection.execute(_INSTANCES_SQL):
        text = str(uid)
        # Any "_" may end a rule's UID; a later row of the same rule replaces it.
        for position, char in enumerate(text):
            if char == "_" and text[:position] in uids:
                latest[text[:position]] = amount
    return {uid: _amount(amount) for uid, amount in latest.items()}


def _read_budgets(connection: sqlite3.Connection) -> list[BackupBudget]:
    month = ledger_today().strftime("%Y%m")
    amounts: dict[tuple[str, str], list[Decimal | None]] = {}
    for budget_uid, period, amount in connection.execute(_AMOUNTS_SQL, (int(month),)).fetchall():
        slot = (clean_text(budget_uid), clean_text(period))
        amounts.setdefault(slot, []).append(_amount(amount))
    budgets: list[BackupBudget] = []
    for record in connection.execute(_BUDGETS_SQL).fetchall():
        uid, period, total, trans, kind, category, subcategory = record
        key, name = clean_text(uid), clean_text(category)
        limits = amounts.get((key, month)) or amounts.get((key, "0"), [])
        budgets.append(
            BackupBudget(
                uid=key,
                period=_BUDGET_PERIODS.get(period) if isinstance(period, int) else None,
                category_budget=total == 0 and trans == 0 and clean_text(kind) == "1",
                category=name or None,
                subcategory=(clean_text(subcategory) or None) if name else None,
                amount=limits[0] if len(limits) == 1 else None,
            )
        )
    return budgets


def _amount(value: object) -> Decimal | None:
    """A positive amount within the upload limit, rounded as transactions are; else None."""
    if not isinstance(value, int | float):
        return None
    try:
        amount = Decimal(str(value)).quantize(_CENT, rounding=ROUND_HALF_UP)
    except InvalidOperation:
        return None
    return amount if amount.is_finite() and 0 < amount <= MAX_AMOUNT else None


def _millis_date(value: object) -> date | None:
    """The IST calendar day of a Unix-millisecond timestamp."""
    if not isinstance(value, int | float) or not _MIN_MILLIS <= value <= _MAX_MILLIS:
        return None
    moment = datetime.fromtimestamp(float(value) / 1000, tz=UTC)
    return (moment + IST_OFFSET).date()
