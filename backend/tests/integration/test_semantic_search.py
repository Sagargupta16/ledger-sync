"""Semantic transaction search: opt-in indexing, ranking and per-user isolation.

The real router runs on in-memory SQLite with a fake Titan client in place of
Bedrock, so nothing leaves the machine. The PostgreSQL test ranks with the
pgvector ``<=>`` operator and needs a disposable local ``ledger_sync_test*``
database that has pgvector installed (CI installs it); it is skipped unless
LEDGER_SYNC_TEST_POSTGRES_URL is set.
"""

from __future__ import annotations

import hashlib
import io
import json
import os
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import uuid4

import numpy as np
import pytest
import sqlalchemy as sa
from botocore.exceptions import ClientError
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from ledger_sync.api.ai_usage import count_app_messages_today
from ledger_sync.api.deps import get_current_user
from ledger_sync.api.rate_limit import limiter
from ledger_sync.api.semantic_search import router
from ledger_sync.config.embedding_settings import embedding_settings
from ledger_sync.core.embeddings import TITAN_V2_MODEL_ID, usd_cost
from ledger_sync.core.query_helpers import ledger_criteria
from ledger_sync.core.semantic_search import PendingRow, nearest, store_embeddings, text_hash
from ledger_sync.db._models.ai_settings import UserAISettings
from ledger_sync.db._models.transaction_embeddings import EMBEDDING_DIMENSIONS, TransactionEmbedding
from ledger_sync.db.base import Base
from ledger_sync.db.models import (
    AIUsageLog,
    Transaction,
    TransactionType,
    User,
    UserPreferences,
)
from ledger_sync.db.session import get_session
from ledger_sync.services import semantic_search_access as access
from ledger_sync.services import semantic_search_service as service

# Words that share a concept land on the same dimension, so "coffee" is close to
# "latte" and "cafe" without any of them being a substring of the others.
CONCEPTS = {
    "coffee": "cafe",
    "latte": "cafe",
    "cafe": "cafe",
    "starbucks": "cafe",
    "chai": "cafe",
    "cab": "ride",
    "uber": "ride",
    "taxi": "ride",
    "ola": "ride",
    "ride": "ride",
    "dinner": "meal",
    "swiggy": "meal",
    "zomato": "meal",
    "lunch": "meal",
    "salary": "pay",
    "bonus": "pay",
}

# (note, category, subcategory, account, type, amount); the last row is soft-deleted.
ROWS = [
    ("Blue Tokai latte", "Food & Dining", "Cafe", "HDFC Card", TransactionType.EXPENSE, 320),
    ("Uber to airport", "Transport", "Cab", "HDFC Card", TransactionType.EXPENSE, 780),
    ("Swiggy dinner", "Food & Dining", "Delivery", "Paytm", TransactionType.EXPENSE, 540),
    ("October salary", "Salary", "Base", "HDFC Savings", TransactionType.INCOME, 150000),
    ("BESCOM electricity", "Bills", "Electricity", "SBI", TransactionType.EXPENSE, 1900),
    ("Starbucks with Riya", "Food & Dining", "Cafe", "ICICI Card", TransactionType.EXPENSE, 610),
    ("", "Shopping", "Clothes", "HDFC Card", TransactionType.EXPENSE, 2500),
    ("Ola ride home", "Transport", "Cab", "Paytm", TransactionType.EXPENSE, 230),
    ("Diwali bonus", "Salary", "Bonus", "HDFC Savings", TransactionType.INCOME, 40000),
    ("Old cafe row", "Food & Dining", "Cafe", "Closed Card", TransactionType.EXPENSE, 100),
]


class FakeTitan:
    """The one bedrock-runtime operation the feature calls."""

    def __init__(self) -> None:
        self.calls: list[str] = []
        self.throttle = False

    @staticmethod
    def vector(text: str) -> np.ndarray:
        out = np.zeros(EMBEDDING_DIMENSIONS, dtype=np.float32)
        for word in re.findall(r"[a-z]+", text.lower()):
            for key, weight in ((word, 1.0), (CONCEPTS.get(word), 3.0)):
                if key:
                    digest = hashlib.sha256(key.encode()).hexdigest()
                    out[int(digest, 16) % EMBEDDING_DIMENSIONS] += weight
        return out / (np.linalg.norm(out) or 1.0)

    def invoke_model(self, **kwargs: Any) -> dict[str, Any]:
        assert kwargs["modelId"] == TITAN_V2_MODEL_ID
        body = json.loads(kwargs["body"])
        assert body["dimensions"] == EMBEDDING_DIMENSIONS
        assert body["normalize"] is True
        if self.throttle:
            error = {"Error": {"Code": "ThrottlingException", "Message": "slow down"}}
            raise ClientError(error, "InvokeModel")
        self.calls.append(body["inputText"])
        payload = {
            "embedding": self.vector(body["inputText"]).tolist(),
            "inputTextTokenCount": len(body["inputText"].split()),
        }
        return {"body": io.BytesIO(json.dumps(payload).encode())}


