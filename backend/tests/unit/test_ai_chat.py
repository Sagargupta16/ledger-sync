"""Unit tests for the Bedrock chat proxy.

We test the HTTP contract (status codes, auth gating, error surfacing) with
boto3 mocked, so these can run in CI without AWS credentials. For a real
end-to-end check against Bedrock, run the tiny script at:

    python scripts/bedrock_smoke_test.py

(which exists outside the test suite because it requires a live token).
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
from botocore.exceptions import ClientError, InvalidRegionError, ReadTimeoutError
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from ledger_sync.api.ai_chat import router as ai_router
from ledger_sync.api.ai_usage import count_app_messages_today
from ledger_sync.api.deps import get_current_user
from ledger_sync.api.preferences_ai import get_ai_key, rewrap_stored_ai_key
from ledger_sync.api.preferences_ai import router as ai_preferences_router
from ledger_sync.api.rate_limit import limiter
from ledger_sync.config.settings import settings
from ledger_sync.core.encryption import decrypt_api_key, encrypt_api_key
from ledger_sync.db.base import Base
from ledger_sync.db.models import AIUsageLog, User, UserPreferences
from ledger_sync.db.session import get_session

TEST_BCRYPT_HASH = "$2b$12$dummy_hash_for_testing_purposes"


def _make_app() -> tuple[FastAPI, Session, User]:
    """FastAPI app + in-memory DB + authed user, with deps overridden.

    `TestClient` runs requests on a worker thread via httpx, and sqlite3
    refuses cross-thread use by default -- so we disable that check and
    use StaticPool so every connect() returns the same in-memory DB.
    """
    limiter.reset()
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
    app.include_router(ai_preferences_router, prefix="/api/preferences")
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_session] = lambda: session
    return app, session, user


def _make_prefs(
    session: Session,
    user: User,
    *,
    mode: str | None = None,
    provider: str = "bedrock",
    model: str = "us.anthropic.claude-opus-4-7",
    region: str = "us-east-1",
    api_key: str | None = None,
) -> None:
    prefs = UserPreferences(
        user_id=user.id,
        ai_mode=mode or ("byok" if api_key else "app_bedrock"),
        ai_provider=provider,
        ai_model=f"{model}|{region}" if region else model,
        ai_api_key_encrypted=encrypt_api_key(api_key) if api_key else None,
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
    _make_prefs(session, user, provider="openai", mode="byok")
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
    _make_prefs(session, user, api_key="synthetic-personal-bearer")
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


@pytest.mark.parametrize(
    "failure",
    [
        RuntimeError("ValidationException: bad model"),
        ReadTimeoutError(endpoint_url="https://bedrock-runtime.us-east-1.amazonaws.com"),
    ],
    ids=["unexpected-error", "read-timeout"],
)
def test_inference_failure_retains_reservation(
    monkeypatch: pytest.MonkeyPatch, failure: Exception
) -> None:
    monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", "fake-token")
    monkeypatch.setattr(settings, "ai_daily_message_limit", 1)
    app, session, user = _make_app()
    _make_prefs(session, user)
    client = TestClient(app)

    mock_boto_client = MagicMock()
    mock_boto_client.converse.side_effect = failure
    body = {"messages": [{"role": "user", "content": "hi"}]}

    with patch("boto3.client", return_value=mock_boto_client):
        resp = client.post("/api/ai/bedrock/chat", json=body)
        retry = client.post("/api/ai/bedrock/chat", json=body)

    assert resp.status_code == 502
    assert "Usage remains reserved" in resp.json()["detail"]
    assert "ValidationException" not in resp.json()["detail"]
    assert retry.status_code == 429
    mock_boto_client.converse.assert_called_once()
    usage = session.query(AIUsageLog).one()
    assert usage.status == "reserved"
    assert usage.reserved_tokens > 0
    assert count_app_messages_today(session, user.id) == 1


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


def test_app_bedrock_mode_uses_default_model_regardless_of_prefs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """In app_bedrock mode the app picks the model -- stored BYOK model is
    ignored so users can't override the cheap default we pay for."""
    monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", "fake-token")
    app, session, user = _make_app()
    # User has an old BYOK row with a premium model, but mode is app_bedrock
    _make_prefs(session, user, mode="app_bedrock", model="us.anthropic.claude-opus-4-7")
    client = TestClient(app)

    fake = {"output": {"message": {"content": [{"text": "OK"}]}}}
    mock_boto = MagicMock()
    mock_boto.converse.return_value = fake

    with patch("boto3.client", return_value=mock_boto):
        resp = client.post(
            "/api/ai/bedrock/chat",
            json={"messages": [{"role": "user", "content": "hi"}]},
        )

    assert resp.status_code == 200
    call = mock_boto.converse.call_args.kwargs
    # Picked up from settings.ai_default_bedrock_model (Haiku default) --
    # NOT the Opus model stored in prefs.
    assert "haiku" in call["modelId"].lower()


