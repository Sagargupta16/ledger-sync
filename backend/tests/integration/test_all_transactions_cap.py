"""GET /api/transactions/all -- the row cap rejects instead of truncating.

The endpoint was unbounded while its sibling ``/search`` capped at 1000. On the
maintainer's ledger it already returns 6,961 rows (2.86 MB of JSON, 394 KB
gzipped), and the upload validator accepts 100,000 rows per file, so an
unbounded response scales to tens of megabytes.

The contract these tests pin: under the cap nothing changes for the existing
callers, and over the cap the request FAILS with the real count. Truncating
would be worse than an error -- a short JSON array is indistinguishable from a
complete one, and every caller feeds it into money totals.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest

from ledger_sync.api import transactions as transactions_api
from ledger_sync.db.models import Transaction, TransactionType

ALL_URL = "/api/transactions/all"


def _seed(session, user_id: int, count: int, prefix: str = "tx") -> None:
    base = datetime(2024, 1, 1, tzinfo=UTC)
    session.add_all(
        [
            Transaction(
                transaction_id=f"{prefix}-{user_id}-{i}",
                user_id=user_id,
                date=base + timedelta(days=i),
                amount=Decimal("100"),
                currency="INR",
                type=TransactionType.EXPENSE,
                account="HDFC Bank",
                category="Food",
                subcategory=None,
                note="lunch",
                source_file="test.xlsx",
                last_seen_at=datetime.now(UTC),
                is_deleted=False,
            )
            for i in range(count)
        ]
    )
    session.commit()


@pytest.fixture
def small_cap(monkeypatch: pytest.MonkeyPatch) -> int:
    """Shrink the cap so the boundary is testable without seeding 25k rows."""
    monkeypatch.setattr(transactions_api, "MAX_ALL_TRANSACTIONS", 5)
    return 5


def test_result_set_at_the_cap_still_returns_every_row(two_user_client, small_cap: int) -> None:
    """Exactly at the limit is a success, and the response shape is unchanged.

    The array itself is the whole contract -- no ``X-Total-Count`` header, which
    would only restate ``len(body)`` under a name that promises the unfiltered
    total.
    """
    client, session, user_a, _, _ = two_user_client
    _seed(session, user_a.id, small_cap)

    r = client.get(ALL_URL)

    assert r.status_code == 200
    assert len(r.json()) == small_cap
    assert "X-Total-Count" not in r.headers


def test_result_set_over_the_cap_is_rejected_with_the_real_count(
    two_user_client,
    small_cap: int,
) -> None:
    """413 naming the true total -- never a silently shortened array."""
    client, session, user_a, _, _ = two_user_client
    _seed(session, user_a.id, small_cap + 3)

    r = client.get(ALL_URL)

    assert r.status_code == 413
    detail = r.json()["detail"]
    assert str(small_cap + 3) in detail
    assert "/api/transactions" in detail


def test_a_narrower_date_range_brings_an_over_cap_ledger_back_under(
    two_user_client,
    small_cap: int,
) -> None:
    """The documented escape hatch actually works."""
    client, session, user_a, _, _ = two_user_client
    _seed(session, user_a.id, small_cap + 3)

    r = client.get(ALL_URL, params={"start_date": "2024-01-01", "end_date": "2024-01-03"})

    assert r.status_code == 200
    assert len(r.json()) == 3


def test_the_cap_counts_only_the_calling_user(two_user_client, small_cap: int) -> None:
    """Another user's volume must not push this user over the limit."""
    client, session, user_a, user_b, _ = two_user_client
    _seed(session, user_a.id, 2, prefix="a")
    _seed(session, user_b.id, small_cap + 10, prefix="b")

    r = client.get(ALL_URL)

    assert r.status_code == 200
    assert len(r.json()) == 2
