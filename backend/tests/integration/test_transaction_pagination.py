"""Ordering, cursor boundaries, filter binding, and bounded query work."""

import base64
import csv
import io
import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import event

from ledger_sync.api.transaction_pagination import MAX_CURSOR_LENGTH, _signature
from ledger_sync.db.models import Transaction, TransactionTag, TransactionType

LIST_URL = "/api/transactions"
SEARCH_URL = f"{LIST_URL}/search"


def _seed(session, user_id, count=11):
    # Scrambled insertion order, groups of equal dates, and ties in every sort.
    transactions = [
        Transaction(
            transaction_id=f"{user_id:04x}{index:060x}",
            user_id=user_id,
            date=datetime(2026, 1, 1, tzinfo=UTC) + timedelta(days=index // 4),
            amount=Decimal(index % 3 + 1),
            type=TransactionType.EXPENSE,
            currency="INR",
            account="Cash" if index % 2 else "Bank",
            category="Food" if index % 2 else "Travel",
            subcategory="Daily",
            note="routine purchase",
            source_file="synthetic.csv",
            is_deleted=False,
        )
        for index in range(count)
    ]
    session.add_all(transactions[::2] + transactions[1::2])
    session.commit()
    return transactions


def _get(client, url, **params):
    response = client.get(url, params=params)
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize("sort_by", ["date", "amount", "category", "account"])
@pytest.mark.parametrize("sort_order", ["asc", "desc"])
def test_offset_search_and_export_have_identical_total_order(two_user_client, sort_by, sort_order):
    client, session, user, other, _ = two_user_client
    transactions = _seed(session, user.id)
    _seed(session, other.id)
    expected = [
        tx.transaction_id
        for tx in sorted(
            transactions,
            key=lambda tx: (getattr(tx, sort_by), tx.transaction_id),
            reverse=sort_order == "desc",
        )
    ]
    found = []
    for offset in range(0, len(expected), 3):
        page = _get(
            client, SEARCH_URL, offset=offset, limit=3, sort_by=sort_by, sort_order=sort_order
        )
        found.extend(tx["id"] for tx in page["data"])
        assert page["total"] == len(expected)
        assert page["offset"] == offset
        assert page["has_more"] == (offset + 3 < len(expected))
        if sort_by != "date":
            assert page["next_cursor"] is None
    assert found == expected
    export = client.get(f"{LIST_URL}/export", params={"sort_by": sort_by, "sort_order": sort_order})
    assert export.status_code == 200
    assert [row["id"] for row in csv.DictReader(io.StringIO(export.text))] == expected


@pytest.mark.parametrize("url", [LIST_URL, SEARCH_URL])
@pytest.mark.parametrize("sort_order", ["asc", "desc"])
def test_date_cursor_pages_have_no_gaps_or_repeats(two_user_client, url, sort_order):
    client, session, user, other, _ = two_user_client
    transactions = _seed(session, user.id)
    _seed(session, other.id)
    order = sort_order if url == SEARCH_URL else "desc"
    expected = [
        tx.transaction_id
        for tx in sorted(
            transactions, key=lambda tx: (tx.date, tx.transaction_id), reverse=order == "desc"
        )
    ]
    params = {"limit": 3, "sort_order": order}
    found = []
    while True:
        page = _get(client, url, **params)
        assert page["offset"] == len(found)
        assert page["total"] == len(expected)
        found.extend(tx["id"] for tx in page["data"])
        if not page["has_more"]:
            assert page["next_cursor"] is None
            break
        assert len(page["next_cursor"]) <= MAX_CURSOR_LENGTH
        params["cursor"] = page["next_cursor"]
    assert found == expected
    if url == LIST_URL:
        assert [tx["id"] for tx in _get(client, f"{LIST_URL}/all")] == expected


def test_cursor_can_continue_an_offset_page_and_change_page_size(two_user_client):
    client, session, user, _, _ = two_user_client
    transactions = _seed(session, user.id)
    expected = sorted(transactions, key=lambda tx: (tx.date, tx.transaction_id), reverse=True)
    page = _get(client, SEARCH_URL, offset=3, limit=2)
    continued = _get(client, SEARCH_URL, cursor=page["next_cursor"], limit=4)
    assert continued["offset"] == 5
    assert [tx["id"] for tx in continued["data"]] == [tx.transaction_id for tx in expected[5:9]]


@pytest.mark.parametrize("cursor", ["", "garbage", "a.b", "☃", "A" * (MAX_CURSOR_LENGTH + 1)])
@pytest.mark.parametrize("url", [LIST_URL, SEARCH_URL])
def test_malformed_cursors_are_422(two_user_client, cursor, url):
    client, _, _, _, _ = two_user_client
    assert client.get(url, params={"cursor": cursor}).status_code == 422


@pytest.mark.parametrize(
    "replacement",
    [
        {"version": 2},
        {"offset": -1},
        {"offset": True},
        {"offset": 2**63},
        {"date": "not-a-date"},
        {"date": "2026-01-01T00:00:00Z"},
        {"transaction_id": ""},
        {"transaction_id": "x" * 65},
        {"extra": "ignored?"},
    ],
)
def test_even_signed_cursors_validate_payload(two_user_client, replacement):
    client, session, user, _, _ = two_user_client
    _seed(session, user.id)
    token = _get(client, SEARCH_URL, limit=2)["next_cursor"]
    payload = token.split(".")[0]
    values = json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    values.update(replacement)
    encoded = base64.urlsafe_b64encode(json.dumps(values).encode()).decode().rstrip("=")
    malformed = f"{encoded}.{_signature(encoded)}"
    assert client.get(SEARCH_URL, params={"cursor": malformed}).status_code == 422


def test_modified_cursor_signature_is_rejected(two_user_client):
    client, session, user, _, _ = two_user_client
    _seed(session, user.id)
    token = _get(client, SEARCH_URL, limit=2)["next_cursor"]
    changed = token[:-1] + ("1" if token[-1] == "0" else "0")
    assert client.get(SEARCH_URL, params={"cursor": changed}).status_code == 422


@pytest.mark.parametrize(
    "changed",
    [
        {"query": "purchase"},
        {"category": "Food"},
        {"subcategory": "Other"},
        {"account": "Cash"},
        {"type": "Income"},
        {"min_amount": 1},
        {"max_amount": 3},
        {"start_date": "2026-01-01"},
        {"end_date": "2026-01-03"},
        {"tag": "work"},
        {"sort_by": "amount"},
        {"sort_order": "asc"},
        {"offset": 2},
    ],
)
def test_cursor_rejects_different_filter_or_sort_context(two_user_client, changed):
    client, session, user, _, _ = two_user_client
    _seed(session, user.id)
    cursor = _get(client, SEARCH_URL, limit=2)["next_cursor"]
    assert client.get(SEARCH_URL, params={"cursor": cursor, **changed}).status_code == 422


def test_cursor_owner_and_excluded_accounts_are_bound(two_user_client):
    client, session, user, other, current = two_user_client
    _seed(session, user.id)
    _seed(session, other.id)
    cursor = _get(client, SEARCH_URL, limit=2)["next_cursor"]
    current["user"] = other
    assert client.get(SEARCH_URL, params={"cursor": cursor}).status_code == 422
    current["user"] = user
    user.preferences.excluded_accounts = '["Bank"]'
    session.commit()
    assert client.get(SEARCH_URL, params={"cursor": cursor}).status_code == 422


def test_equivalent_filters_and_preferences_accept_same_cursor(two_user_client):
    client, session, user, _, _ = two_user_client
    _seed(session, user.id)
    user.preferences.excluded_accounts = '["Unused", "Hidden"]'
    session.commit()
    cursor = _get(
        client,
        SEARCH_URL,
        limit=2,
        type="Expense",
        min_amount="1.00",
        start_date="2026-01-01",
        end_date="2026-01-03",
        query="",
    )["next_cursor"]
    user.preferences.excluded_accounts = '["Hidden", "Unused", "Hidden"]'
    session.commit()
    result = _get(
        client,
        SEARCH_URL,
        limit=2,
        cursor=cursor,
        type="EXPENSE",
        min_amount="1",
        start_date="2026-01-01T00:00:00",
        end_date="2026-01-03T23:59:59.999999",
    )
    assert result["offset"] == 2
    assert result["total"] == 11


def test_filtered_cursor_search_matches_offset_and_export(two_user_client):
    client, session, user, other, _ = two_user_client
    transactions = _seed(session, user.id, count=25)
    _seed(session, other.id)
    for tx in transactions:
        session.add(TransactionTag(user_id=user.id, transaction_id=tx.transaction_id, tag="work"))
    transactions[-2].is_deleted = True
    user.preferences.excluded_accounts = '["Bank"]'
    session.commit()
    filters = {
        "query": "routine",
        "category": "Food",
        "subcategory": "Daily",
        "account": "Cash",
        "type": "Expense",
        "tag": "work",
        "min_amount": 1,
        "max_amount": 3,
        "start_date": "2026-01-01",
        "end_date": "2026-01-06",
    }
    expected = _get(client, SEARCH_URL, **filters)["data"]
    found = []
    cursor_params = {}
    while True:
        page = _get(client, SEARCH_URL, **filters, **cursor_params, limit=2)
        assert page["total"] == len(expected)
        found.extend(page["data"])
        if not page["has_more"]:
            break
        cursor_params = {"cursor": page["next_cursor"]}
    assert found == expected
    assert all(tx["tags"] == ["work"] for tx in found)
    export = client.get(f"{LIST_URL}/export", params=filters)
    assert [row["id"] for row in csv.DictReader(io.StringIO(export.text))] == [
        tx["id"] for tx in expected
    ]


def test_cursor_keeps_boundary_after_newer_insert_and_anchor_deletion(two_user_client):
    client, session, user, _, _ = two_user_client
    transactions = _seed(session, user.id)
    expected = _get(client, SEARCH_URL)["data"]
    first = _get(client, SEARCH_URL, limit=3)
    anchor = session.get(Transaction, first["data"][-1]["id"])
    anchor.is_deleted = True
    session.add_all(
        [
            Transaction(
                transaction_id=prefix * 64,
                user_id=user.id,
                date=datetime(2026, 2, 1, tzinfo=UTC),
                amount=Decimal("1"),
                type=TransactionType.EXPENSE,
                currency="INR",
                account="Cash",
                category="Food",
                source_file="synthetic.csv",
                is_deleted=False,
            )
            for prefix in ("e", "f")
        ]
    )
    session.commit()
    page = _get(client, SEARCH_URL, cursor=first["next_cursor"], limit=100)
    assert page["data"] == expected[3:]
    assert page["total"] == len(transactions) + 1
    assert page["offset"] == 3
    assert not page["has_more"]


@pytest.mark.parametrize(
    ("count", "offset", "limit", "expected_counts", "expected_queries"),
    [(0, 0, 3, 0, 1), (3, 0, 3, 0, 2), (7, 0, 3, 1, 3), (7, 6, 3, 0, 2), (7, 100, 3, 1, 2)],
)
@pytest.mark.parametrize("url", [LIST_URL, SEARCH_URL])
def test_only_count_when_total_cannot_be_inferred(
    two_user_client, count, offset, limit, expected_counts, expected_queries, url
):
    client, session, user, _, _ = two_user_client
    _seed(session, user.id, count)
    # Resolve authentication/preference lazy loads before measuring ledger SQL.
    assert user.preferences is not None
    statements = []

    def record(_conn, _cursor, statement, _parameters, _context, _executemany):
        statements.append(statement)

    event.listen(session.bind, "before_cursor_execute", record)
    try:
        page = _get(client, url, offset=offset, limit=limit)
    finally:
        event.remove(session.bind, "before_cursor_execute", record)
    assert page["total"] == count
    assert sum("count(" in statement.lower() for statement in statements) == expected_counts
    assert len(statements) == expected_queries


@pytest.mark.parametrize("amount", ["nan", "inf", "-inf"])
def test_nonfinite_amount_filter_is_422(two_user_client, amount):
    client, _, _, _, _ = two_user_client
    assert client.get(SEARCH_URL, params={"min_amount": amount}).status_code == 422


def test_cursor_accepts_equivalent_signed_zero_filter(two_user_client):
    client, session, user, _, _ = two_user_client
    _seed(session, user.id)
    first = _get(client, SEARCH_URL, min_amount="-0.0", limit=2)
    second = _get(client, SEARCH_URL, min_amount="0", cursor=first["next_cursor"], limit=2)
    assert second["total"] == first["total"] == 11
    assert second["offset"] == 2


def test_empty_cursor_page_still_counts_full_filter_scope(two_user_client):
    client, session, user, other, _ = two_user_client
    transactions = _seed(session, user.id)
    _seed(session, other.id)
    first = _get(client, SEARCH_URL, limit=3)
    seen = {row["id"] for row in first["data"]}
    for tx in transactions:
        tx.is_deleted = tx.transaction_id not in seen
    session.commit()
    last = _get(client, SEARCH_URL, cursor=first["next_cursor"], limit=3)
    assert last["data"] == []
    assert last["total"] == 3  # Counts rows before the cursor, excluding the other user.
    assert last["offset"] == 3
    assert not last["has_more"]
    assert last["next_cursor"] is None


@pytest.mark.parametrize("limit", [1, 3, 5])
def test_ai_search_orders_equal_dates_by_id_and_preserves_filtered_total(two_user_client, limit):
    client, session, user, other, _ = two_user_client
    transactions = _seed(session, user.id)
    _seed(session, other.id)
    for tx in transactions:
        tx.note = tx.transaction_id  # AI responses intentionally omit the public ID field.
    transactions[5].is_deleted = True
    session.commit()
    expected = sorted(
        (tx for tx in transactions if tx.category == "Food" and not tx.is_deleted),
        key=lambda tx: (tx.date, tx.transaction_id),
        reverse=True,
    )
    response = client.post(
        "/api/ai/tools/execute",
        json={"name": "search_transactions", "arguments": {"limit": limit, "category": "Food"}},
    )
    assert response.status_code == 200, response.text
    result = response.json()["result"]
    assert result["total_matching_filters"] == len(expected)
    assert [tx["note"] for tx in result["transactions"]] == [tx.note for tx in expected[:limit]]
