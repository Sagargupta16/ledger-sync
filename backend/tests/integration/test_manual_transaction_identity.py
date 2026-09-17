"""Manual writes share import identity and atomic analytics invalidation."""

from datetime import datetime
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from ledger_sync.api import transactions as transactions_api
from ledger_sync.core.analytics.refresh import get_analytics_state
from ledger_sync.db.base import Base
from ledger_sync.db.models import Transaction, TransactionType
from ledger_sync.ingest.hash_id import TransactionHasher

URL = "/api/transactions"
BODY = {
    "date": "2026-01-03T00:00:00",
    "amount": 100.25,
    "type": "Expense",
    "category": "Food",
    "account": "Cash",
    "note": "manual purchase",
}


def test_manual_creation_sets_v2_fingerprint_and_invalidates_only_owner(two_user_client):
    client, session, user, other, _ = two_user_client
    response = client.post(URL, json=BODY)
    assert response.status_code == 201, response.text
    tx = session.get(Transaction, response.json()["id"])
    assert tx.source_fingerprint == tx.transaction_id
    assert tx.fingerprint_version == 2
    state = get_analytics_state(session, user.id)
    assert state.ledger_version == 1
    assert state.full_rebuild_required
    assert get_analytics_state(session, other.id) is None
    state.full_rebuild_required = False
    session.commit()

    response = client.post(URL, json={**BODY, "date": "2026-01-04T23:00:00Z"})
    assert response.status_code == 201
    state = get_analytics_state(session, user.id)
    assert state.ledger_version == 2
    assert state.dirty_dates == '["2026-01-04"]'


def test_duplicate_fingerprint_with_preserved_old_id_is_409_without_invalidation(two_user_client):
    client, session, user, _, _ = two_user_client
    response = client.post(URL, json=BODY)
    assert response.status_code == 201
    tx = session.get(Transaction, response.json()["id"])
    # Imports preserve pre-v2 public IDs while recording a current fingerprint.
    tx.transaction_id = "legacy-id".ljust(64, "0")
    session.commit()

    response = client.post(URL, json=BODY)
    assert response.status_code == 409
    assert session.query(Transaction).count() == 1
    assert get_analytics_state(session, user.id).ledger_version == 1


def test_transfer_destinations_have_distinct_manual_identities(two_user_client):
    client, session, user, _, _ = two_user_client
    transfer = {**BODY, "type": "Transfer", "category": "Transfer", "from_account": "Cash"}
    first = client.post(URL, json={**transfer, "to_account": "Bank A"})
    second = client.post(URL, json={**transfer, "to_account": "Bank B"})
    assert first.status_code == second.status_code == 201
    assert first.json()["id"] != second.json()["id"]
    assert get_analytics_state(session, user.id).ledger_version == 2


def test_transfer_source_accounts_are_part_of_manual_identity(two_user_client):
    client, session, user, _, _ = two_user_client
    transfer = {
        **BODY,
        "type": "Transfer",
        "category": "Transfer",
        "account": "Transfer display label",
        "to_account": "Bank",
    }
    first = client.post(URL, json={**transfer, "from_account": "Cash A"})
    second = client.post(URL, json={**transfer, "from_account": "Cash B"})
    assert first.status_code == second.status_code == 201
    assert first.json()["id"] != second.json()["id"]
    assert get_analytics_state(session, user.id).ledger_version == 2


@pytest.mark.parametrize("collision", [False, True])
@pytest.mark.parametrize(
    ("original_fields", "colliding_fields"),
    [
        (
            {"note": "memo|food", "category": "travel"},
            {"note": "memo", "category": "food|travel"},
        ),
        (
            {"category": "alpha|beta", "subcategory": "gamma"},
            {"category": "alpha", "subcategory": "beta|gamma"},
        ),
        (
            {"account": "Cash|memo", "note": "purchase"},
            {"account": "Cash", "note": "memo|purchase"},
        ),
    ],
)
def test_legacy_manual_duplicates_check_canonical_fields(
    two_user_client, collision, original_fields, colliding_fields
):
    client, session, user, _, _ = two_user_client
    body = {**BODY, "date": "2026-01-03T00:00:00Z", **original_fields}
    date = datetime.fromisoformat(body["date"])
    fields = {
        "date": date,
        "amount": Decimal(str(body["amount"])),
        "account": body["account"],
        "note": body["note"],
        "category": body["category"],
        "subcategory": body.get("subcategory"),
        "tx_type": body["type"],
        "user_id": user.id,
    }
    session.add(
        Transaction(
            transaction_id=TransactionHasher().generate_transaction_id(**fields, version=1),
            user_id=user.id,
            date=date,
            amount=fields["amount"],
            account=body["account"],
            note=body["note"],
            category=body["category"],
            subcategory=body.get("subcategory"),
            type=TransactionType.EXPENSE,
            currency="INR",
            source_file="manual_entry",
            fingerprint_version=1,
        )
    )
    session.commit()
    if collision:
        body.update(colliding_fields)
        changed_fields = {**fields, **colliding_fields}
        assert TransactionHasher().generate_transaction_id(
            **changed_fields, version=1
        ) == TransactionHasher().generate_transaction_id(**fields, version=1)
    response = client.post(URL, json=body)
    assert response.status_code == (201 if collision else 409), response.text
    assert session.query(Transaction).count() == (2 if collision else 1)


