"""Synthetic Money Manager backups: only the tables and columns the importer reads."""

from __future__ import annotations

import sqlite3
from datetime import UTC, date, datetime, timedelta

# Unix time of the Core Data epoch, 2001-01-01 UTC.
_CORE_DATA_EPOCH_UNIX = 978_307_200
_IST_SECONDS = 19_800

_SCHEMA = """
CREATE TABLE ZINOUTCOME (
    Z_PK INTEGER PRIMARY KEY, ZUID VARCHAR, ZISDEL INTEGER, ZDO_TYPE VARCHAR,
    ZTXDATESTR VARCHAR, ZDATE TIMESTAMP, ZAMOUNT FLOAT, ZASSETUID VARCHAR,
    ZTOASSETUID VARCHAR, ZCATEGORYUID VARCHAR, ZCONTENT VARCHAR, ZTXUIDTRANS VARCHAR,
    ZUTIME INTEGER, ZCURRENCYUID VARCHAR
);
CREATE TABLE ZASSET (
    Z_PK INTEGER PRIMARY KEY, ZUID VARCHAR, ZNICNAME VARCHAR, ZISDEL INTEGER,
    ZGROUPUID VARCHAR, ZCARD_DAYFIN VARCHAR, ZCARD_DAYPAY VARCHAR, ZCARDASSETUID VARCHAR,
    ZORDER INTEGER
);
CREATE TABLE ZASSETGROUP (Z_PK INTEGER PRIMARY KEY, ZUID VARCHAR, ZASSETGROUPNAME VARCHAR);
CREATE TABLE ZCATEGORY (Z_PK INTEGER PRIMARY KEY, ZUID VARCHAR, ZNAME VARCHAR, ZPUID VARCHAR);
CREATE TABLE ZCURRENCY (Z_PK INTEGER PRIMARY KEY, ZUID VARCHAR, ZISO VARCHAR);
INSERT INTO ZCURRENCY (ZUID, ZISO) VALUES ('cur-inr', 'INR'), ('cur-usd', 'USD');
"""

# Optional tables: older backups lack them, and the importer must not need them.
_PLANNING_SCHEMA = """
CREATE TABLE ZREPEATTRANSACTION (
    Z_PK INTEGER PRIMARY KEY, ZUID VARCHAR, ZISDEL INTEGER, ZREPEATTYPE INTEGER,
    ZDOTYPE INTEGER, ZNEXTDATE INTEGER, ZENDDATE INTEGER, ZAMOUNTSUB FLOAT, ZASSETUID VARCHAR,
    ZTOASSETUID VARCHAR, ZCATEGORYUID VARCHAR, ZCURRENCYUID VARCHAR, ZPAYEE VARCHAR
);
CREATE TABLE ZBUDGET (
    Z_PK INTEGER PRIMARY KEY, ZUID VARCHAR, ZISDEL INTEGER, ZPERIODTYPEINT INTEGER,
    ZTOTALTYPEINT INTEGER, ZTRANSTYPEINT INTEGER, ZDOTYPESTR VARCHAR, ZTARGETUID VARCHAR
);
CREATE TABLE ZBUDGETAMOUNT (
    Z_PK INTEGER PRIMARY KEY, ZBUDGETUID VARCHAR, ZBUDGETPERIOD INTEGER, ZISDEL INTEGER,
    ZAMOUNT FLOAT
);
ALTER TABLE ZCATEGORY ADD COLUMN ZISDEL INTEGER;
"""


def core_data_seconds(day: str, at: timedelta = timedelta(0)) -> float:
    """Core Data timestamp of an IST wall-clock time on ``day``."""
    midnight = datetime.combine(date.fromisoformat(day), datetime.min.time(), tzinfo=UTC)
    unix = midnight.timestamp() - _IST_SECONDS + at.total_seconds()
    return unix - _CORE_DATA_EPOCH_UNIX


def unix_millis(day: str, at: timedelta = timedelta(0)) -> int:
    """Unix milliseconds of an IST wall-clock time on ``day``, as repeat rules store dates."""
    return round((core_data_seconds(day, at) + _CORE_DATA_EPOCH_UNIX) * 1000)


