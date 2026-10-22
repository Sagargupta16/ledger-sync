"""Read a Money Manager (Realbyte) backup into upload rows and account settings.

A ``.mmbak`` is the app's Core Data SQLite store, sent as is or gzip- or
zip-compressed. It is loaded into an in-memory, query-only connection with a
size cap and a query deadline; nothing touches the disk. Only live rows of the
transaction, account, account-group, category and currency tables are read.

Rows come out in the upload shape that ``normalize_from_dict`` takes, so they
normalize exactly like an Excel export of the same ledger, plus source keys
(``_source_uid`` and timestamps) that give each row a stable identity.
"""

from __future__ import annotations

import hashlib
import io
import sqlite3
import time
import zipfile
import zlib
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any

from ledger_sync.core.ledger_clock import IST_OFFSET

SOURCE_SYSTEM = "money_manager"
# The largest SQLite store accepted after decompression.
MAX_DATABASE_BYTES = 64 * 1024 * 1024
_QUERY_DEADLINE_SECONDS = 10.0

_SQLITE_MAGIC = b"SQLite format 3\x00"
_GZIP_MAGIC = b"\x1f\x8b"
_ZIP_MAGIC = b"PK\x03\x04"
# Core Data stores dates as seconds since 2001-01-01 UTC.
_CORE_DATA_EPOCH = datetime(2001, 1, 1, tzinfo=UTC)

_INCOME, _EXPENSE, _TRANSFER_OUT, _TRANSFER_IN = "0", "1", "3", "4"
_UNCATEGORIZED = "Uncategorized"

_REQUIRED_COLUMNS = {
    "ZINOUTCOME": {
        "ZUID",
        "ZISDEL",
        "ZDO_TYPE",
        "ZTXDATESTR",
        "ZDATE",
        "ZAMOUNT",
        "ZASSETUID",
        "ZTOASSETUID",
        "ZCATEGORYUID",
        "ZCONTENT",
        "ZTXUIDTRANS",
        "ZUTIME",
        "ZCURRENCYUID",
    },
    "ZASSET": {"ZUID", "ZNICNAME", "ZISDEL", "ZGROUPUID", "ZCARD_DAYFIN", "ZCARD_DAYPAY"},
    "ZASSETGROUP": {"ZUID", "ZASSETGROUPNAME"},
    "ZCATEGORY": {"ZUID", "ZNAME", "ZPUID"},
    "ZCURRENCY": {"ZUID", "ZISO"},
}

_TRANSACTIONS_SQL = """
SELECT i.ZUID, i.ZDO_TYPE, i.ZTXDATESTR, i.ZDATE, i.ZAMOUNT, i.ZCONTENT, i.ZTXUIDTRANS,
       i.ZUTIME, a.ZNICNAME, t.ZNICNAME, c.ZNAME, p.ZNAME, cur.ZISO
FROM ZINOUTCOME i
LEFT JOIN ZASSET a ON a.ZUID = i.ZASSETUID
LEFT JOIN ZASSET t ON t.ZUID = i.ZTOASSETUID
LEFT JOIN ZCATEGORY c ON c.ZUID = i.ZCATEGORYUID
LEFT JOIN ZCATEGORY p ON p.ZUID = c.ZPUID
LEFT JOIN ZCURRENCY cur ON cur.ZUID = i.ZCURRENCYUID
WHERE COALESCE(i.ZISDEL, 0) = 0
ORDER BY i.ZDATE, i.ZUID
"""

_ACCOUNTS_SQL = """
SELECT a.ZUID, a.ZNICNAME, g.ZASSETGROUPNAME, a.ZCARD_DAYFIN, a.ZCARD_DAYPAY, a.ZCARDASSETUID
FROM ZASSET a
LEFT JOIN ZASSETGROUP g ON g.ZUID = a.ZGROUPUID
WHERE COALESCE(a.ZISDEL, 0) = 0 AND TRIM(COALESCE(a.ZNICNAME, '')) <> ''
ORDER BY a.ZORDER, a.ZUID
"""


class MoneyManagerBackupError(ValueError):
    """The upload is not a readable Money Manager backup."""


@dataclass(frozen=True, slots=True)
class BackupAccount:
    """A live Money Manager account and the card settings Excel exports leave out."""

    uid: str
    name: str
    group: str | None
    statement_day: int | None
    payment_day: int | None
    paid_from_uid: str | None


@dataclass(frozen=True, slots=True)
class MoneyManagerBackup:
    """Upload rows and accounts read from one backup."""

    # SHA-256 of the SQLite store itself, so a gzipped and a raw copy match.
    database_hash: str
    rows: list[dict[str, Any]]
    accounts: list[BackupAccount]
    transactions: int
    transfers: int


