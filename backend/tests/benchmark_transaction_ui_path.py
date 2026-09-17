"""Measure the HTTP search path exercised by TransactionsPage's numbered controls.

Run from backend: .venv/Scripts/python.exe tests/benchmark_transaction_ui_path.py
Only generated data in an isolated in-memory SQLite database. Requests run the
real FastAPI route, filter construction, user/preferences loads, tags, exact
counts, serialization, compression and worker dispatch. Authentication supplies
a synthetic owner (no JWT validation); network and browser rendering are absent.
The cursor is obtained from the preceding HTTP page before timing Next, as in
the UI. Both timed requests return identical rows, full totals, and count SQL.
"""

import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Annotated

from benchmark_transaction_pagination import REPEATS, ROWS_PER_USER, _measure_comparison
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, insert
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from ledger_sync.api.deps import get_current_user
from ledger_sync.api.main import app
from ledger_sync.db.base import Base
from ledger_sync.db.models import Transaction, TransactionType, User, UserPreferences
from ledger_sync.db.session import get_session


def benchmark() -> dict:
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        owners = [User(email=f"synthetic-{i}@example.test", hashed_password="") for i in range(2)]
        session.add_all(owners)
        session.flush()
        user_id = owners[0].id
        for owner in owners:
            session.add(UserPreferences(user_id=owner.id, essential_categories="[]"))
            session.execute(
                insert(Transaction),
                [
                    {
                        "transaction_id": f"{owner.id:04x}{index:060x}",
                        "user_id": owner.id,
                        "date": datetime(2020, 1, 1, tzinfo=UTC) + timedelta(days=index // 50),
                        "amount": Decimal(index % 10000) / 100,
                        "type": TransactionType.EXPENSE,
                        "account": "Cash",
                        "category": "Food",
                        "note": "routine purchase",
                        "source_file": "synthetic.csv",
                        "is_deleted": False,
                    }
                    for index in range(ROWS_PER_USER)
                ],
            )
        session.commit()

    def database():
        with Session(engine) as db:
            yield db

    def owner(db: Annotated[Session, Depends(get_session)]):
        return db.get(User, user_id)

    original_overrides = app.dependency_overrides.copy()
    app.dependency_overrides[get_session] = database
    app.dependency_overrides[get_current_user] = owner
    # Match the HTTP test fixtures: avoid application startup/bootstrap entirely.
    client = TestClient(app)
    try:
        with Session(engine) as session:
            cases = {}
            for name, limit, offset, query in [
                ("default_size_first_next", 10, 10, None),
                ("default_size_deep_next", 10, 40_010, None),
                ("default_size_substring_deep_next", 10, 40_010, "purchase"),
                ("large_size_deep_next", 100, 40_100, None),
            ]:
                params = {"sort_by": "date", "sort_order": "desc", "limit": limit}
                if query is not None:
                    params["query"] = query

                def request(request_params):
                    response = client.get("/api/transactions/search", params=request_params)
                    assert response.status_code == 200, response.text
                    return response.json()

                previous = request({**params, "offset": offset - limit})
                token = previous["next_cursor"]
                assert token

                def offset_request(values=params, start=offset):
                    return request({**values, "offset": start})

                def cursor_request(values=params, cursor=token):
                    return request({**values, "cursor": cursor})

                baseline = offset_request()
                continuation = cursor_request()
                assert baseline == continuation
                measurements = _measure_comparison(
                    session, {"offset_next": offset_request, "cursor_next": cursor_request}
                )
                cases[name] = {
                    "limit": limit,
                    "offset": offset,
                    "full_total": baseline["total"],
                    "response_and_count_scope_identical": True,
                    **measurements,
                }
            return {
                "database": "SQLite in memory",
                "rows": ROWS_PER_USER * 2,
                "repeats": REPEATS,
                "included": (
                    "HTTP route, SQL, filters, owner/preferences, tags, response serialization"
                ),
                "excluded": (
                    "JWT validation, network, browser rendering, preceding-page acquisition"
                ),
                "cases": cases,
            }
    finally:
        client.close()
        app.dependency_overrides.clear()
        app.dependency_overrides.update(original_overrides)
        engine.dispose()


if __name__ == "__main__":
    import sys

    sys.stdout.write(json.dumps(benchmark(), indent=2) + "\n")
