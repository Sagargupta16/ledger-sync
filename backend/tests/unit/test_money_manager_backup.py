"""Reading Money Manager backups into upload rows."""

import gzip
import io
import zipfile
from decimal import Decimal

import pytest

from ledger_sync.ingest import money_manager
from ledger_sync.ingest.money_manager import MoneyManagerBackupError, read_backup
from tests.fixtures.money_manager import BackupBuilder, household


def _zip(data: bytes, name: str = "20260501_090000.mmbak") -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(name, data)
    return buffer.getvalue()


def _by_uid(rows: list[dict[str, object]]) -> dict[object, dict[str, object]]:
    return {row["_source_uid"]: row for row in rows}


def test_raw_gzip_and_zip_bodies_read_the_same_store() -> None:
    raw = household().backup()

    backups = [read_backup(body) for body in (raw, gzip.compress(raw), _zip(raw))]

    assert {backup.database_hash for backup in backups} == {backups[0].database_hash}
    assert [len(backup.rows) for backup in backups] == [3, 3, 3]


def test_income_and_expense_rows_take_parent_category_and_subcategory() -> None:
    rows = _by_uid(read_backup(household().backup()).rows)

    salary = rows["tx-salary"]
    assert salary | {"_occurred_at": None, "_source_updated_at": None} == {
        "date": "2026-05-01",
        "amount": Decimal("90000.0"),
        "currency": "INR",
        "note": None,
        "_source_system": "money_manager",
        "_source_uid": "tx-salary",
        "_source_updated_at": None,
        "_occurred_at": None,
        "type": "Income",
        "account": "Savings Bank",
        "category": "Salary",
        "subcategory": None,
    }
    # Naive UTC from Unix milliseconds; naive IST from the Core Data timestamp.
    assert salary["_source_updated_at"].isoformat() == "2026-09-21T14:13:20"
    expense = rows["tx-veg"]
    assert (expense["type"], expense["category"], expense["subcategory"]) == (
        "Expense",
        "Food",
        "Groceries",
    )
    assert expense["_occurred_at"].isoformat() == "2026-05-02T18:30:00"


def test_a_transfer_is_one_out_row_named_by_its_pair_uid() -> None:
    backup = read_backup(household().backup())
    transfer = _by_uid(backup.rows)["tx-pay"]

    assert (transfer["type"], transfer["account"], transfer["category"]) == (
        "Transfer-Out",
        "Savings Bank",
        "Travel Card",
    )
    assert (backup.transactions, backup.transfers) == (2, 1)


def test_an_unpaired_in_leg_stands_for_its_transfer() -> None:
    builder = household().entry(
        "lone-in", "4", "2026-06-01", 100, "acc-card", to="acc-bank", pair="lone"
    )

    row = _by_uid(read_backup(builder.backup()).rows)["lone"]

    assert (row["type"], row["account"], row["category"]) == (
        "Transfer-In",
        "Travel Card",
        "Savings Bank",
    )


def test_deleted_rows_are_skipped_and_a_null_flag_is_live() -> None:
    builder = household().entry(
        "tx-gone", "1", "2026-05-03", 10, "acc-bank", category="cat-food", deleted=True
    )
    builder.entry("tx-zero", "1", "2026-05-04", 20, "acc-bank", category="cat-food", deleted=False)

    uids = set(_by_uid(read_backup(builder.backup()).rows))

    assert "tx-gone" not in uids
    assert {"tx-salary", "tx-zero"} <= uids


def test_accounts_carry_group_card_days_and_paying_account() -> None:
    builder = household().account("acc-old", "Closed Wallet", deleted=True)
    builder.account("acc-odd", "Odd Card", statement_day="45", payment_day="soon")

    accounts = {account.uid: account for account in read_backup(builder.backup()).accounts}

    card = accounts["acc-card"]
    assert (card.group, card.statement_day, card.payment_day, card.paid_from_uid) == (
        "Credit Cards",
        16,
        5,
        "acc-bank",
    )
    assert (accounts["acc-odd"].statement_day, accounts["acc-odd"].payment_day) == (None, None)
    assert "acc-old" not in accounts


def test_foreign_currency_rows_reject_the_backup_with_a_count() -> None:
    builder = household()
    builder.entry(
        "tx-usd", "1", "2026-05-05", 5, "acc-card", category="cat-food", currency="cur-usd"
    )

    body = builder.backup()
    with pytest.raises(MoneyManagerBackupError, match="1 in a currency other than INR"):
        read_backup(body)


def test_a_row_without_an_account_rejects_the_backup() -> None:
    builder = household().entry("tx-lost", "1", "2026-05-05", 5, "acc-missing", category="cat-food")

    body = builder.backup()
    with pytest.raises(MoneyManagerBackupError, match="1 without an account"):
        read_backup(body)


@pytest.mark.parametrize(
    "body",
    [b"name,amount\nTea,10\n", gzip.compress(b"not sqlite"), b"SQLite format 3\x00broken"],
)
def test_other_files_are_refused_with_a_readable_reason(body: bytes) -> None:
    with pytest.raises(MoneyManagerBackupError):
        read_backup(body)


def test_a_sqlite_file_without_money_manager_tables_is_refused() -> None:
    other = BackupBuilder()
    other.db.execute("DROP TABLE ZINOUTCOME")

    body = other.backup()
    with pytest.raises(MoneyManagerBackupError, match="not a Money Manager backup"):
        read_backup(body)


def test_stores_over_the_size_cap_are_refused(monkeypatch: pytest.MonkeyPatch) -> None:
    raw = household().backup()
    monkeypatch.setattr(money_manager, "MAX_DATABASE_BYTES", len(raw) - 1)

    for body in (raw, gzip.compress(raw), _zip(raw)):
        with pytest.raises(MoneyManagerBackupError, match="larger than"):
            read_backup(body)


def test_a_backup_without_transactions_is_refused() -> None:
    empty = BackupBuilder().account("acc-bank", "Savings Bank")

    body = empty.backup()
    with pytest.raises(MoneyManagerBackupError, match="no transactions"):
        read_backup(body)