@pytest.mark.parametrize(
    ("from_account", "to_account", "status"),
    [("Cash", "Bank A", 409), ("Cash", "Bank B", 201), ("Cash B", "Bank A", 201)],
)
def test_legacy_manual_transfer_accounts_are_checked_before_deduplication(
    two_user_client, from_account, to_account, status
):
    client, session, user, _, _ = two_user_client
    body = {
        **BODY,
        "type": "Transfer",
        "category": "Transfer",
        "account": "Transfer label",
        "from_account": "Cash",
        "to_account": "Bank A",
    }
    fields = {
        "date": datetime.fromisoformat(body["date"]),
        "amount": Decimal(str(body["amount"])),
        "account": body["account"],
        "note": body["note"],
        "category": "Transfer",
        "tx_type": "Transfer",
        "user_id": user.id,
        "to_account": "Bank A",
    }
    session.add(
        Transaction(
            transaction_id=TransactionHasher().generate_transaction_id(**fields, version=1),
            fingerprint_version=1,
            user_id=user.id,
            date=fields["date"],
            amount=fields["amount"],
            account=body["account"],
            from_account="Cash",
            to_account="Bank A",
            type=TransactionType.TRANSFER,
            category="Transfer",
            note=body["note"],
            currency="INR",
            source_file="legacy.csv",
        )
    )
    session.commit()

    response = client.post(
        URL, json={**body, "from_account": from_account, "to_account": to_account}
    )

    assert response.status_code == status, response.text
    assert session.query(Transaction).count() == (2 if status == 201 else 1)


def test_failed_invalidation_rolls_back_the_manual_insert(two_user_client, monkeypatch):
    client, session, user, _, _ = two_user_client
    mark = transactions_api.mark_ledger_changed

    def failing_mark(*args, **kwargs):
        mark(*args, **kwargs)
        raise RuntimeError("Synthetic invalidation failure")

    monkeypatch.setattr(transactions_api, "mark_ledger_changed", failing_mark)
    with pytest.raises(RuntimeError, match="Synthetic invalidation failure"):
        client.post(URL, json=BODY)
    # The production get_session dependency rolls back on any exception.
    session.rollback()
    assert session.query(Transaction).count() == 0
    assert get_analytics_state(session, user.id) is None
    for name in (
        "ledger_accounts",
        "ledger_account_aliases",
        "ledger_categories",
        "ledger_subcategories",
    ):
        assert session.scalar(select(func.count()).select_from(Base.metadata.tables[name])) == 0


def test_manual_dimensions_persist_with_owner_and_unchanged_labels(two_user_client):
    client, session, user, other, current = two_user_client
    body = {
        **BODY,
        "type": "Transfer",
        "from_account": "Cash",
        "to_account": "Bank",
        "category": "Move",
        "subcategory": "Monthly",
    }
    account_ids = []
    for owner in (user, other):
        current["user"] = owner
        response = client.post(URL, json=body)
        assert response.status_code == 201, response.text
        for label in ("account", "from_account", "to_account", "category", "subcategory"):
            assert response.json()[label] == body[label]
            assert f"{label}_id" not in response.json()
        stored = (
            session.execute(
                select(Transaction.__table__).where(
                    Transaction.transaction_id == response.json()["id"]
                )
            )
            .mappings()
            .one()
        )
        assert stored["account_id"] == stored["from_account_id"]
        account_ids.append(stored["account_id"])
        for column, table_name in (
            ("account_id", "ledger_accounts"),
            ("from_account_id", "ledger_accounts"),
            ("to_account_id", "ledger_accounts"),
            ("category_id", "ledger_categories"),
            ("subcategory_id", "ledger_subcategories"),
        ):
            assert stored[column] is not None
            table = Base.metadata.tables[table_name]
            dimension = (
                session.execute(select(table).where(table.c.id == stored[column])).mappings().one()
            )
            assert dimension["user_id"] == owner.id
            if column == "subcategory_id":
                assert dimension["category_id"] == stored["category_id"]
    assert account_ids[0] != account_ids[1]
