"""Request/lifespan boundaries, with synthetic data and no upstream traffic."""

import asyncio
import threading
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from ledger_sync.api import main
from ledger_sync.api.deps import get_current_user
from ledger_sync.api.saved_views import router as saved_views_router
from ledger_sync.db.session import get_session


@pytest.mark.parametrize("path", ["/normal", "/failure"])
@pytest.mark.parametrize("origin", ["http://localhost:5173", "https://untrusted.test", None])
@pytest.mark.parametrize("wildcard", [False, True])
@pytest.mark.parametrize("cookie", [False, True])
def test_cors_on_normal_and_unhandled_responses(monkeypatch, path, origin, wildcard, cookie):
    if wildcard:
        monkeypatch.setattr(main, "_cors_origins", ["*"])
    application = FastAPI()
    application.add_middleware(CORSMiddleware, allow_origins=main._cors_origins)
    application.add_exception_handler(Exception, main.generic_error_handler)

    @application.get("/normal")
    async def normal():
        return {"ok": True}

    @application.get("/failure")
    async def failure():
        raise RuntimeError("synthetic failure")

    async def check():
        transport = httpx.ASGITransport(app=application, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            headers = {"Origin": origin} if origin else {}
            if cookie:
                headers["Cookie"] = "synthetic=1"
            response = await client.get(path, headers=headers)
        assert response.status_code == (500 if path == "/failure" else 200)
        if origin and wildcard:
            assert response.headers["access-control-allow-origin"] == "*"
            assert "vary" not in response.headers
        elif origin == "http://localhost:5173":
            assert response.headers["access-control-allow-origin"] == origin
            assert "Origin" in response.headers["vary"]
        else:
            assert "access-control-allow-origin" not in response.headers
        assert "access-control-allow-credentials" not in response.headers
        if path == "/failure":
            assert response.json()["error_id"]

    asyncio.run(check())


def test_preflight_and_fastapi_interface():
    assert isinstance(main.app, FastAPI)
    assert isinstance(main.app.dependency_overrides, dict)

    async def check():
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=main.app), base_url="http://test"
        ) as client:
            response = await client.options(
                "/api/saved-views",
                headers={
                    "Origin": "http://localhost:5173",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "Authorization, Content-Type",
                },
            )
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
        assert "POST" in response.headers["access-control-allow-methods"]

    asyncio.run(check())


def test_saved_view_database_work_runs_off_event_loop():
    threads = []
    db = MagicMock()

    def execute(_statement):
        threads.append(threading.get_ident())
        return SimpleNamespace(scalars=lambda: SimpleNamespace(all=list))

    db.execute.side_effect = execute
    application = FastAPI()
    application.include_router(saved_views_router)
    application.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1)
    application.dependency_overrides[get_session] = lambda: db

    async def check():
        loop_thread = threading.get_ident()
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=application), base_url="http://test"
        ) as client:
            response = await client.get("/api/saved-views")
        assert response.status_code == 200
        assert threads and all(thread != loop_thread for thread in threads)

    asyncio.run(check())


def test_default_startup_does_not_discover_or_create_schema(monkeypatch):
    monkeypatch.setattr(main.settings, "db_bootstrap_on_startup", False)
    bootstrap = MagicMock()
    monkeypatch.setattr(main, "init_db", bootstrap)
    client = SimpleNamespace(aclose=AsyncMock())
    manager = MagicMock()
    manager.__aenter__ = AsyncMock(return_value=client)
    manager.__aexit__ = AsyncMock()
    manager.aclose = AsyncMock()
    monkeypatch.setattr(main.httpx, "AsyncClient", MagicMock(return_value=manager))

    async def check():
        async with main.lifespan(FastAPI()):
            pass
        bootstrap.assert_not_called()

    asyncio.run(check())


