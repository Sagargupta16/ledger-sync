"""Database-only routes keep queries, locks and transaction cleanup off the event loop."""

import asyncio
import threading

import httpx
import pytest
from sqlalchemy import event

from ledger_sync.db.models import AccountType, CategorizationRule
from ledger_sync.services.account_settings import set_account_type


@pytest.mark.parametrize(
    ("method", "path", "options", "status"),
    [
        ("GET", "/api/account-classifications", {}, 200),
        ("GET", "/api/account-classifications/closed", {}, 200),
        (
            "PUT",
            "/api/account-classifications/status",
            {"json": {"account_name": "Synthetic", "is_closed": True}},
            200,
        ),
        ("GET", "/api/account-classifications/Synthetic", {}, 200),
        (
            "POST",
            "/api/account-classifications",
            {"params": {"account_name": "Synthetic", "account_type": "Cash"}},
            200,
        ),
        ("DELETE", "/api/account-classifications/Synthetic", {}, 200),
        ("GET", "/api/account-classifications/type/Cash", {}, 200),
        ("GET", "/api/categorization-rules", {}, 200),
        (
            "POST",
            "/api/categorization-rules",
            {"json": {"pattern": "Synthetic", "category": "Synthetic"}},
            201,
        ),
        (
            "PUT",
            "/api/categorization-rules/{rule_id}",
            {"json": {"pattern": "Synthetic", "category": "Updated"}},
            200,
        ),
        ("DELETE", "/api/categorization-rules/{rule_id}", {}, 204),
        ("POST", "/api/categorization-rules/apply", {}, 200),
    ],
)
def test_database_only_routes_use_worker_threads(two_user_client, method, path, options, status):
    client, session, user, _, _ = two_user_client
    set_account_type(session, user.id, "Synthetic", AccountType.CASH)
    rule = CategorizationRule(
        user_id=user.id,
        match_field="note",
        pattern="Synthetic",
        category="Synthetic",
    )
    session.add(rule)
    session.commit()
    path = path.format(rule_id=rule.id)
    phases = []

    def on_statement(*_args):
        phases.append(("query", threading.get_ident()))

    def on_commit(*_args):
        phases.append(("commit", threading.get_ident()))

    def on_rollback(*_args):
        phases.append(("rollback", threading.get_ident()))

    async def check():
        loop_thread = threading.get_ident()
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=client.app), base_url="http://test"
        ) as http:
            response = await http.request(method, path, **options)
        assert response.status_code == status
        assert phases
        assert all(thread != loop_thread for _, thread in phases), phases

    event.listen(session.bind, "before_cursor_execute", on_statement)
    event.listen(session, "after_commit", on_commit)
    event.listen(session, "after_soft_rollback", on_rollback)
    try:
        asyncio.run(check())
    finally:
        event.remove(session.bind, "before_cursor_execute", on_statement)
        event.remove(session, "after_commit", on_commit)
        event.remove(session, "after_soft_rollback", on_rollback)
