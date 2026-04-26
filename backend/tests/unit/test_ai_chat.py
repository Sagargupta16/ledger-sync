"""Unit tests for the Bedrock chat proxy.

We test the HTTP contract (status codes, auth gating, error surfacing) with
boto3 mocked, so these can run in CI without AWS credentials. For a real
end-to-end check against Bedrock, run the tiny script at:

    python scripts/bedrock_smoke_test.py

(which exists outside the test suite because it requires a live token).
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from ledger_sync.api.ai_chat import router as ai_router
from ledger_sync.api.deps import get_current_user
from ledger_sync.db.base import Base
from ledger_sync.db.models import User, UserPreferences
from ledger_sync.db.session import get_session

TEST_BCRYPT_HASH = "$2b$12$dummy_hash_for_testing_purposes"  # noqa: S105


def _make_app() -> tuple[FastAPI, Session, User]:
    """FastAPI app + in-memory DB + authed user, with deps overridden.

    `TestClient` runs requests on a worker thread via httpx, and sqlite3
    refuses cross-thread use by default -- so we disable that check and
    use StaticPool so every connect() returns the same in-memory DB.
    """
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

    app = FastAPI()
    app.include_router(ai_router)
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = lambda: session
    return app, session, user


def _make_prefs(
    session: Session,
    user: User,
    *,
    provider: str = "bedrock",
    model: str = "us.anthropic.claude-opus-4-7",
    region: str = "us-east-1",
) -> None:
    prefs = UserPreferences(
        user_id=user.id,
        ai_provider=provider,
        ai_model=f"{model}|{region}" if region else model,
    )
    session.add(prefs)
    session.commit()


def test_no_preferences_returns_400(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", "fake-token")
    app, _session, _user = _make_app()
    client = TestClient(app)

    resp = client.post(
        "/api/ai/bedrock/chat",
        json={"messages": [{"role": "user", "content": "hi"}]},
    )
    assert resp.status_code == 400
    assert "preferences" in resp.json()["detail"].lower()


def test_non_bedrock_provider_returns_400(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", "fake-token")
    app, session, user = _make_app()
    _make_prefs(session, user, provider="openai")
    client = TestClient(app)

    resp = client.post(
        "/api/ai/bedrock/chat",
        json={"messages": [{"role": "user", "content": "hi"}]},
    )
    assert resp.status_code == 400
    assert "bedrock" in resp.json()["detail"].lower()


def test_missing_aws_auth_returns_503_with_helpful_message(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Before the fix, this path threw a generic 'invalid model identifier'
    error through boto3. Now we pre-flight and give a clear 503."""
    monkeypatch.delenv("AWS_BEARER_TOKEN_BEDROCK", raising=False)
    monkeypatch.delenv("AWS_ACCESS_KEY_ID", raising=False)
    monkeypatch.delenv("AWS_PROFILE", raising=False)
    app, session, user = _make_app()
    _make_prefs(session, user)
    client = TestClient(app)

    resp = client.post(
        "/api/ai/bedrock/chat",
        json={"messages": [{"role": "user", "content": "hi"}]},
    )
    assert resp.status_code == 503
    detail = resp.json()["detail"]
    assert "LEDGER_SYNC_BEDROCK_API_KEY" in detail


