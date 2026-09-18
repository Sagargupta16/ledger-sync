"""Account authority, exact limits, identity retention and bulk access."""

from datetime import UTC, datetime
from decimal import Decimal

import pytest
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from ledger_sync.core.analytics.refresh import get_analytics_state, lock_analytics_user
from ledger_sync.db.models import AccountType, LedgerAccount, LedgerAccountAlias
from ledger_sync.services.account_settings import (
    get_account,
    get_account_type_lookup,
    get_classification_map,
    get_credit_card_limits,
    replace_credit_card_limits,
    set_account_closed,
    set_account_type,
)
from ledger_sync.services.ledger_dimensions import attach_ledger_dimensions


def test_limits_replace_without_committing_and_preserve_owners(
    test_db_session, test_user, make_user
):
    db = test_db_session
    other = make_user("limits-other@example.test")
    assert replace_credit_card_limits(db, other.id, {"Card": Decimal("900.01")})
    db.commit()
    assert replace_credit_card_limits(db, test_user.id, {"Card": Decimal("12345.67"), "Cash": 0})
    assert get_credit_card_limits(db, test_user.id) == {
        "Card": Decimal("12345.67"),
        "Cash": Decimal(0),
    }
    assert get_classification_map(db, test_user.id) == {}
    db.commit()
    assert not replace_credit_card_limits(db, test_user.id, {"CARD": "12345.67", "cash": 0})
    assert replace_credit_card_limits(db, test_user.id, {"CARD": None})
    assert get_credit_card_limits(db, test_user.id) == {}
    db.rollback()
    assert get_credit_card_limits(db, test_user.id)["Card"] == Decimal("12345.67")
    assert get_credit_card_limits(db, other.id) == {"Card": Decimal("900.01")}
    account = get_account(db, test_user.id, "card")
    assert account.account_type is None
    assert account.is_closed is False


def test_classification_and_closure_do_not_rewrite_transaction_snapshots(
    test_db_session, test_user
):
    db = test_db_session
    rows = [{"account": "İBANK", "from_account": "İBANK", "to_account": "Wallet"}]
    attach_ledger_dimensions(db, test_user.id, rows)
    before = [row.copy() for row in rows]
    account, changed = set_account_closed(db, test_user.id, "i̇bank", True)
    assert changed and account.account_type is None
    closed_date = account.closed_date
    account_id = account.id
    assert not set_account_closed(db, test_user.id, "İBANK", True)[1]
    assert account.closed_date == closed_date
    set_account_type(db, test_user.id, "i̇bank", AccountType.BANK_ACCOUNTS)
    replace_credit_card_limits(db, test_user.id, {"i̇bank": "0.10"})
    assert get_classification_map(db, test_user.id) == {"İBANK": "Bank Accounts"}
    assert set_account_type(db, test_user.id, "İBANK", None)[1]
    assert account.id == account_id
    assert account.is_closed and account.closed_date == closed_date
    assert get_credit_card_limits(db, test_user.id) == {"İBANK": Decimal("0.10")}
    assert rows == before
    assert (
        db.scalar(
            select(LedgerAccountAlias.label).where(LedgerAccountAlias.account_id == account.id)
        )
        == "İBANK"
    )


def test_aliases_share_settings_without_losing_canonical_spelling(test_db_session, test_user):
    db = test_db_session
    account, _ = set_account_type(db, test_user.id, "First Card", AccountType.CREDIT_CARDS)
    db.add(
        LedgerAccountAlias(
            user_id=test_user.id, account_id=account.id, source_key="old card", label="Old Card"
        )
    )
    db.commit()
    assert replace_credit_card_limits(
        db, test_user.id, {"OLD CARD": "22.33", "FIRST CARD": "22.33"}
    )
    assert get_credit_card_limits(db, test_user.id) == {"First Card": Decimal("22.33")}
    assert get_account_type_lookup(db, test_user.id) == {
        "first card": "Credit Cards",
        "old card": "Credit Cards",
    }
    db.commit()
    with pytest.raises(ValueError, match="Conflicting"):
        replace_credit_card_limits(
            db, test_user.id, {"Brand New": 99, "Old Card": 12, "First Card": 13}
        )
    assert get_account(db, test_user.id, "Brand New") is None
    assert get_credit_card_limits(db, test_user.id) == {"First Card": Decimal("22.33")}


@pytest.mark.parametrize(
    "invalid", [-1, "NaN", "Infinity", True, "1.001", "10000000000000", "no amount"]
)
def test_invalid_limits_fail_before_creating_accounts(test_db_session, test_user, invalid):
    db = test_db_session
    with pytest.raises(ValueError):
        replace_credit_card_limits(db, test_user.id, {"Valid First": 100, "Invalid": invalid})
    assert db.scalars(select(LedgerAccount)).all() == []
    assert not db.new


def test_conflicting_case_variants_fail_before_any_mutation(test_db_session, test_user):
    with pytest.raises(ValueError, match="Conflicting"):
        replace_credit_card_limits(test_db_session, test_user.id, {"Card": 1, "CARD": 2})
    assert test_db_session.scalars(select(LedgerAccount)).all() == []