def test_app_bedrock_mode_enforces_daily_message_limit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Once a user hits the configured app-wide daily message cap, further
    calls return 429 without spending another AWS invoke."""
    monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", "fake-token")
    # Lower the cap to 2 for a quick test
    from ledger_sync.config.settings import settings

    monkeypatch.setattr(settings, "ai_daily_message_limit", 2)

    app, session, user = _make_app()
    _make_prefs(session, user, mode="app_bedrock")
    client = TestClient(app)

    fake = {"output": {"message": {"content": [{"text": "OK"}]}}}
    mock_boto = MagicMock()
    mock_boto.converse.return_value = fake

    with patch("boto3.client", return_value=mock_boto):
        # First two calls succeed
        for _ in range(2):
            r = client.post(
                "/api/ai/bedrock/chat",
                json={"messages": [{"role": "user", "content": "hi"}]},
            )
            assert r.status_code == 200

        # Third call is rejected
        r = client.post(
            "/api/ai/bedrock/chat",
            json={"messages": [{"role": "user", "content": "hi"}]},
        )
        assert r.status_code == 429
        assert "2/2" in r.json()["detail"] or "limit" in r.json()["detail"].lower()

    # boto3 was only called twice -- the cap blocked the third call before
    # hitting AWS.
    assert mock_boto.converse.call_count == 2


@pytest.mark.parametrize("stored_value", [None, "bedrock-uses-aws-credentials"])
def test_byok_without_personal_key_cannot_spend_shared_funding(
    monkeypatch: pytest.MonkeyPatch, stored_value: str | None
) -> None:
    """Missing keys and old placeholders require an explicit switch to app mode."""
    monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", "fake-token")
    from ledger_sync.config.settings import settings

    monkeypatch.setattr(settings, "ai_daily_message_limit", 2)

    app, session, user = _make_app()
    _make_prefs(session, user, mode="byok", api_key=stored_value)
    client = TestClient(app)

    fake = {"output": {"message": {"content": [{"text": "OK"}]}}}
    mock_boto = MagicMock()
    mock_boto.converse.return_value = fake

    with patch("boto3.client", return_value=mock_boto):
        r = client.post(
            "/api/ai/bedrock/chat",
            json={"messages": [{"role": "user", "content": "hi"}]},
        )
        assert r.status_code == 400

    mock_boto.converse.assert_not_called()
    assert "App Bedrock mode" in r.json()["detail"]
    assert session.query(AIUsageLog).count() == 0


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


@pytest.mark.parametrize(
    "payload",
    [
        {"messages": [{"role": "system", "content": "hello"}]},
        {"messages": [{"role": "user", "content": "x" * 65_537}]},
        {"messages": [{"role": "user", "content": ""}]},
        {"messages": [{"role": "user", "content": "hello"}] * 101},
        {"messages": [{"role": "user", "content": "x" * 65_536}] * 4},
        {"messages": [{"role": "user", "content": "hello", "blocks": []}]},
        {"messages": [{"role": "user", "blocks": [{"type": "other"}]}]},
        {
            "messages": [
                {
                    "role": "user",
                    "blocks": [{"type": "tool_result", "tool_use_id": "x", "content": []}],
                }
            ]
        },
        {
            "messages": [
                {
                    "role": "assistant",
                    "blocks": [{"type": "tool_use", "tool_use_id": "x", "name": "a"}],
                }
            ]
        },
        {"messages": [{"role": "user", "content": "hello"}], "max_tokens": True},
    ],
)
def test_invalid_chat_payload_never_invokes_provider(payload: dict) -> None:
    app, session, user = _make_app()
    _make_prefs(session, user, api_key="synthetic-personal-bearer")

    with patch("boto3.client") as provider:
        response = TestClient(app).post("/api/ai/bedrock/chat", json=payload)

    assert response.status_code == 422
    provider.assert_not_called()
    assert session.query(AIUsageLog).count() == 0


def test_personal_bearer_is_used_and_does_not_exhaust_shared_cap(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", "synthetic-shared-bearer")
    monkeypatch.setattr(settings, "ai_daily_message_limit", 1)
    app, session, user = _make_app()
    _make_prefs(session, user, api_key="synthetic-personal-bearer")
    mock_boto = MagicMock()
    mock_boto.converse.return_value = {
        "output": {"message": {"content": [{"text": "OK"}]}},
        "usage": {"inputTokens": 20, "outputTokens": 10},
    }
    client = TestClient(app)
    body = {"messages": [{"role": "user", "content": "hello"}]}

    with patch("boto3.client", return_value=mock_boto):
        assert client.post("/api/ai/bedrock/chat", json=body).status_code == 200
        assert client.post("/api/ai/bedrock/chat", json=body).status_code == 200
        assert count_app_messages_today(session, user.id) == 0
        callback = mock_boto.meta.events.register.call_args.args[1]
        request = SimpleNamespace(headers={})
        callback(request)
        assert request.headers["Authorization"] == "Bearer synthetic-personal-bearer"

        prefs = session.query(UserPreferences).one()
        prefs.ai_mode = "app_bedrock"
        session.commit()
        assert client.post("/api/ai/bedrock/chat", json=body).status_code == 200
        assert client.post("/api/ai/bedrock/chat", json=body).status_code == 429

    rows = session.query(AIUsageLog).order_by(AIUsageLog.id).all()
    assert [row.funding_source for row in rows] == ["personal", "personal", "app"]


def test_expected_input_and_output_budget_is_checked_before_provider() -> None:
    app, session, user = _make_app()
    _make_prefs(session, user, api_key="synthetic-personal-bearer")
    prefs = session.query(UserPreferences).one()
    prefs.ai_daily_token_limit = 1_024
    session.commit()

    with patch("boto3.client") as provider:
        response = TestClient(app).post(
            "/api/ai/bedrock/chat",
            json={"messages": [{"role": "user", "content": "hello"}], "max_tokens": 1024},
        )

    assert response.status_code == 429
    provider.assert_not_called()
    assert session.query(AIUsageLog).count() == 0


@pytest.mark.parametrize("code", ["AccessDeniedException", "ModelNotReadyException"])
def test_known_provider_rejection_releases_reservation(
    monkeypatch: pytest.MonkeyPatch, code: str
) -> None:
    monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", "synthetic-shared-bearer")
    monkeypatch.setattr(settings, "ai_daily_message_limit", 1)
    app, session, user = _make_app()
    _make_prefs(session, user, mode="app_bedrock")
    prefs = session.query(UserPreferences).one()
    prefs.ai_daily_token_limit = 3_000
    session.commit()
    mock_boto = MagicMock()
    mock_boto.converse.side_effect = [
        ClientError(
            {"Error": {"Code": code, "Message": "private provider detail"}},
            "Converse",
        ),
        {
            "output": {"message": {"content": [{"text": "OK"}]}},
            "usage": {"inputTokens": 20, "outputTokens": 10},
        },
    ]
    client = TestClient(app)
    body = {"messages": [{"role": "user", "content": "hello"}]}

    with patch("boto3.client", return_value=mock_boto):
        response = client.post("/api/ai/bedrock/chat", json=body)

        assert response.status_code == 502
        assert "private provider detail" not in response.json()["detail"]
        assert count_app_messages_today(session, user.id) == 0
        usage = session.query(AIUsageLog).one()
        assert usage.status == "failed"
        assert usage.reserved_tokens == 0
        assert client.post("/api/ai/bedrock/chat", json=body).status_code == 200

    assert count_app_messages_today(session, user.id) == 1
    assert session.query(AIUsageLog).filter_by(status="completed").count() == 1


@pytest.mark.parametrize(
    ("region", "failure"),
    [
        ("-", InvalidRegionError(region_name="-")),
        ("us-east-1", RuntimeError("private client setup detail")),
        (
            "us-east-1",
            ReadTimeoutError(endpoint_url="https://bedrock-runtime.us-east-1.amazonaws.com"),
        ),
    ],
    ids=["invalid-region", "unexpected-setup-error", "setup-timeout"],
)
def test_client_creation_failure_releases_token_reservation(
    region: str, failure: Exception
) -> None:
    app, session, user = _make_app()
    _make_prefs(session, user, api_key="synthetic-personal-bearer", region=region)
    prefs = session.query(UserPreferences).one()
    prefs.ai_daily_token_limit = 3_000
    session.commit()
    mock_boto = MagicMock()
    mock_boto.converse.return_value = {
        "output": {"message": {"content": [{"text": "OK"}]}},
        "usage": {"inputTokens": 20, "outputTokens": 10},
    }
    client = TestClient(app)
    body = {"messages": [{"role": "user", "content": "hello"}]}

    with patch("boto3.client", side_effect=[failure, mock_boto]) as create_client:
        response = client.post("/api/ai/bedrock/chat", json=body)

        assert response.status_code == 502
        assert "before inference" in response.json()["detail"]
        assert "private client setup detail" not in response.json()["detail"]
        mock_boto.converse.assert_not_called()
        usage = session.query(AIUsageLog).one()
        assert usage.status == "failed"
        assert usage.reserved_tokens == 0

        saved = client.put(
            "/api/preferences/ai-config",
            json={
                "provider": "bedrock",
                "model": "us.anthropic.claude-opus-4-7",
                "region": "us-west-2",
            },
        )
        assert saved.status_code == 200
        assert client.post("/api/ai/bedrock/chat", json=body).status_code == 200

    assert create_client.call_args_list[0].kwargs["region_name"] == region
    assert create_client.call_args_list[1].kwargs["region_name"] == "us-west-2"
    mock_boto.converse.assert_called_once()
    assert session.query(AIUsageLog).filter_by(status="completed").count() == 1


def test_personal_auth_setup_failure_releases_reservation() -> None:
    app, session, user = _make_app()
    _make_prefs(session, user, api_key="synthetic-personal-bearer")
    mock_boto = MagicMock()
    mock_boto.meta.events.register.side_effect = RuntimeError("private auth setup detail")

    with patch("boto3.client", return_value=mock_boto):
        response = TestClient(app).post(
            "/api/ai/bedrock/chat", json={"messages": [{"role": "user", "content": "hello"}]}
        )

    assert response.status_code == 502
    assert "before inference" in response.json()["detail"]
    assert "private auth setup detail" not in response.json()["detail"]
    mock_boto.converse.assert_not_called()
    usage = session.query(AIUsageLog).one()
    assert usage.status == "failed"
    assert usage.reserved_tokens == 0


def test_normal_bedrock_use_rewraps_key_after_dedicated_key_transition(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app, session, user = _make_app()
    monkeypatch.setenv("AWS_BEARER_TOKEN_BEDROCK", "synthetic-shared-bearer")
    monkeypatch.setattr(settings, "encryption_key", "")
    _make_prefs(session, user, api_key="synthetic-personal-bearer")
    monkeypatch.setattr(settings, "encryption_key", "synthetic-new-dedicated-material")
    mock_boto = MagicMock()
    mock_boto.converse.return_value = {"output": {"message": {"content": [{"text": "OK"}]}}}

    with patch("boto3.client", return_value=mock_boto):
        response = TestClient(app).post(
            "/api/ai/bedrock/chat", json={"messages": [{"role": "user", "content": "hello"}]}
        )

    assert response.status_code == 200
    stored = session.query(UserPreferences).one().ai_api_key_encrypted
    monkeypatch.setattr(settings, "jwt_secret_key", "synthetic-rotated-jwt-material")
    assert decrypt_api_key(stored) == ("synthetic-personal-bearer", False)


def test_key_reveal_rewraps_and_sets_no_store(monkeypatch: pytest.MonkeyPatch) -> None:
    from fastapi import Response

    _app, session, user = _make_app()
    monkeypatch.setattr(settings, "encryption_key", "")
    _make_prefs(session, user, api_key="synthetic-personal-bearer")
    monkeypatch.setattr(settings, "encryption_key", "synthetic-new-dedicated-material")
    response = Response()

    result = get_ai_key(user, session, response)

    assert result == {"api_key": "synthetic-personal-bearer"}
    assert "no-store" in response.headers["Cache-Control"]
    stored = session.query(UserPreferences).one().ai_api_key_encrypted
    assert decrypt_api_key(stored) == ("synthetic-personal-bearer", False)


def test_rewrap_does_not_restore_a_concurrently_deleted_key() -> None:
    from sqlalchemy import update

    _app, session, user = _make_app()
    _make_prefs(session, user, api_key="synthetic-personal-bearer")
    prefs = session.query(UserPreferences).one()
    session.execute(
        update(UserPreferences)
        .where(UserPreferences.id == prefs.id)
        .values(ai_api_key_encrypted=None)
        .execution_options(synchronize_session=False)
    )

    rewrap_stored_ai_key(session, prefs, "synthetic-personal-bearer")

    assert session.query(UserPreferences).one().ai_api_key_encrypted is None


@pytest.mark.parametrize("key_field", [{}, {"api_key": None}])
def test_model_only_save_preserves_same_provider_key(key_field: dict) -> None:
    app, session, user = _make_app()
    _make_prefs(session, user, api_key="synthetic-personal-bearer")
    previous = session.query(UserPreferences).one().ai_api_key_encrypted

    response = TestClient(app).put(
        "/api/preferences/ai-config",
        json={
            "provider": "bedrock",
            "model": "synthetic-new-model",
            "region": "us-west-2",
            **key_field,
        },
    )

    assert response.status_code == 200
    assert response.json()["has_key"] is True
    assert response.json()["funding_source"] == "personal"
    prefs = session.query(UserPreferences).one()
    assert prefs.ai_api_key_encrypted == previous
    assert prefs.ai_model == "synthetic-new-model|us-west-2"


@pytest.mark.parametrize("replacement", ["", "   ", "bedrock-uses-aws-credentials"])
def test_blank_or_sentinel_save_cannot_overwrite_stored_key(replacement: str) -> None:
    app, session, user = _make_app()
    _make_prefs(session, user, api_key="synthetic-personal-bearer")
    previous = session.query(UserPreferences).one().ai_api_key_encrypted

    response = TestClient(app).put(
        "/api/preferences/ai-config",
        json={"provider": "bedrock", "model": "synthetic-model", "api_key": replacement},
    )

    assert response.status_code == 422
    assert session.query(UserPreferences).one().ai_api_key_encrypted == previous


def test_provider_switch_without_new_key_preserves_previous_provider_and_key() -> None:
    app, session, user = _make_app()
    _make_prefs(session, user, api_key="synthetic-personal-bearer")
    previous = session.query(UserPreferences).one().ai_api_key_encrypted

    response = TestClient(app).put(
        "/api/preferences/ai-config", json={"provider": "openai", "model": "synthetic-model"}
    )

    assert response.status_code == 400
    prefs = session.query(UserPreferences).one()
    assert prefs.ai_provider == "bedrock"
    assert prefs.ai_api_key_encrypted == previous


def test_stale_model_only_save_does_not_restore_a_concurrently_replaced_key() -> None:
    from sqlalchemy import update

    app, session, user = _make_app()
    _make_prefs(session, user, api_key="synthetic-personal-bearer")
    stale_prefs = session.query(UserPreferences).one()
    replacement = encrypt_api_key("synthetic-replacement-openai-value")
    with Session(session.get_bind()) as writer:
        writer.execute(
            update(UserPreferences)
            .where(UserPreferences.id == stale_prefs.id)
            .values(ai_provider="openai", ai_api_key_encrypted=replacement)
        )
        writer.commit()

    response = TestClient(app).put(
        "/api/preferences/ai-config", json={"provider": "bedrock", "model": "synthetic-model"}
    )

    assert response.status_code == 409
    current = session.query(UserPreferences).one()
    assert current.ai_provider == "openai"
    assert current.ai_api_key_encrypted == replacement


def test_initial_byok_config_requires_key_then_stores_encrypted_replacement() -> None:
    app, session, _user = _make_app()
    client = TestClient(app)
    body = {"provider": "bedrock", "model": "synthetic-model"}

    assert client.put("/api/preferences/ai-config", json=body).status_code == 400
    response = client.put(
        "/api/preferences/ai-config", json={**body, "api_key": "synthetic-personal-bearer"}
    )

    assert response.status_code == 200
    assert response.json()["has_key"] is True
    assert response.json()["funding_source"] == "personal"
    assert "api_key" not in response.json()
    stored = session.query(UserPreferences).one().ai_api_key_encrypted
    assert stored.startswith("ls-byok:v3:")
    assert decrypt_api_key(stored) == ("synthetic-personal-bearer", False)


def test_app_mode_reports_shared_funding_without_deleting_personal_key() -> None:
    app, session, user = _make_app()
    _make_prefs(session, user, api_key="synthetic-personal-bearer")
    previous = session.query(UserPreferences).one().ai_api_key_encrypted
    client = TestClient(app)

    response = client.patch("/api/preferences/ai-config/mode", json={"mode": "app_bedrock"})

    assert response.status_code == 200
    assert response.json()["has_key"] is True
    assert response.json()["funding_source"] == "app"
    assert session.query(UserPreferences).one().ai_api_key_encrypted == previous
    restored = client.patch("/api/preferences/ai-config/mode", json={"mode": "byok"})
    assert restored.json()["funding_source"] == "personal"
    assert session.query(UserPreferences).one().ai_api_key_encrypted == previous


@pytest.mark.parametrize("stored_value", [None, "bedrock-uses-aws-credentials", "corrupt"])
def test_config_does_not_advertise_missing_or_unreadable_keys_as_personal(
    stored_value: str | None,
) -> None:
    app, session, user = _make_app()
    _make_prefs(session, user, mode="byok", api_key=stored_value)
    if stored_value == "corrupt":
        session.query(UserPreferences).one().ai_api_key_encrypted = "invalid-ciphertext"
        session.commit()
    previous = session.query(UserPreferences).one().ai_api_key_encrypted

    response = TestClient(app).get("/api/preferences/ai-config")

    assert response.status_code == 200
    assert response.json()["has_key"] is False
    assert response.json()["funding_source"] is None
    assert session.query(UserPreferences).one().ai_api_key_encrypted == previous


def test_limit_patch_can_set_zero_or_clear_only_the_requested_budget() -> None:
    app, session, user = _make_app()
    _make_prefs(session, user, api_key="synthetic-personal-bearer")
    client = TestClient(app)
    response = client.patch(
        "/api/preferences/ai-config/limits",
        json={"daily_token_limit": 0, "monthly_token_limit": 100},
    )
    assert response.status_code == 200
    assert response.json()["daily_token_limit"] == 0

    cleared = client.patch("/api/preferences/ai-config/limits", json={"daily_token_limit": None})
    assert cleared.status_code == 200
    assert cleared.json()["daily_token_limit"] is None
    assert cleared.json()["monthly_token_limit"] == 100