def read_backup(body: bytes) -> MoneyManagerBackup:
    """Unpack, check and read a backup, or raise MoneyManagerBackupError."""
    database = unpack_backup(body)
    connection = _connect(database)
    try:
        _check_schema(connection)
        rows, transfers = _read_rows(connection)
        accounts = _read_accounts(connection)
    except sqlite3.Error as error:
        raise MoneyManagerBackupError(_unreadable(error)) from error
    finally:
        connection.close()
    if not rows:
        raise MoneyManagerBackupError("The backup has no transactions to import.")
    return MoneyManagerBackup(
        database_hash=hashlib.sha256(database).hexdigest(),
        rows=rows,
        accounts=accounts,
        transactions=len(rows) - transfers,
        transfers=transfers,
    )


def unpack_backup(body: bytes) -> bytes:
    """Return the SQLite store from a raw, gzip- or zip-wrapped upload."""
    if body.startswith(_GZIP_MAGIC):
        body = _gunzip(body)
    if body.startswith(_ZIP_MAGIC):
        body = _unzip(body)
    if not body.startswith(_SQLITE_MAGIC):
        raise MoneyManagerBackupError(
            "This is not a Money Manager backup. Upload the .mmbak file the app exports, "
            "optionally gzip- or zip-compressed."
        )
    if len(body) > MAX_DATABASE_BYTES:
        raise MoneyManagerBackupError(_too_large())
    return body


def _too_large() -> str:
    return f"The backup is larger than {MAX_DATABASE_BYTES // (1024 * 1024)} MB uncompressed."


def _gunzip(body: bytes) -> bytes:
    """Decompress one gzip member without ever holding more than the cap."""
    decompressor = zlib.decompressobj(wbits=31)
    try:
        data = decompressor.decompress(body, MAX_DATABASE_BYTES + 1)
    except zlib.error as error:
        raise MoneyManagerBackupError("The compressed backup is damaged.") from error
    if len(data) > MAX_DATABASE_BYTES or decompressor.unconsumed_tail:
        raise MoneyManagerBackupError(_too_large())
    if not decompressor.eof:
        raise MoneyManagerBackupError("The compressed backup is incomplete. Upload it again.")
    return data


def _unzip(body: bytes) -> bytes:
    """Read the one backup file inside a zip archive."""
    try:
        with zipfile.ZipFile(io.BytesIO(body)) as archive:
            files = [entry for entry in archive.infolist() if not entry.is_dir()]
            named = [
                entry
                for entry in files
                if entry.filename.lower().endswith((".mmbak", ".sqlite", ".db"))
            ]
            candidates = named if len(files) > 1 else files
            if len(candidates) != 1:
                raise MoneyManagerBackupError("The zip file must hold exactly one .mmbak backup.")
            entry = candidates[0]
            if entry.file_size > MAX_DATABASE_BYTES:
                raise MoneyManagerBackupError(_too_large())
            with archive.open(entry) as handle:
                data = handle.read(MAX_DATABASE_BYTES + 1)
    except (zipfile.BadZipFile, RuntimeError, NotImplementedError, EOFError) as error:
        raise MoneyManagerBackupError("The zip file could not be read.") from error
    if len(data) > MAX_DATABASE_BYTES:
        raise MoneyManagerBackupError(_too_large())
    return data


def _connect(database: bytes) -> sqlite3.Connection:
    """An in-memory, query-only copy that refuses untrusted schema features."""
    connection = sqlite3.connect(":memory:")
    try:
        connection.deserialize(database)
        connection.setconfig(sqlite3.SQLITE_DBCONFIG_DEFENSIVE, True)
        connection.execute("PRAGMA trusted_schema = OFF")
        connection.execute("PRAGMA query_only = ON")
        deadline = time.monotonic() + _QUERY_DEADLINE_SECONDS
        connection.set_progress_handler(lambda: int(time.monotonic() > deadline), 10_000)
        status = connection.execute("PRAGMA quick_check").fetchone()
    except sqlite3.Error as error:
        connection.close()
        raise MoneyManagerBackupError(_unreadable(error)) from error
    if status is None or status[0] != "ok":
        connection.close()
        raise MoneyManagerBackupError("The backup file is damaged. Export a new backup.")
    return connection


def _unreadable(error: sqlite3.Error) -> str:
    if "interrupt" in str(error).lower():
        return "The backup took too long to read."
    return "The backup could not be read as a Money Manager database."


def _check_schema(connection: sqlite3.Connection) -> None:
    for table, required in _REQUIRED_COLUMNS.items():
        kind = connection.execute(
            "SELECT type FROM sqlite_master WHERE name = ?", (table,)
        ).fetchone()
        if kind is None or kind[0] != "table":
            raise MoneyManagerBackupError(
                "This SQLite file is not a Money Manager backup (missing its transaction tables)."
            )
        columns = {row[1] for row in connection.execute(f"PRAGMA table_info({table})")}
        missing = sorted(required - columns)
        if missing:
            raise MoneyManagerBackupError(
                f"This Money Manager backup has an unsupported layout ({table} lacks "
                f"{', '.join(missing)})."
            )