def test_bulk_limit_replacement_has_no_per_account_select(test_db_session, test_user):
    db = test_db_session
    user_id = test_user.id
    statements = []

    def record(_conn, _cursor, statement, _parameters, _context, _many):
        statements.append(statement)

    event.listen(db.bind, "before_cursor_execute", record)
    try:
        limits = {f"Card {i}": Decimal("123.45") for i in range(320)}
        assert replace_credit_card_limits(db, user_id, limits)
        db.flush()
        assert get_credit_card_limits(db, user_id) == limits
        # Queries scale with 150-key chunks; no SELECT per inserted/updated row.
        assert len([sql for sql in statements if sql.lstrip().upper().startswith("SELECT")]) < 25
        cached_accounts = list(db.scalars(select(LedgerAccount)))
        statements.clear()
        assert replace_credit_card_limits(db, user_id, dict.fromkeys(limits, 0))
        db.flush()
        assert all(account.credit_limit == 0 for account in cached_accounts)
        assert len(statements) <= 4
    finally:
        event.remove(db.bind, "before_cursor_execute", record)


def test_type_api_keeps_wire_shape_and_clear_retains_closure_and_limits(two_user_client):
    client, db, user, other, current = two_user_client
    response = client.post(
        "/api/account-classifications",
        params={"account_name": "My Card", "account_type": "Credit Cards"},
    )
    assert response.json() == {
        "account_name": "My Card",
        "account_type": "Credit Cards",
        "status": "success",
    }
    account = get_account(db, user.id, "my card")
    identity = account.id
    replace_credit_card_limits(db, user.id, {"My Card": 5000})
    db.commit()
    assert (
        client.put(
            "/api/account-classifications/status",
            json={"account_name": "MY CARD", "is_closed": True},
        ).status_code
        == 200
    )
    closed_date = account.closed_date
    assert client.get("/api/account-classifications/type/Credit%20Cards").json()["accounts"] == [
        "My Card"
    ]
    assert client.delete("/api/account-classifications/my card").status_code == 200
    assert client.get("/api/account-classifications").json() == {}
    assert client.get("/api/account-classifications/My Card").json()["account_type"] == "Other"
    assert account.id == identity and account.is_closed
    assert account.closed_date == closed_date
    assert get_credit_card_limits(db, user.id) == {"My Card": Decimal("5000")}
    current["user"] = other
    assert client.get("/api/account-classifications/closed").json() == []
    assert client.delete("/api/account-classifications/My Card").status_code == 200
    assert get_account(db, user.id, "My Card").id == identity


def test_status_repeat_preserves_timestamp_and_unconfigured_type(two_user_client):
    client, db, user, _, _ = two_user_client
    body = {"account_name": "Unconfigured", "is_closed": True}
    assert client.put("/api/account-classifications/status", json=body).status_code == 200
    account = get_account(db, user.id, "unconfigured")
    assert account.account_type is None
    closed_date = account.closed_date
    assert closed_date is not None and closed_date <= datetime.now(UTC).replace(tzinfo=None)
    assert client.put("/api/account-classifications/status", json=body).status_code == 200
    assert account.closed_date == closed_date


@pytest.mark.parametrize("path", ["", "/credit-card-limits"])
def test_limit_update_reloads_accounts_cached_before_user_lock(two_user_client, path):
    client, db, user, _, _ = two_user_client
    user_id = user.id
    replace_credit_card_limits(db, user_id, {"Card": 100})
    db.commit()
    account = get_account(db, user_id, "Card")
    with Session(db.bind) as writer:
        lock_analytics_user(writer, user_id)
        replace_credit_card_limits(writer, user_id, {"Card": 200})
        writer.commit()
    # Keep the clean but stale ORM object alive across the endpoint's user lock.
    assert account.credit_limit == Decimal("100")
    response = client.put(f"/api/preferences{path}", json={"credit_card_limits": {"Card": 100}})
    assert response.status_code == 200, response.text
    assert response.json()["credit_card_limits"] == {"Card": 100}
    assert get_analytics_state(db, user_id).preferences_version == 1
    assert get_credit_card_limits(db, user_id) == {"Card": Decimal("100")}


def test_reset_reloads_previously_unset_limits_before_user_lock(two_user_client):
    client, db, user, _, _ = two_user_client
    user_id = user.id
    set_account_type(db, user_id, "Card", AccountType.CREDIT_CARDS)
    db.commit()
    account = get_account(db, user_id, "Card")
    with Session(db.bind) as writer:
        lock_analytics_user(writer, user_id)
        replace_credit_card_limits(writer, user_id, {"Card": 200})
        writer.commit()
    assert account.credit_limit is None
    response = client.post("/api/preferences/reset")
    assert response.status_code == 200, response.text
    assert response.json()["credit_card_limits"] == {}
    assert get_analytics_state(db, user_id).preferences_version == 1
    assert get_credit_card_limits(db, user_id) == {}
