"""Money Manager backups as ledger snapshots: stable UIDs, previews, the deletion guard."""

from datetime import timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ledger_sync.core.sync_engine import LargeDeletionError, SyncEngine
from ledger_sync.db.models import AccountType, ImportLog, LedgerAccount, Transaction, User
from ledger_sync.services.money_manager_import import BackupUpload, import_money_manager_backup
from tests.fixtures.money_manager import household


def _import(session: Session, user: User, body: bytes, **options: bool) -> object:
    return import_money_manager_backup(session, user.id, body, BackupUpload(**options))


def _rows(session: Session, user: User) -> dict[str | None, Transaction]:
    stmt = select(Transaction).where(Transaction.user_id == user.id)
    return {row.source_uid: row for row in session.scalars(stmt)}


def test_first_import_stores_every_row_with_its_uid(
    test_db_session: Session, test_user: User
) -> None:
    result = _import(test_db_session, test_user, household().backup())

    assert result.status == "imported"
    assert result.stats["inserted"] == 3
    assert result.summary.model_dump() == {
        "transactions": 2,
        "transfers": 1,
        "accounts": 2,
        "first_date": "2026-05-01",
        "last_date": "2026-05-20",
    }
    rows = _rows(test_db_session, test_user)
    assert set(rows) == {"tx-salary", "tx-veg", "tx-pay"}
    assert {row.source_system for row in rows.values()} == {"money_manager"}
    assert rows["tx-veg"].occurred_at is not None
    assert rows["tx-veg"].occurred_at.hour == 18
    assert rows["tx-pay"].category == "Transfer: Savings Bank → Travel Card"


def test_the_same_backup_again_is_unchanged_and_a_forced_one_changes_nothing(
    test_db_session: Session, test_user: User
) -> None:
    body = household().backup()
    _import(test_db_session, test_user, body)

    repeat = _import(test_db_session, test_user, body)
    forced = _import(test_db_session, test_user, body, force=True)

    assert repeat.status == "unchanged"
    assert forced.status == "imported"
    assert (forced.stats["inserted"], forced.stats["updated"], forced.stats["deleted"]) == (0, 0, 0)
    logs = test_db_session.scalar(select(func.count()).select_from(ImportLog))
    assert logs == 1


def test_edits_in_money_manager_update_rows_in_place(
    test_db_session: Session, test_user: User
) -> None:
    _import(test_db_session, test_user, household().backup())
    before = {uid: row.transaction_id for uid, row in _rows(test_db_session, test_user).items()}
    edited = household()
    edited.db.execute(
        "UPDATE ZINOUTCOME SET ZAMOUNT = 475, ZCONTENT = 'Vegetables and fruit', "
        "ZTXDATESTR = '2026-05-03', ZDATE = ZDATE + 86400 WHERE ZUID = 'tx-veg'"
    )
    edited.db.execute("UPDATE ZINOUTCOME SET ZAMOUNT = 475 WHERE ZTXUIDTRANS = 'tx-pay'")

    result = _import(test_db_session, test_user, edited.backup())

    rows = _rows(test_db_session, test_user)
    assert (result.stats["updated"], result.stats["inserted"]) == (2, 0)
    assert {uid: row.transaction_id for uid, row in rows.items()} == before
    vegetables = rows["tx-veg"]
    assert (str(vegetables.amount), vegetables.note, vegetables.date.day) == (
        "475.00",
        "Vegetables and fruit",
        3,
    )
    assert str(rows["tx-pay"].amount) == "475.00"


def test_a_row_deleted_in_money_manager_is_soft_deleted(
    test_db_session: Session, test_user: User
) -> None:
    _import(test_db_session, test_user, household().backup())
    trimmed = household()
    trimmed.db.execute("UPDATE ZINOUTCOME SET ZISDEL = 1 WHERE ZUID = 'tx-veg'")

    result = _import(test_db_session, test_user, trimmed.backup())

    assert result.stats["deleted"] == 1
    assert _rows(test_db_session, test_user)["tx-veg"].is_deleted is True


def test_a_preview_reports_changes_and_commits_nothing(
    test_db_session: Session, test_user: User
) -> None:
    result = _import(test_db_session, test_user, household().backup(), dry_run=True)

    assert result.status == "preview"
    assert result.stats["inserted"] == 3
    assert _rows(test_db_session, test_user) == {}
    assert test_db_session.scalar(select(func.count()).select_from(ImportLog)) == 0