@pytest.mark.parametrize("environment", ["development", "staging", "production"])
def test_bootstrap_requires_explicit_development_setting(monkeypatch, environment):
    monkeypatch.setattr(main.settings, "db_bootstrap_on_startup", True)
    monkeypatch.setattr(main.settings, "environment", environment)
    threads = []
    monkeypatch.setattr(main, "init_db", lambda: threads.append(threading.get_ident()))

    async def check():
        loop_thread = threading.get_ident()
        application = FastAPI()
        if environment == "development":
            async with main.lifespan(application):
                assert threads and threads[0] != loop_thread
            assert application.state.http_client.is_closed
        else:
            with pytest.raises(RuntimeError, match="only allowed in development"):
                async with main.lifespan(application):
                    pytest.fail("Hosted startup must not bootstrap the schema")
            assert threads == []
            assert any(
                "db_bootstrap" in issue for issue in main.settings.validate_production_settings()
            )

    asyncio.run(check())


def test_http_client_closes_when_lifespan_body_raises(monkeypatch):
    monkeypatch.setattr(main.settings, "db_bootstrap_on_startup", False)
    application = FastAPI()

    async def check():
        with pytest.raises(RuntimeError, match="synthetic shutdown"):
            async with main.lifespan(application):
                raise RuntimeError("synthetic shutdown")
        assert application.state.http_client.is_closed

    asyncio.run(check())


def test_database_health_query_runs_off_event_loop(monkeypatch):
    threads = []
    engine = MagicMock()
    connection = engine.connect.return_value.__enter__.return_value
    connection.execute.side_effect = lambda _statement: threads.append(threading.get_ident())
    monkeypatch.setattr(main, "get_engine", lambda: engine)
    application = FastAPI()
    application.get("/db", response_model=None)(main.health_db)

    async def check():
        loop_thread = threading.get_ident()
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=application), base_url="http://test"
        ) as client:
            response = await client.get("/db")
        assert response.status_code == 200
        assert threads and threads[0] != loop_thread

    asyncio.run(check())


def test_upload_serialization_and_failure_cleanup_share_a_worker(monkeypatch):
    from ledger_sync.api.rate_limit import limiter
    from ledger_sync.api.upload import router
    from ledger_sync.core.analytics import AnalyticsEngine
    from ledger_sync.core.sync_engine import SyncEngine
    from ledger_sync.schemas.upload import TransactionRow

    threads = []
    original_dump = TransactionRow.model_dump

    def dump(row, *args, **kwargs):
        threads.append(("serialize", threading.get_ident()))
        return original_dump(row, *args, **kwargs)

    def import_rows(_engine, **kwargs):
        threads.append(("import", threading.get_ident()))
        return SimpleNamespace(processed=1, inserted=1, updated=0, deleted=0, skipped=0)

    def refresh(_engine, **kwargs):
        threads.append(("refresh", threading.get_ident()))
        raise RuntimeError("synthetic failure")

    db = MagicMock()
    db.rollback.side_effect = lambda: threads.append(("rollback", threading.get_ident()))
    monkeypatch.setattr(limiter, "enabled", False)
    monkeypatch.setattr(TransactionRow, "model_dump", dump)
    monkeypatch.setattr(SyncEngine, "import_rows", import_rows)
    monkeypatch.setattr(AnalyticsEngine, "__init__", lambda *args, **kwargs: None)
    monkeypatch.setattr(AnalyticsEngine, "refresh_analytics", refresh)
    application = FastAPI()
    application.include_router(router)
    application.dependency_overrides[get_current_user] = lambda: SimpleNamespace(id=1)
    application.dependency_overrides[get_session] = lambda: db

    async def check():
        loop_thread = threading.get_ident()
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=application), base_url="http://test"
        ) as client:
            response = await client.post(
                "/api/upload",
                json={
                    "file_name": "synthetic.csv",
                    "file_hash": "a" * 64,
                    "rows": [
                        {
                            "date": "2026-01-01",
                            "amount": 1,
                            "type": "Income",
                            "account": "Synthetic",
                            "category": "Synthetic",
                        }
                    ],
                },
            )
        assert response.status_code == 200
        assert response.json()["analytics_status"] == "failed"
        assert [phase for phase, _ in threads] == ["serialize", "import", "refresh", "rollback"]
        assert all(thread != loop_thread for _, thread in threads)
        assert len({thread for _, thread in threads}) == 1

    asyncio.run(check())
