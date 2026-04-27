"""Unit tests for the AI tools registry.

Validates each tool against a real (in-memory) SQLite DB with seeded
transactions, so SQL bugs surface here rather than at runtime.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from ledger_sync.api.ai_tools import router as tools_router
from ledger_sync.api.deps import get_current_user
from ledger_sync.db.base import Base
from ledger_sync.db.models import (
    FinancialGoal,
    GoalStatus,
    NetWorthSnapshot,
    RecurrenceFrequency,
    RecurringTransaction,
    Transaction,
    TransactionType,
    User,
)
from ledger_sync.db.session import get_session

TEST_BCRYPT_HASH = "$2b$12$dummy_hash_for_testing_purposes"  # noqa: S105


def _make_app_with_data() -> tuple[FastAPI, Session, User]:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()

    user = User(
        email="t@e.com",
        hashed_password=TEST_BCRYPT_HASH,
        full_name="T",
        is_active=True,
        is_verified=True,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    _seed_transactions(session, user)

    app = FastAPI()
    app.include_router(tools_router)
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = lambda: session
    return app, session, user


def _seed_transactions(session: Session, user: User) -> None:
    """Seed a small representative dataset across two accounts and categories."""
    rows = [
        # HDFC Salary
        ("hash1", "2026-02-01", "100000", TransactionType.INCOME, "HDFC Bank", "Salary"),
        # HDFC expenses
        ("hash2", "2026-02-10", "5000", TransactionType.EXPENSE, "HDFC Bank", "Food"),
        ("hash3", "2026-02-15", "170", TransactionType.EXPENSE, "HDFC Bank", "Personal Care"),
        ("hash4", "2026-03-05", "12000", TransactionType.EXPENSE, "HDFC Bank", "Rent"),
        # ICICI expenses
        ("hash5", "2026-03-20", "1500", TransactionType.EXPENSE, "ICICI Bank", "Food"),
    ]
    for tid, d, amt, ttype, acc, cat in rows:
        session.add(
            Transaction(
                transaction_id=tid,
                user_id=user.id,
                date=datetime.fromisoformat(d).replace(tzinfo=UTC),
                amount=Decimal(amt),
                currency="INR",
                type=ttype,
                account=acc,
                category=cat,
                source_file="test.xlsx",
            )
        )
    # A transfer
    session.add(
        Transaction(
            transaction_id="hash_xfer",
            user_id=user.id,
            date=datetime(2026, 3, 1, tzinfo=UTC),
            amount=Decimal("5000"),
            currency="INR",
            type=TransactionType.TRANSFER,
            account="HDFC Bank",
            category="Transfer",
            from_account="HDFC Bank",
            to_account="ICICI Bank",
            source_file="test.xlsx",
        )
    )
    session.commit()


def _exec(client: TestClient, name: str, args: dict | None = None) -> dict:
    resp = client.post(
        "/api/ai/tools/execute",
        json={"name": name, "arguments": args or {}},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()["result"]


def test_list_tools_returns_all_specs() -> None:
    app, _s, _u = _make_app_with_data()
    client = TestClient(app)
    resp = client.get("/api/ai/tools")
    assert resp.status_code == 200
    names = {t["name"] for t in resp.json()["tools"]}
    expected = {
        "list_accounts",
        "search_transactions",
        "get_monthly_summary",
        "list_categories",
        "get_category_spending",
        "get_net_worth",
        "list_recurring",
        "list_goals",
        "list_recent_months",
    }
    assert expected.issubset(names)


def test_execute_unknown_tool_returns_404() -> None:
    app, _s, _u = _make_app_with_data()
    client = TestClient(app)
    resp = client.post("/api/ai/tools/execute", json={"name": "does_not_exist", "arguments": {}})
    assert resp.status_code == 404


def test_list_accounts_returns_hdfc_and_icici() -> None:
    app, _s, _u = _make_app_with_data()
    client = TestClient(app)
    result = _exec(client, "list_accounts")
    names = [a["name"] for a in result["accounts"]]
    assert "HDFC Bank" in names
    assert "ICICI Bank" in names
    # HDFC balance = 100000 income - 5000 - 170 - 12000 expense - 5000 xfer out = 77830
    hdfc = next(a for a in result["accounts"] if a["name"] == "HDFC Bank")
    assert hdfc["balance"] == pytest.approx(77830)
    # ICICI balance = 5000 transfer in - 1500 expense = 3500
    icici = next(a for a in result["accounts"] if a["name"] == "ICICI Bank")
    assert icici["balance"] == pytest.approx(3500)


def test_search_transactions_query_matches_note_and_category() -> None:
    app, _s, _u = _make_app_with_data()
    client = TestClient(app)

    result = _exec(client, "search_transactions", {"query": "Personal Care"})
    assert result["returned"] == 1
    assert result["transactions"][0]["amount"] == 170

    # Limit + date filter
    result = _exec(
        client,
        "search_transactions",
        {"start_date": "2026-03-01", "end_date": "2026-03-31", "type": "Expense"},
    )
    # 3 expenses in March: Rent 12000, Food 1500 (ICICI). (Transfer is not Expense type.)
    amounts = sorted(t["amount"] for t in result["transactions"])
    assert amounts == [1500, 12000]


def test_list_categories_ranks_by_total() -> None:
    app, _s, _u = _make_app_with_data()
    client = TestClient(app)
    result = _exec(client, "list_categories")
    cats = [c["category"] for c in result["categories"]]
    # Rent (12000) > Food (6500) > Personal Care (170)
    assert cats.index("Rent") < cats.index("Food")
    assert cats.index("Food") < cats.index("Personal Care")


def test_get_category_spending_sums_ilike_match() -> None:
    app, _s, _u = _make_app_with_data()
    client = TestClient(app)
    result = _exec(client, "get_category_spending", {"category": "food"})
    assert result["total"] == pytest.approx(6500)
    assert result["count"] == 2


def test_get_net_worth_uses_latest_snapshot() -> None:
    app, session, user = _make_app_with_data()
    # Seed two snapshots; the later one should win
    session.add(
        NetWorthSnapshot(
            user_id=user.id,
            snapshot_date=datetime(2026, 2, 1, tzinfo=UTC),
            total_assets=Decimal("100000"),
            cash_and_bank=Decimal("100000"),
            investments=Decimal("0"),
            mutual_funds=Decimal("0"),
            stocks=Decimal("0"),
            fixed_deposits=Decimal("0"),
            ppf_epf=Decimal("0"),
            other_assets=Decimal("0"),
            credit_card_outstanding=Decimal("0"),
            loans_payable=Decimal("0"),
            other_liabilities=Decimal("0"),
            total_liabilities=Decimal("0"),
            net_worth=Decimal("100000"),
            net_worth_change=Decimal("0"),
        )
    )
    session.add(
        NetWorthSnapshot(
            user_id=user.id,
            snapshot_date=datetime(2026, 3, 1, tzinfo=UTC),
            total_assets=Decimal("150000"),
            cash_and_bank=Decimal("100000"),
            investments=Decimal("50000"),
            mutual_funds=Decimal("50000"),
            stocks=Decimal("0"),
            fixed_deposits=Decimal("0"),
            ppf_epf=Decimal("0"),
            other_assets=Decimal("0"),
            credit_card_outstanding=Decimal("0"),
            loans_payable=Decimal("0"),
            other_liabilities=Decimal("0"),
            total_liabilities=Decimal("0"),
            net_worth=Decimal("150000"),
            net_worth_change=Decimal("50000"),
        )
    )
    session.commit()

    client = TestClient(app)
    result = _exec(client, "get_net_worth")
    assert result["found"] is True
    assert result["net_worth"] == pytest.approx(150000)
    assert result["assets"]["investments"] == pytest.approx(50000)


def test_list_recurring_filters_active() -> None:
    app, session, user = _make_app_with_data()
    session.add(
        RecurringTransaction(
            user_id=user.id,
            pattern_name="Netflix",
            category="Entertainment",
            account="HDFC Bank",
            transaction_type=TransactionType.EXPENSE,
            frequency=RecurrenceFrequency.MONTHLY,
            expected_amount=Decimal("649"),
            amount_variance=Decimal("0"),
            confidence_score=95,
            occurrences_detected=3,
            times_missed=0,
            is_active=True,
        )
    )
    session.add(
        RecurringTransaction(
            user_id=user.id,
            pattern_name="Old gym",
            category="Health",
            account="ICICI Bank",
            transaction_type=TransactionType.EXPENSE,
            frequency=RecurrenceFrequency.MONTHLY,
            expected_amount=Decimal("1500"),
            amount_variance=Decimal("0"),
            confidence_score=80,
            occurrences_detected=2,
            times_missed=3,
            is_active=False,
        )
    )
    session.commit()

    client = TestClient(app)
    result = _exec(client, "list_recurring")
    assert result["count"] == 1
    assert result["recurring"][0]["name"] == "Netflix"

    result_all = _exec(client, "list_recurring", {"active_only": False})
    assert result_all["count"] == 2


def test_list_goals() -> None:
    app, session, user = _make_app_with_data()
    session.add(
        FinancialGoal(
            user_id=user.id,
            name="Emergency Fund",
            goal_type="savings",
            target_amount=Decimal("300000"),
            current_amount=Decimal("150000"),
            progress_pct=50.0,
            status=GoalStatus.ACTIVE,
        )
    )
    session.commit()

    client = TestClient(app)
    result = _exec(client, "list_goals")
    assert result["count"] == 1
    assert result["goals"][0]["progress_pct"] == pytest.approx(50.0)
