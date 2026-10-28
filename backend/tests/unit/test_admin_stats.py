"""The admin stats route: admins only, masked emails, nothing of any ledger."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from ledger_sync.api.admin import router
from ledger_sync.api.deps import get_current_user
from ledger_sync.config.settings import settings
from ledger_sync.core.admin_users import mask_email
from ledger_sync.db.base import Base
from ledger_sync.db.models import ImportLog, Transaction, TransactionType, User
from ledger_sync.db.session import get_session


@pytest.fixture
def session() -> Iterator[Session]:
    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    with sessionmaker(bind=engine)() as db:
        yield db


def _client(db: Session, user: User) -> TestClient:
    app = FastAPI()
    app.include_router(router)
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = lambda: db
    return TestClient(app)


def _seed(db: Session) -> tuple[User, User]:
    now = datetime.now(UTC)
    owner = User(email="owner@example.test", hashed_password="", last_login=now)
    member = User(email="member@example.test", hashed_password="", auth_provider="github")
    db.add_all([owner, member])
    db.commit()
    db.add(
        Transaction(
            transaction_id="t1",
            user_id=member.id,
            date=datetime(2026, 9, 1, tzinfo=UTC),
            amount=Decimal("123456.78"),
            currency="INR",
            type=TransactionType.EXPENSE,
            account="Private Bank",
            category="Private Category",
            source_file="f.xlsx",
        )
    )
    db.add(
        ImportLog(
            user_id=member.id,
            file_hash="h" * 64,
            file_name="private-statement.xlsx",
            rows_processed=1,
            imported_at=now - timedelta(days=1),
        )
    )
    db.commit()
    return owner, member


def test_a_non_admin_is_refused(session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "admin_emails", ["owner@example.test"])
    _owner, member = _seed(session)

    response = _client(session, member).get("/api/admin/stats")

    assert response.status_code == 403


def test_stats_mask_emails_and_leave_ledgers_out(
    session: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(settings, "admin_emails", ["owner@example.test"])
    owner, _member = _seed(session)

    response = _client(session, owner).get("/api/admin/stats")

    assert response.status_code == 200
    body = response.json()
    assert {account["email"] for account in body["users"]["list"]} == {
        "own***@example.test",
        "mem***@example.test",
    }
    for private in ("owner@", "member@", "123456", "Private Bank", "Private Category", "private-"):
        assert private not in response.text
    assert body["users"]["active_7d"] == 2
    assert body["ledger"]["by_type"] == {"Expense": 1, "Income": 0, "Transfer": 0}
    assert len(body["users"]["signups_by_month"]) == 12
    assert len(body["ledger"]["imports_daily"]) == 30


@pytest.mark.parametrize(
    ("email", "masked"),
    [
        ("sg85207@gmail.com", "sg8***@gmail.com"),
        ("ab@x.io", "a***@x.io"),
        ("not-an-email", "***"),
    ],
)
def test_mask_email(email: str, masked: str) -> None:
    assert mask_email(email) == masked
