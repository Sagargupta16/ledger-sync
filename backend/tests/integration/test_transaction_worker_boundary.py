"""Synchronous transaction SQL must execute outside the request event loop."""

import asyncio

import pytest
from sqlalchemy import event


@pytest.mark.parametrize(
    "operation", ["list", "all", "facets", "search", "export", "create", "tags"]
)
def test_transaction_sql_runs_in_worker_threads(two_user_client, operation):
    client, session, _, _, _ = two_user_client
    body = {
        "date": "2026-01-03T00:00:00",
        "amount": 10.25,
        "type": "Expense",
        "category": "Food",
        "account": "Cash",
    }
    created = client.post("/api/transactions", json=body)
    assert created.status_code == 201, created.text
    on_event_loop = []

    def record(*_args):
        try:
            asyncio.get_running_loop()
        except RuntimeError:
            on_event_loop.append(False)
        else:
            on_event_loop.append(True)

    event.listen(session.bind, "before_cursor_execute", record)
    try:
        if operation == "create":
            response = client.post("/api/transactions", json={**body, "note": "second"})
        elif operation == "tags":
            response = client.put(
                f"/api/transactions/{created.json()['id']}/tags", json={"tags": ["reviewed"]}
            )
        else:
            suffix = "" if operation == "list" else f"/{operation}"
            response = client.get(f"/api/transactions{suffix}")
    finally:
        event.remove(session.bind, "before_cursor_execute", record)
    assert response.status_code in (200, 201), response.text
    assert on_event_loop, "The endpoint did not execute SQL"
    assert not any(on_event_loop), "Synchronous SQL ran on the ASGI event loop"