@dataclass
class Harness:
    client: TestClient
    session: Session
    user_a: User
    user_b: User
    current: dict[str, User]
    titan: FakeTitan


def _transaction(user: User, transaction_id: str, row: tuple[Any, ...], day: int) -> Transaction:
    note, category, subcategory, account, kind, amount = row
    return Transaction(
        transaction_id=transaction_id,
        user_id=user.id,
        date=datetime(2026, 10, day, tzinfo=UTC),
        amount=Decimal(amount),
        type=kind,
        account=account,
        category=category,
        subcategory=subcategory,
        note=note,
        source_file="seed.csv",
    )


@pytest.fixture
def harness(monkeypatch: pytest.MonkeyPatch) -> Harness:
    titan = FakeTitan()
    monkeypatch.setattr(access, "_create_bedrock_client", lambda region, config, bearer: titan)
    monkeypatch.setattr(access, "_check_server_credential_path", lambda: None)
    monkeypatch.setattr(embedding_settings, "embedding_batch_size", 4)
    limiter.reset()

    engine = create_engine(
        "sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    user_a = User(email="a@example.test", is_active=True, is_verified=True, hashed_password="")
    user_b = User(email="b@example.test", is_active=True, is_verified=True, hashed_password="")
    session.add_all([user_a, user_b])
    session.flush()
    for user in (user_a, user_b):
        session.add(UserPreferences(user_id=user.id, essential_categories="[]"))
    for i, row in enumerate(ROWS):
        transaction = _transaction(user_a, f"a{i:02d}", row, i + 1)
        transaction.is_deleted = i == len(ROWS) - 1
        session.add(transaction)
    # User B owns a perfect "coffee" match that must never reach user A.
    perfect = ("coffee coffee latte", "Food & Dining", "Cafe", "B Card", ROWS[0][4], 99)
    session.add(_transaction(user_b, "b00", perfect, 2))
    session.commit()

    app = FastAPI()
    app.state.limiter = limiter
    app.include_router(router)
    current = {"user": user_a}

    def override_session():
        yield session

    app.dependency_overrides[get_session] = override_session
    app.dependency_overrides[get_current_user] = lambda: current["user"]
    yield Harness(TestClient(app), session, user_a, user_b, current, titan)
    session.close()
    engine.dispose()


def _index_everything(harness: Harness) -> list[dict[str, Any]]:
    batches: list[dict[str, Any]] = []
    while True:
        response = harness.client.post("/api/semantic-search/index")
        assert response.status_code == 200, response.text
        batches.append(response.json())
        if batches[-1]["done"]:
            return batches


def _search(harness: Harness, **params: Any) -> dict[str, Any]:
    response = harness.client.get("/api/semantic-search", params=params)
    assert response.status_code == 200, response.text
    return response.json()


def _ids(body: dict[str, Any]) -> list[str]:
    return [hit["transaction"]["id"] for hit in body["results"]]


def test_status_and_search_before_opt_in_call_no_bedrock(harness: Harness) -> None:
    status = harness.client.get("/api/semantic-search/status").json()
    body = _search(harness, q="coffee")

    assert status["available"] is True
    assert (status["total"], status["indexed"], status["pending"]) == (9, 0, 9)
    assert status["funding"] == "app"
    assert (body["indexed"], body["results"]) == (0, [])
    assert harness.titan.calls == []


def test_indexing_runs_in_batches_and_sends_only_descriptive_text(harness: Harness) -> None:
    batches = _index_everything(harness)
    again = harness.client.post("/api/semantic-search/index").json()

    assert [batch["embedded"] for batch in batches] == [4, 4, 1]
    assert (batches[-1]["indexed"], batches[-1]["pending"]) == (9, 0)
    assert (again["done"], again["embedded"]) == (True, 0)
    sent = harness.titan.calls
    assert "Blue Tokai latte | Food & Dining | Cafe | HDFC Card" in sent
    assert "Shopping | Clothes | HDFC Card" in sent  # a blank note is left out
    assert not any(re.search(r"\d{3,}|2026", text) for text in sent)  # no amounts, no dates


def test_usage_is_settled_under_the_embedding_provider(harness: Harness) -> None:
    _index_everything(harness)
    _search(harness, q="coffee")

    usage = harness.session.scalars(
        select(AIUsageLog).where(AIUsageLog.user_id == harness.user_a.id)
    ).all()
    tokens = sum(entry.input_tokens for entry in usage)
    assert usage
    assert {(entry.provider, entry.status) for entry in usage} == {("bedrock-embed", "completed")}
    assert sum(entry.cost_usd for entry in usage) == pytest.approx(usd_cost(tokens), abs=1e-7)
    assert count_app_messages_today(harness.session, harness.user_a.id) == 0


def test_search_ranks_by_meaning_and_applies_the_page_filters(harness: Harness) -> None:
    _index_everything(harness)

    coffee = _search(harness, q="coffee", limit=3)
    taxi = _search(harness, q="taxi", limit=2)
    income = _search(harness, q="coffee", type="Income")
    scores = [hit["score"] for hit in coffee["results"]]

    assert set(_ids(coffee)[:2]) == {"a00", "a05"}
    assert scores == sorted(scores, reverse=True)
    assert set(_ids(taxi)) == {"a01", "a07"}
    assert income["results"]
    assert {hit["transaction"]["type"] for hit in income["results"]} == {"Income"}
    assert "a09" not in _ids(_search(harness, q="cafe", limit=100))  # soft-deleted


def test_excluded_accounts_are_left_out_of_results(harness: Harness) -> None:
    _index_everything(harness)
    preferences = harness.session.scalars(
        select(UserPreferences).where(UserPreferences.user_id == harness.user_a.id)
    ).one()
    preferences.excluded_accounts = json.dumps(["ICICI Card"])
    harness.session.commit()
    harness.session.expire_all()

    assert "a05" not in _ids(_search(harness, q="coffee"))


def test_one_users_search_never_returns_another_users_rows(harness: Harness) -> None:
    _index_everything(harness)
    harness.current["user"] = harness.user_b
    b_batches = _index_everything(harness)
    b_hits = _search(harness, q="coffee", limit=100)
    harness.current["user"] = harness.user_a
    a_hits = _search(harness, q="coffee latte cafe", limit=100)

    assert (b_batches[-1]["total"], b_batches[-1]["indexed"]) == (1, 1)
    assert _ids(b_hits) == ["b00"]
    assert "b00" not in _ids(a_hits)
    assert all(tx_id.startswith("a") for tx_id in _ids(a_hits))

    harness.client.delete("/api/semantic-search/index")
    stored = harness.session.scalars(select(TransactionEmbedding.transaction_id)).all()
    assert stored == ["b00"]  # removing A's index leaves B's vectors alone


def test_edited_note_is_pending_and_only_that_row_re_embeds(harness: Harness) -> None:
    _index_everything(harness)
    row = harness.session.get(Transaction, "a04")
    assert row is not None
    row.note = "Coffee beans from Blue Tokai"
    harness.session.commit()

    stale = harness.client.get("/api/semantic-search/status").json()
    calls = len(harness.titan.calls)
    redo = harness.client.post("/api/semantic-search/index").json()

    assert (stale["pending"], stale["indexed"]) == (1, 8)
    assert (redo["embedded"], redo["done"]) == (1, True)
    assert len(harness.titan.calls) == calls + 1


def test_throttled_batch_is_a_429_and_releases_its_reservation(harness: Harness) -> None:
    harness.titan.throttle = True

    response = harness.client.post("/api/semantic-search/index")

    last = harness.session.scalars(select(AIUsageLog).order_by(AIUsageLog.id.desc())).first()
    assert response.status_code == 429
    assert last is not None
    assert last.status == "failed"
    assert harness.session.scalar(select(func.count()).select_from(TransactionEmbedding)) == 0


def test_user_token_budget_blocks_indexing(harness: Harness) -> None:
    harness.session.add(
        UserAISettings(user_id=harness.user_a.id, ai_mode="app_bedrock", ai_daily_token_limit=1)
    )
    harness.session.commit()

    response = harness.client.post("/api/semantic-search/index")

    assert response.status_code == 429
    assert "token limit" in response.json()["detail"]
    assert harness.titan.calls == []


def test_app_funded_daily_allowance_blocks_indexing(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(embedding_settings, "embedding_daily_token_limit", 5)

    response = harness.client.post("/api/semantic-search/index")
    status = harness.client.get("/api/semantic-search/status").json()

    assert response.status_code == 429
    assert "allowance is used up" in response.json()["detail"]
    assert status["daily_token_limit"] == 5
    assert harness.titan.calls == []


def test_byok_openai_gets_no_shared_fallback(harness: Harness) -> None:
    harness.session.add(
        UserAISettings(user_id=harness.user_a.id, ai_mode="byok", ai_provider="openai")
    )
    harness.session.commit()

    status = harness.client.get("/api/semantic-search/status").json()

    assert (status["available"], status["reason"]) == (False, "provider_not_bedrock")
    assert harness.client.post("/api/semantic-search/index").status_code == 400
    assert harness.titan.calls == []


def test_server_without_bedrock_is_reported(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    def not_configured() -> None:
        raise HTTPException(status_code=503, detail="not configured")

    monkeypatch.setattr(access, "_check_server_credential_path", not_configured)

    status = harness.client.get("/api/semantic-search/status").json()

    assert (status["available"], status["reason"]) == (False, "server_not_configured")
    assert "LEDGER_SYNC_BEDROCK_API_KEY" in status["message"]
    assert harness.client.post("/api/semantic-search/index").status_code == 503


def test_failed_vector_store_keeps_the_settlement(
    harness: Harness, monkeypatch: pytest.MonkeyPatch
) -> None:
    def refuse(*_args: Any, **_kwargs: Any) -> int:
        raise IntegrityError("INSERT", {}, Exception("foreign key"))

    monkeypatch.setattr(service, "store_embeddings", refuse)

    body = harness.client.post("/api/semantic-search/index").json()

    usage = harness.session.scalars(select(AIUsageLog)).all()
    assert (body["embedded"], body["done"]) == (0, False)
    assert body["error"]
    assert [(entry.status, entry.reserved_tokens) for entry in usage] == [("completed", 0)]
    assert usage[0].input_tokens > 0
    assert harness.session.scalar(select(func.count()).select_from(TransactionEmbedding)) == 0


def test_delete_removes_every_vector_and_opts_out_again(harness: Harness) -> None:
    _index_everything(harness)

    deleted = harness.client.delete("/api/semantic-search/index").json()
    calls = len(harness.titan.calls)
    after = _search(harness, q="coffee")

    assert deleted["deleted"] == 9
    assert harness.session.scalar(select(func.count()).select_from(TransactionEmbedding)) == 0
    assert (after["indexed"], after["results"]) == (0, [])
    assert len(harness.titan.calls) == calls


def _unit(*values: float) -> np.ndarray:
    vector = np.zeros(EMBEDDING_DIMENSIONS, dtype=np.float32)
    vector[: len(values)] = values
    return vector / np.linalg.norm(vector)


def test_postgres_ranks_with_the_cosine_distance_operator() -> None:
    url = os.environ.get("LEDGER_SYNC_TEST_POSTGRES_URL")
    if not url:
        pytest.skip("Set LEDGER_SYNC_TEST_POSTGRES_URL for disposable PostgreSQL verification")
    parsed = sa.make_url(url)
    if parsed.host not in {"localhost", "127.0.0.1", "::1"} or not (
        parsed.database or ""
    ).startswith("ledger_sync_test"):
        pytest.fail("Semantic search tests require a local ledger_sync_test* database")
    if parsed.drivername in {"postgresql", "postgresql+psycopg2"}:
        parsed = parsed.set(drivername="postgresql+psycopg")
    engine = sa.create_engine(parsed)
    schema = f"ledger_sync_semantic_{uuid4().hex}"
    with engine.begin() as connection:
        connection.execute(sa.schema.CreateSchema(schema))
    try:
        with engine.connect() as connection:
            quoted = connection.dialect.identifier_preparer.quote_schema(schema)
            connection.exec_driver_sql(f"SET search_path TO {quoted}")
            connection.commit()
            # Creates the pgvector extension in this schema, then the vector column.
            Base.metadata.create_all(connection)
            connection.commit()
            with Session(bind=connection) as session:
                owner = User(email="pg-a@example.test", hashed_password="", is_active=True)
                other = User(email="pg-b@example.test", hashed_password="", is_active=True)
                session.add_all([owner, other])
                session.flush()
                notes = {"exact": (1, 0), "near": (1, 0.2), "far": (0, 1)}
                stored = []
                for index, (name, direction) in enumerate(notes.items()):
                    row = (name, "Food", "Cafe", "Card", TransactionType.EXPENSE, 10)
                    session.add(_transaction(owner, name, row, index + 1))
                    stored.append((PendingRow(name, name, text_hash(name)), _unit(*direction)))
                # Another user's perfect match: the user_id filter must keep it out.
                row = ("exact", "Food", "Cafe", "Card", TransactionType.EXPENSE, 10)
                session.add(_transaction(other, "intruder", row, 4))
                session.flush()
                assert store_embeddings(session, owner.id, stored) == 3
                intruder = (PendingRow("intruder", "exact", text_hash("exact")), _unit(1, 0))
                assert store_embeddings(session, other.id, [intruder]) == 1
                session.commit()

                candidates = session.query(Transaction).filter(*ledger_criteria(owner.id, set()))
                ranked = nearest(candidates, _unit(1, 0), limit=5)

                assert [tx.transaction_id for tx, _ in ranked] == ["exact", "near", "far"]
                expected = [1.0, 1 / np.sqrt(1.04), 0.0]
                assert [score for _, score in ranked] == pytest.approx(expected, abs=1e-4)
    finally:
        with engine.begin() as connection:
            connection.exec_driver_sql("SET search_path TO public")
            connection.execute(sa.schema.DropSchema(schema, cascade=True))
        engine.dispose()