def _read_rows(connection: sqlite3.Connection) -> tuple[list[dict[str, Any]], int]:
    """One row per income or expense, and one per transfer (both legs collapse)."""
    rows: list[dict[str, Any]] = []
    outs: set[str] = set()
    pending_ins: list[dict[str, Any]] = []
    problems: Counter[str] = Counter()
    for record in connection.execute(_TRANSACTIONS_SQL):
        row, problem = _row_from_record(record)
        if problem:
            problems[problem] += 1
        elif row is not None and row["type"] == "Transfer-In":
            pending_ins.append(row)
        elif row is not None:
            if row["type"] == "Transfer-Out":
                outs.add(row["_source_uid"])
            rows.append(row)
    if problems:
        described = "; ".join(f"{count} {what}" for what, count in problems.items())
        raise MoneyManagerBackupError(
            f"Some transactions cannot be imported ({described}). Fix them in Money Manager "
            "and export a new backup."
        )
    # An In leg stands for its transfer only when the Out leg is missing.
    unpaired = [row for row in pending_ins if row["_source_uid"] not in outs]
    rows.extend(unpaired)
    return rows, len(outs) + len(unpaired)


def _row_from_record(record: tuple[Any, ...]) -> tuple[dict[str, Any] | None, str | None]:
    """The upload row for one live ZINOUTCOME record, or why it cannot be imported."""
    uid, kind, day, stamp, amount, note, pair, updated, account, other, name, parent, iso = record
    if kind not in (_INCOME, _EXPENSE, _TRANSFER_OUT, _TRANSFER_IN):
        return None, None
    if iso not in (None, "INR"):
        return None, "in a currency other than INR"
    if not _text(account):
        return None, "without an account"
    base = _base_row(uid, day, stamp, amount, note, updated)
    if kind in (_INCOME, _EXPENSE):
        return {
            **base,
            "type": "Income" if kind == _INCOME else "Expense",
            "account": _text(account),
            "category": _text(parent) or _text(name) or _UNCATEGORIZED,
            "subcategory": _text(name) if _text(parent) else None,
        }, None
    if not _text(other):
        return None, "as transfers without a second account"
    # Both legs share ZTXUIDTRANS, which names the transfer as a whole. Like an
    # Excel export, the Out leg reads account -> category and the In leg the reverse.
    return {
        **base,
        "_source_uid": _text(pair) or str(uid),
        "type": "Transfer-Out" if kind == _TRANSFER_OUT else "Transfer-In",
        "account": _text(account),
        "category": _text(other),
        "subcategory": None,
    }, None


def _base_row(
    uid: object, day: object, stamp: object, amount: object, note: object, updated: object
) -> dict[str, Any]:
    occurred = _core_data_time(stamp)
    date_text = _text(day) or (occurred.date().isoformat() if occurred else "")
    return {
        "date": date_text,
        "amount": abs(Decimal(str(amount))) if amount is not None else None,
        "currency": "INR",
        "note": _text(note) or None,
        "_source_system": SOURCE_SYSTEM,
        "_source_uid": str(uid),
        "_source_updated_at": _epoch_millis(updated),
        "_occurred_at": occurred,
    }


def _read_accounts(connection: sqlite3.Connection) -> list[BackupAccount]:
    return [
        BackupAccount(
            uid=str(uid),
            name=_text(name),
            group=_text(group) or None,
            statement_day=_day_of_month(statement),
            payment_day=_day_of_month(payment),
            paid_from_uid=_text(paid_from) or None,
        )
        for uid, name, group, statement, payment, paid_from in connection.execute(_ACCOUNTS_SQL)
    ]


def _text(value: object) -> str:
    return str(value).strip() if value is not None else ""


def _day_of_month(value: object) -> int | None:
    text = _text(value)
    if not text.isdigit():
        return None
    day = int(text)
    return day if 1 <= day <= 31 else None


def _core_data_time(value: object) -> datetime | None:
    """Naive IST wall-clock time of a Core Data timestamp, like Transaction.date."""
    if not isinstance(value, int | float):
        return None
    moment = _CORE_DATA_EPOCH + timedelta(seconds=float(value))
    return (moment + IST_OFFSET).replace(tzinfo=None)


def _epoch_millis(value: object) -> datetime | None:
    """Naive UTC time of a Unix timestamp in milliseconds."""
    if not isinstance(value, int | float) or value <= 0:
        return None
    return datetime.fromtimestamp(float(value) / 1000, tz=UTC).replace(tzinfo=None)