class BackupBuilder:
    """Build a backup row by row, then take its bytes with ``backup()``."""

    def __init__(self) -> None:
        self.db = sqlite3.connect(":memory:")
        self.db.executescript(_SCHEMA)

    def group(self, uid: str, name: str) -> BackupBuilder:
        self.db.execute(
            "INSERT INTO ZASSETGROUP (ZUID, ZASSETGROUPNAME) VALUES (?, ?)", (uid, name)
        )
        return self

    def account(
        self,
        uid: str,
        name: str,
        *,
        group: str | None = None,
        statement_day: str | None = None,
        payment_day: str | None = None,
        paid_from: str | None = None,
        deleted: bool = False,
    ) -> BackupBuilder:
        self.db.execute(
            "INSERT INTO ZASSET (ZUID, ZNICNAME, ZISDEL, ZGROUPUID, ZCARD_DAYFIN, ZCARD_DAYPAY,"
            " ZCARDASSETUID, ZORDER) VALUES (?, ?, ?, ?, ?, ?, ?, 0)",
            (uid, name, 1 if deleted else None, group, statement_day, payment_day, paid_from),
        )
        return self

    def category(self, uid: str, name: str, parent: str | None = None) -> BackupBuilder:
        self.db.execute(
            "INSERT INTO ZCATEGORY (ZUID, ZNAME, ZPUID) VALUES (?, ?, ?)", (uid, name, parent)
        )
        return self

    def entry(
        self,
        uid: str,
        kind: str,
        day: str,
        amount: float,
        account: str,
        *,
        category: str | None = None,
        note: str | None = None,
        to: str | None = None,
        pair: str | None = None,
        deleted: bool | None = None,
        currency: str = "cur-inr",
        at: timedelta = timedelta(0),
        updated_ms: int = 1_790_000_000_000,
    ) -> BackupBuilder:
        """One ZINOUTCOME record; ``kind`` is 0 income, 1 expense, 3 transfer out, 4 in."""
        self.db.execute(
            "INSERT INTO ZINOUTCOME (ZUID, ZISDEL, ZDO_TYPE, ZTXDATESTR, ZDATE, ZAMOUNT, ZASSETUID,"
            " ZTOASSETUID, ZCATEGORYUID, ZCONTENT, ZTXUIDTRANS, ZUTIME, ZCURRENCYUID)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                uid,
                None if deleted is None else int(deleted),
                kind,
                day,
                core_data_seconds(day, at),
                amount,
                account,
                to,
                category,
                note,
                pair,
                updated_ms,
                currency,
            ),
        )
        return self

    def transfer(
        self, pair: str, day: str, amount: float, source: str, target: str, note: str | None = None
    ) -> BackupBuilder:
        """Both legs of a transfer, the way Money Manager stores one."""
        self.entry(f"{pair}-out", "3", day, amount, source, to=target, pair=pair, note=note)
        return self.entry(f"{pair}-in", "4", day, amount, target, to=source, pair=pair, note=note)

    def with_planning(self) -> BackupBuilder:
        """Add the optional repeat-rule and budget tables, empty."""
        self.db.executescript(_PLANNING_SCHEMA)
        return self

    def repeat_rule(
        self,
        uid: str,
        kind: int,
        next_due: str,
        amount: float,
        account: str,
        *,
        repeat_type: int = 1,
        category: str | None = None,
        to: str | None = None,
        payee: str | None = None,
        end: str | None = None,
        deleted: bool = False,
        currency: str = "cur-inr",
    ) -> BackupBuilder:
        """One ZREPEATTRANSACTION row; ``kind`` is 0 income, 1 expense, 3 transfer."""
        self.db.execute(
            "INSERT INTO ZREPEATTRANSACTION (ZUID, ZISDEL, ZREPEATTYPE, ZDOTYPE, ZNEXTDATE,"
            " ZENDDATE, ZAMOUNTSUB, ZASSETUID, ZTOASSETUID, ZCATEGORYUID, ZCURRENCYUID, ZPAYEE)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                uid,
                int(deleted),
                repeat_type,
                kind,
                unix_millis(next_due),
                unix_millis(end) if end else 0,
                amount,
                account,
                to,
                category,
                currency,
                payee,
            ),
        )
        return self

    def budget(
        self,
        uid: str,
        target: str,
        amount: float,
        *,
        period: int = 6,
        overrides: dict[int, float] | None = None,
        total_type: int = 0,
        trans_type: int = 0,
        deleted: bool = False,
    ) -> BackupBuilder:
        """A ZBUDGET row with its default amount (period key 0) and any overrides."""
        self.db.execute(
            "INSERT INTO ZBUDGET (ZUID, ZISDEL, ZPERIODTYPEINT, ZTOTALTYPEINT, ZTRANSTYPEINT,"
            " ZDOTYPESTR, ZTARGETUID) VALUES (?, ?, ?, ?, ?, '1', ?)",
            (uid, int(deleted), period, total_type, trans_type, target),
        )
        for key, value in {0: amount, **(overrides or {})}.items():
            self.db.execute(
                "INSERT INTO ZBUDGETAMOUNT (ZBUDGETUID, ZBUDGETPERIOD, ZISDEL, ZAMOUNT)"
                " VALUES (?, ?, NULL, ?)",
                (uid, key, value),
            )
        return self

    def backup(self) -> bytes:
        return self.db.serialize()


def household() -> BackupBuilder:
    """A small ledger: two accounts, a card paid from the bank, a few rows of each kind."""
    return (
        BackupBuilder()
        .group("grp-bank", "Bank Accounts")
        .group("grp-card", "Credit Cards")
        .account("acc-bank", "Savings Bank", group="grp-bank")
        .account(
            "acc-card",
            "Travel Card",
            group="grp-card",
            statement_day="16",
            payment_day="5",
            paid_from="acc-bank",
        )
        .category("cat-food", "Food")
        .category("cat-groceries", "Groceries", parent="cat-food")
        .category("cat-salary", "Salary")
        .entry("tx-salary", "0", "2026-05-01", 90000, "acc-bank", category="cat-salary")
        .entry(
            "tx-veg",
            "1",
            "2026-05-02",
            450.5,
            "acc-card",
            category="cat-groceries",
            note="Vegetables",
            at=timedelta(hours=18, minutes=30),
        )
        .transfer("tx-pay", "2026-05-20", 450.5, "acc-bank", "acc-card", note="Card bill")
    )