def test_successful_converse_returns_content(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", "fake-token")
    app, session, user = _make_app()
    _make_prefs(session, user)
    client = TestClient(app)

    fake_bedrock_response: dict[str, Any] = {"output": {"message": {"content": [{"text": "OK"}]}}}
    mock_boto_client = MagicMock()
    mock_boto_client.converse.return_value = fake_bedrock_response

    with patch("boto3.client", return_value=mock_boto_client):
        resp = client.post(
            "/api/ai/bedrock/chat",
            json={"messages": [{"role": "user", "content": "hi"}]},
        )

    assert resp.status_code == 200
    body = resp.json()
    assert body["blocks"] == [{"type": "text", "text": "OK"}]

    # Verify we passed the model ID through correctly
    call_kwargs = mock_boto_client.converse.call_args.kwargs
    assert call_kwargs["modelId"] == "us.anthropic.claude-opus-4-7"


def test_boto3_exception_surfaces_as_502(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", "fake-token")
    app, session, user = _make_app()
    _make_prefs(session, user)
    client = TestClient(app)

    mock_boto_client = MagicMock()
    mock_boto_client.converse.side_effect = RuntimeError("ValidationException: bad model")

    with patch("boto3.client", return_value=mock_boto_client):
        resp = client.post(
            "/api/ai/bedrock/chat",
            json={"messages": [{"role": "user", "content": "hi"}]},
        )

    assert resp.status_code == 502
    assert "ValidationException" in resp.json()["detail"]


def test_tools_passed_as_tool_config(monkeypatch: pytest.MonkeyPatch) -> None:
    """When the request includes `tools`, Bedrock must receive `toolConfig`."""
    monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", "fake-token")
    app, session, user = _make_app()
    _make_prefs(session, user)
    client = TestClient(app)

    fake = {"output": {"message": {"content": [{"text": "ack"}]}}}
    mock_boto = MagicMock()
    mock_boto.converse.return_value = fake

    tools = [
        {
            "name": "list_accounts",
            "description": "List accounts",
            "parameters": {"type": "object", "properties": {}},
        }
    ]

    with patch("boto3.client", return_value=mock_boto):
        resp = client.post(
            "/api/ai/bedrock/chat",
            json={"messages": [{"role": "user", "content": "hi"}], "tools": tools},
        )

    assert resp.status_code == 200
    call = mock_boto.converse.call_args.kwargs
    assert "toolConfig" in call
    spec_list = call["toolConfig"]["tools"]
    assert spec_list[0]["toolSpec"]["name"] == "list_accounts"
    assert spec_list[0]["toolSpec"]["inputSchema"]["json"]["type"] == "object"


def test_tool_use_and_tool_result_round_trip(monkeypatch: pytest.MonkeyPatch) -> None:
    """Bedrock's tool_use response is returned intact; tool_result messages
    on the way back are converted to the expected Bedrock shape."""
    monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", "fake-token")
    app, session, user = _make_app()
    _make_prefs(session, user)
    client = TestClient(app)

    fake = {
        "output": {
            "message": {
                "content": [
                    {
                        "toolUse": {
                            "toolUseId": "tu_1",
                            "name": "list_accounts",
                            "input": {},
                        }
                    }
                ]
            }
        },
        "stopReason": "tool_use",
    }
    mock_boto = MagicMock()
    mock_boto.converse.return_value = fake

    messages = [
        {"role": "user", "content": "how many accounts"},
        {
            "role": "assistant",
            "blocks": [
                {
                    "type": "tool_use",
                    "tool_use_id": "tu_0",
                    "name": "list_accounts",
                    "input": {},
                }
            ],
        },
        {
            "role": "user",
            "blocks": [
                {
                    "type": "tool_result",
                    "tool_use_id": "tu_0",
                    "content": [{"json": {"accounts": [], "count": 0}}],
                }
            ],
        },
    ]

    with patch("boto3.client", return_value=mock_boto):
        resp = client.post("/api/ai/bedrock/chat", json={"messages": messages})

    assert resp.status_code == 200
    body = resp.json()
    assert body["stop_reason"] == "tool_use"
    assert body["blocks"][0]["type"] == "tool_use"
    assert body["blocks"][0]["name"] == "list_accounts"

    # Verify tool_result was forwarded to Bedrock in the expected shape
    call = mock_boto.converse.call_args.kwargs
    third_msg = call["messages"][2]["content"][0]
    assert "toolResult" in third_msg
    assert third_msg["toolResult"]["toolUseId"] == "tu_0"
