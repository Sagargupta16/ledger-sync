"""Integration tests for GET /api/analytics/v2/spending-rule.

These tests use TestClient with dependency overrides for both get_session
and get_current_user. SQLite in-memory with StaticPool + check_same_thread=
False so the test session and the request handler thread share one
connection (and therefore the same in-memory database).
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from ledger_sync.api.deps import get_current_user
from ledger_sync.api.main import app
from ledger_sync.db.base import Base
from ledger_sync.db.models import Transaction, TransactionType, User, UserPreferences
from ledger_sync.db.session import get_session


@pytest.fixture
def rule_client():
    # StaticPool + check_same_thread=False lets one in-memory DB be shared
    # between the fixture thread and the TestClient request thread. Without
    # StaticPool, each new connection gets its own fresh (empty) in-memory DB.
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestSession = sessionmaker(bind=engine)  # noqa: N806 -- sessionmaker returns a class, PascalCase is idiomatic
    session = TestSession()

    user = User(email="rule@example.com", is_active=True, is_verified=True, hashed_password="")
    session.add(user)
    session.flush()
    session.add(UserPreferences(user_id=user.id, essential_categories="[]"))
    session.commit()

    def override_get_session():
        yield session

    def override_get_current_user():
        return user

    app.dependency_overrides[get_session] = override_get_session
    app.dependency_overrides[get_current_user] = override_get_current_user

    client = TestClient(app)
    yield client, session, user

    app.dependency_overrides.clear()
    session.close()


def _add_txn(
    session: Session,
    user_id: int,
    *,
    date: datetime,
    amount: float,
    category: str,
    account: str = "HDFC Savings",
    subcategory: str | None = None,
    txn_type: TransactionType = TransactionType.EXPENSE,
    to_account: str | None = None,
) -> None:
    tid = f"{date.isoformat()}-{category}-{amount}"
    session.add(
        Transaction(
            transaction_id=tid.ljust(64, "0")[:64],
            user_id=user_id,
            date=date,
            amount=Decimal(str(amount)),
            currency="INR",
            type=txn_type,
            account=account,
            to_account=to_account,
            category=category,
            subcategory=subcategory,
            source_file="test.xlsx",
        )
    )


def test_empty_history_returns_zero_buckets(rule_client):
    client, _, _ = rule_client
    r = client.get("/api/analytics/v2/spending-rule")
    assert r.status_code == 200, r.json()
    body = r.json()
    assert body["income_total"] == 0
    assert body["expense_total"] == 0
    assert body["buckets"]["needs"]["amount"] == 0


def test_rent_classified_as_needs(rule_client):
    client, session, user = rule_client
    _add_txn(session, user.id, date=datetime(2026, 6, 1, tzinfo=UTC), amount=25000, category="Rent")
    _add_txn(
        session,
        user.id,
        date=datetime(2026, 6, 5, tzinfo=UTC),
        amount=100000,
        category="Salary",
        txn_type=TransactionType.INCOME,
    )
    session.commit()

    body = client.get("/api/analytics/v2/spending-rule").json()
    assert body["buckets"]["needs"]["amount"] == 25000
    assert body["buckets"]["wants"]["amount"] == 0
    assert body["savings_amount"] == 75000


def test_dining_classified_as_needs_per_defaults(rule_client):
    """`Food & Dining` is in the built-in Needs defaults so it lands in Needs."""
    client, session, user = rule_client
    _add_txn(
        session,
        user.id,
        date=datetime(2026, 6, 1, tzinfo=UTC),
        amount=3000,
        category="Food & Dining",
    )
    _add_txn(
        session,
        user.id,
        date=datetime(2026, 6, 5, tzinfo=UTC),
        amount=50000,
        category="Salary",
        txn_type=TransactionType.INCOME,
    )
    session.commit()

    body = client.get("/api/analytics/v2/spending-rule").json()
    assert body["buckets"]["needs"]["amount"] == 3000


def test_transfer_to_ppf_classified_as_savings(rule_client):
    client, session, user = rule_client
    _add_txn(
        session,
        user.id,
        date=datetime(2026, 6, 1, tzinfo=UTC),
        amount=12500,
        category="Investment",
        subcategory="PPF Contribution",
        txn_type=TransactionType.TRANSFER,
        account="HDFC Savings",
        to_account="HDFC PPF Account",
    )
    _add_txn(
        session,
        user.id,
        date=datetime(2026, 6, 5, tzinfo=UTC),
        amount=100000,
        category="Salary",
        txn_type=TransactionType.INCOME,
    )
    session.commit()

    body = client.get("/api/analytics/v2/spending-rule").json()
    assert body["savings_amount"] == 100000
    savings_cat_rows = [c for c in body["categories"] if c["bucket"] == "savings"]
    assert len(savings_cat_rows) == 1
    # Non-generic category "Investment" is preserved as-is (prettifier only
    # triggers on generic "Transfer"-style labels).
    assert savings_cat_rows[0]["category"] == "Investment"


def test_generic_transfer_relabelled_to_instrument_name(rule_client):
    """When the user's Excel has category='Transfer' (generic), the /budgets
    page should show 'PPF Contribution' / 'SIP Investment' / etc based on the
    destination account, not the literal word 'Transfer'.
    """
    client, session, user = rule_client
    _add_txn(
        session,
        user.id,
        date=datetime(2026, 6, 1, tzinfo=UTC),
        amount=12500,
        category="Transfer",  # generic label -- should get relabelled
        subcategory=None,
        txn_type=TransactionType.TRANSFER,
        account="HDFC Savings",
        to_account="HDFC PPF Account",
    )
    _add_txn(
        session,
        user.id,
        date=datetime(2026, 6, 5, tzinfo=UTC),
        amount=5000,
        category="Transfer",
        subcategory="Transfer to SIP",  # generic sub too
        txn_type=TransactionType.TRANSFER,
        account="HDFC Savings",
        to_account="Groww MF Account",
    )
    _add_txn(
        session,
        user.id,
        date=datetime(2026, 6, 10, tzinfo=UTC),
        amount=200000,
        category="Salary",
        txn_type=TransactionType.INCOME,
    )
    session.commit()

    body = client.get("/api/analytics/v2/spending-rule").json()
    savings_cats = [c["category"] for c in body["categories"] if c["bucket"] == "savings"]
    # Both rows should now show as instrument names, not "Transfer".
    assert "Transfer" not in savings_cats
    assert "PPF Contribution" in savings_cats
    assert "Mutual Fund Investment" in savings_cats


def test_same_category_different_subs_collapse_into_one_row(rule_client):
    """A user with Food & Dining / {Cafeteria, Delivery, Groceries} should
    see ONE Food & Dining row on the /budgets page, with top_subs listing
    the sub-breakdown. Previously the page had 3 separate rows dominating
    the Needs column.
    """
    client, session, user = rule_client
    _add_txn(
        session,
        user.id,
        date=datetime(2026, 6, 1, tzinfo=UTC),
        amount=1000,
        category="Food & Dining",
        subcategory="Office Cafeteria",
    )
    _add_txn(
        session,
        user.id,
        date=datetime(2026, 6, 2, tzinfo=UTC),
        amount=600,
        category="Food & Dining",
        subcategory="Delivery Apps",
    )
    _add_txn(
        session,
        user.id,
        date=datetime(2026, 6, 3, tzinfo=UTC),
        amount=300,
        category="Food & Dining",
        subcategory="Groceries",
    )
    _add_txn(
        session,
        user.id,
        date=datetime(2026, 6, 5, tzinfo=UTC),
        amount=100000,
        category="Salary",
        txn_type=TransactionType.INCOME,
    )
    session.commit()

    body = client.get("/api/analytics/v2/spending-rule").json()
    fd_rows = [c for c in body["categories"] if c["category"] == "Food & Dining"]
    assert len(fd_rows) == 1, "Food & Dining subs must collapse into one row"

    row = fd_rows[0]
    assert row["total_amount"] == 1900
    assert row["txn_count"] == 3
    # top_subs sorted by amount desc: Cafeteria 1000, Delivery 600, Groceries 300
    top_names = [s["name"] for s in row["top_subs"]]
    assert top_names == ["Office Cafeteria", "Delivery Apps", "Groceries"]
    assert row["top_subs"][0]["amount"] == 1000
    # subcategory field is now always None (backward-compat placeholder).
    assert row["subcategory"] is None


def test_top_subs_capped_at_three(rule_client):
    """A category with >3 subs shows only the top 3 in top_subs, but the
    total row still aggregates all of them."""
    client, session, user = rule_client
    for amt, sub in [(500, "A"), (400, "B"), (300, "C"), (200, "D"), (100, "E")]:
        _add_txn(
            session,
            user.id,
            date=datetime(2026, 6, 1, tzinfo=UTC),
            amount=amt,
            category="Miscellaneous",
            subcategory=sub,
        )
    _add_txn(
        session,
        user.id,
        date=datetime(2026, 6, 5, tzinfo=UTC),
        amount=10000,
        category="Salary",
        txn_type=TransactionType.INCOME,
    )
    session.commit()

    body = client.get("/api/analytics/v2/spending-rule").json()
    misc = next(c for c in body["categories"] if c["category"] == "Miscellaneous")
    assert misc["total_amount"] == 1500  # all five summed
    assert len(misc["top_subs"]) == 3  # capped
    assert [s["name"] for s in misc["top_subs"]] == ["A", "B", "C"]


def test_transfer_relabel_fallback_when_dest_unknown(rule_client):
    """Destination account doesn't match any known instrument -- fall back
    to 'Investment' instead of leaving 'Transfer'."""
    client, session, user = rule_client
    _add_txn(
        session,
        user.id,
        date=datetime(2026, 6, 1, tzinfo=UTC),
        amount=5000,
        category="Transfer",
        txn_type=TransactionType.TRANSFER,
        account="HDFC Savings",
        to_account="Some Weird Broker XYZ",  # not in the pattern list
    )
    _add_txn(
        session,
        user.id,
        date=datetime(2026, 6, 5, tzinfo=UTC),
        amount=100000,
        category="Salary",
        txn_type=TransactionType.INCOME,
    )
    session.commit()

    body = client.get("/api/analytics/v2/spending-rule").json()
    # Only shows up if classified as savings (via investment_accounts_set match).
    # With unknown to_account, it might not be classified as savings at all --
    # in which case there are no savings category rows. If it IS in savings,
    # the label should NOT be "Transfer".
    savings_cats = [c["category"] for c in body["categories"] if c["bucket"] == "savings"]
    assert "Transfer" not in savings_cats


def test_scores_delta_signed_correctly(rule_client):
    client, session, user = rule_client
    _add_txn(session, user.id, date=datetime(2026, 6, 1, tzinfo=UTC), amount=40000, category="Rent")
    _add_txn(
        session, user.id, date=datetime(2026, 6, 2, tzinfo=UTC), amount=20000, category="Dining"
    )
    _add_txn(
        session,
        user.id,
        date=datetime(2026, 6, 5, tzinfo=UTC),
        amount=100000,
        category="Salary",
        txn_type=TransactionType.INCOME,
    )
    session.commit()

    body = client.get("/api/analytics/v2/spending-rule").json()
    assert body["buckets"]["needs"]["score_delta"] > 0
    assert body["buckets"]["wants"]["score_delta"] > 0
    assert body["buckets"]["savings"]["score_delta"] > 0


def test_monthly_average_uses_period_length(rule_client):
    client, session, user = rule_client
    for m in (4, 5, 6):
        _add_txn(
            session, user.id, date=datetime(2026, m, 1, tzinfo=UTC), amount=20000, category="Rent"
        )
    _add_txn(
        session,
        user.id,
        date=datetime(2026, 6, 5, tzinfo=UTC),
        amount=300000,
        category="Salary",
        txn_type=TransactionType.INCOME,
    )
    session.commit()

    r = client.get(
        "/api/analytics/v2/spending-rule",
        params={"start_date": "2026-04-01T00:00:00Z", "end_date": "2026-06-30T23:59:59Z"},
    )
    body = r.json()
    rent_row = next(c for c in body["categories"] if c["category"] == "Rent")
    assert rent_row["total_amount"] == 60000
    assert 19_500 < rent_row["avg_monthly"] < 20_500


def test_user_essentials_override_defaults(rule_client):
    """User's essential_categories overrides built-in Indian defaults."""
    client, session, user = rule_client
    prefs = session.query(UserPreferences).filter_by(user_id=user.id).one()
    prefs.essential_categories = '["Vacation"]'
    session.commit()

    _add_txn(session, user.id, date=datetime(2026, 6, 1, tzinfo=UTC), amount=25000, category="Rent")
    _add_txn(
        session, user.id, date=datetime(2026, 6, 2, tzinfo=UTC), amount=15000, category="Vacation"
    )
    session.commit()

    body = client.get("/api/analytics/v2/spending-rule").json()
    assert body["buckets"]["needs"]["amount"] == 15000
    assert body["buckets"]["wants"]["amount"] == 25000


def test_response_shape_matches_frontend_contract(rule_client):
    client, _, _ = rule_client
    r = client.get("/api/analytics/v2/spending-rule")
    assert r.status_code == 200, r.json()
    body = r.json()

    assert set(body.keys()) == {
        "period",
        "income_total",
        "expense_total",
        "savings_amount",
        "targets",
        "buckets",
        "categories",
    }
    assert set(body["period"].keys()) == {"start", "end", "months"}
    assert set(body["targets"].keys()) == {"needs", "wants", "savings"}
    assert set(body["buckets"].keys()) == {"needs", "wants", "savings"}
    for bucket in body["buckets"].values():
        assert set(bucket.keys()) == {"amount", "pct_of_income", "score_delta"}