def test_a_backup_that_removes_too_much_needs_confirmation(
    test_db_session: Session, test_user: User
) -> None:
    big = household()
    for index in range(40):
        big.entry(f"tx-{index}", "1", "2026-06-01", 10 + index, "acc-bank", category="cat-food")
    _import(test_db_session, test_user, big.backup())

    trimmed = household().backup()
    with pytest.raises(LargeDeletionError, match="remove 40 of your 43"):
        _import(test_db_session, test_user, trimmed)
    assert (
        len([row for row in _rows(test_db_session, test_user).values() if not row.is_deleted]) == 43
    )

    confirmed = _import(test_db_session, test_user, household().backup(), allow_large_delete=True)
    assert confirmed.stats["deleted"] == 40


def _spreadsheet_rows() -> list[dict[str, object]]:
    """The same ledger as household(), as an Excel export would send it."""
    base = {"currency": "INR", "subcategory": None, "note": None}
    return [
        {**base, "date": "2026-05-01", "amount": "90000", "type": "Income",
         "account": "Savings Bank", "category": "Salary"},
        {**base, "date": "2026-05-02", "amount": "450.50", "type": "Expense",
         "account": "Travel Card", "category": "Food", "subcategory": "Groceries",
         "note": "Veg"},
        {**base, "date": "2026-05-20", "amount": "450.50", "type": "Transfer-Out",
         "account": "Savings Bank", "category": "Travel Card", "note": "Card bill"},
    ]  # fmt: skip


def test_rows_from_a_spreadsheet_import_are_adopted_even_after_a_note_edit(
    test_db_session: Session, test_user: User
) -> None:
    SyncEngine(test_db_session, user_id=test_user.id).import_rows(
        _spreadsheet_rows(), "ledger.xlsx", "a" * 64
    )
    stored = select(Transaction.date, Transaction.transaction_id).where(
        Transaction.user_id == test_user.id
    )
    before = {day.day: transaction_id for day, transaction_id in test_db_session.execute(stored)}

    # The backup's grocery note reads "Vegetables" where the spreadsheet had "Veg".
    result = _import(test_db_session, test_user, household().backup())

    after = {day.day: transaction_id for day, transaction_id in test_db_session.execute(stored)}
    assert (result.stats["inserted"], result.stats["deleted"], result.stats["updated"]) == (0, 0, 1)
    assert len(before) == 3
    assert after == before
    assert _rows(test_db_session, test_user)["tx-veg"].note == "Vegetables"


def test_an_edit_that_makes_a_row_look_like_an_old_one_never_collides(
    test_db_session: Session, test_user: User
) -> None:
    _import(test_db_session, test_user, household().backup())
    original_id = _rows(test_db_session, test_user)["tx-veg"].transaction_id
    # The grocery row is edited away, and a new row takes its old content exactly.
    swapped = household()
    swapped.db.execute("UPDATE ZINOUTCOME SET ZAMOUNT = 999 WHERE ZUID = 'tx-veg'")
    swapped.entry(
        "tx-veg-2",
        "1",
        "2026-05-02",
        450.5,
        "acc-card",
        category="cat-groceries",
        note="Vegetables",
        at=timedelta(hours=18, minutes=30),
    )

    result = _import(test_db_session, test_user, swapped.backup())

    rows = _rows(test_db_session, test_user)
    assert (result.stats["inserted"], result.stats["updated"]) == (1, 1)
    assert rows["tx-veg"].transaction_id == original_id
    assert str(rows["tx-veg"].amount) == "999.00"
    assert rows["tx-veg-2"].transaction_id != original_id
    assert rows["tx-veg-2"].source_fingerprint is not None


def test_account_settings_are_stored_and_a_chosen_type_is_kept(
    test_db_session: Session, test_user: User
) -> None:
    test_db_session.add(
        LedgerAccount(
            user_id=test_user.id,
            key="savings bank",
            name="Savings Bank",
            account_type=AccountType.INVESTMENTS,
        )
    )
    test_db_session.commit()

    _import(test_db_session, test_user, household().backup())

    accounts = {
        account.name: account
        for account in test_db_session.scalars(
            select(LedgerAccount).where(LedgerAccount.user_id == test_user.id)
        )
    }
    bank, card = accounts["Savings Bank"], accounts["Travel Card"]
    assert bank.account_type == AccountType.INVESTMENTS
    assert card.account_type == AccountType.CREDIT_CARDS
    assert (card.account_group, card.statement_day, card.payment_day) == ("Credit Cards", 16, 5)
    assert card.paid_from_account_id == bank.id
    assert card.source_uid == "acc-card"
