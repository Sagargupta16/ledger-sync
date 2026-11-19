"""Tests for opt-in Sentry error tracking and its privacy scrubbing."""

from __future__ import annotations

import json
import logging
from typing import Any
from unittest.mock import patch

import pytest
import sentry_sdk
from pydantic import SecretStr
from sentry_sdk.envelope import Envelope
from sentry_sdk.transport import Transport

import ledger_sync
from ledger_sync.config.settings import Settings
from ledger_sync.core.observability import init_error_tracking, report_exception, scrub_event

# A syntactically valid DSN with no real project behind it.
_DSN = "https://publickey@o0.ingest.sentry.io/0"


def test_no_dsn_does_not_init() -> None:
    settings = Settings(sentry_dsn=None)

    with patch("sentry_sdk.init") as init:
        started = init_error_tracking(settings)

    assert started is False
    init.assert_not_called()


def test_dsn_passes_privacy_options() -> None:
    settings = Settings(
        sentry_dsn=SecretStr(_DSN),
        sentry_traces_sample_rate=0.25,
        environment="production",
        jwt_secret_key="x" * 40,
        encryption_key="y" * 40,
        database_url="postgresql://u:p@localhost/db",
    )

    with patch("sentry_sdk.init") as init:
        started = init_error_tracking(settings)

    assert started is True
    init.assert_called_once()
    kwargs = init.call_args.kwargs
    assert kwargs["dsn"] == _DSN
    assert kwargs["environment"] == "production"
    assert kwargs["release"] == f"ledger-sync@{ledger_sync.__version__}"
    assert kwargs["traces_sample_rate"] == 0.25
    assert kwargs["send_default_pii"] is False
    assert kwargs["max_request_body_size"] == "never"
    assert kwargs["include_local_variables"] is False
    assert kwargs["before_send"] is scrub_event
    assert kwargs["before_send_transaction"] is scrub_event


def test_scrub_event_strips_request_payload_and_credentials() -> None:
    event: dict[str, Any] = {
        "message": "boom",
        "request": {
            "url": "https://api.example.com/api/upload?token=secret",
            "method": "POST",
            "data": {"amount": 1234, "note": "rent"},
            "cookies": {"session": "abc"},
            "query_string": "token=secret",
            "headers": {
                "Authorization": "Bearer abc",
                "Cookie": "session=abc",
                "X-Upload-Token": "lsu_abc",
                "User-Agent": "pytest",
                "Content-Type": "application/json",
            },
        },
    }

    result = scrub_event(event)

    assert result is event
    assert result["message"] == "boom"
    request = result["request"]
    assert "data" not in request
    assert "cookies" not in request
    assert "query_string" not in request
    assert request["url"] == "https://api.example.com/api/upload"
    assert request["headers"] == {"User-Agent": "pytest", "Content-Type": "application/json"}


def test_scrub_event_without_request_is_unchanged() -> None:
    event = {"message": "boom"}

    assert scrub_event(event) == {"message": "boom"}


def test_scrub_event_drops_free_text_that_can_hold_ledger_data() -> None:
    event: dict[str, Any] = {
        "breadcrumbs": {"values": [{"message": "Starting JSON import of 'HDFC_XX1234.xlsx'"}]},
        "extra": {"file_name": "HDFC_XX1234.xlsx"},
        "exception": {
            "values": [
                {"type": "IntegrityError", "value": "Failing row contains (5, 45000.00, Rent)"}
            ]
        },
        "logentry": {"message": "Refresh failed for %s", "params": ["HDFC_XX1234.xlsx"]},
        "message": "Refresh failed for HDFC_XX1234.xlsx",
        "spans": [{"description": "GET /api/x?file_name=HDFC_XX1234.xlsx", "data": {"q": "x"}}],
    }

    result = scrub_event(event)

    assert "breadcrumbs" not in result
    assert "extra" not in result
    assert result["exception"]["values"] == [{"type": "IntegrityError", "value": ""}]
    assert result["logentry"] == {"message": "Refresh failed for %s"}
    assert "message" not in result
    assert result["spans"] == [{"description": "GET /api/x"}]


class _CaptureTransport(Transport):
    """Keeps every payload the SDK would have sent, so a test can read it."""

    def __init__(self) -> None:
        super().__init__()
        self.payloads: list[Any] = []

    def capture_envelope(self, envelope: Envelope) -> None:
        self.payloads.extend(item.payload.json for item in envelope.items if item.payload.json)


@pytest.fixture
def capture_transport(monkeypatch: pytest.MonkeyPatch) -> Any:
    transport = _CaptureTransport()
    real_init = sentry_sdk.init
    monkeypatch.setattr(
        sentry_sdk, "init", lambda **kwargs: real_init(transport=transport, **kwargs)
    )
    yield transport
    real_init()  # back to a disabled client for the rest of the run


def test_nothing_from_the_ledger_leaves_for_sentry(capture_transport: _CaptureTransport) -> None:
    """End to end through a real client: the reviewer's leak, closed."""
    assert init_error_tracking(Settings(sentry_dsn=SecretStr(_DSN))) is True
    log = logging.getLogger("ledger_sync.test_observability")
    # Built at runtime: Sentry sends the source lines around each frame (application
    # code, never ledger data), so literals here would show up in those lines.
    file_name = "_".join(["HDFC", "XX1234", "statement.xlsx"])
    amount = str(45 * 1000)
    payee = " ".join(["Salary", "ACME"])
    detail = " ".join(["Failing", "row", "contains", f"(5, 2026-01-02, {amount}.00, {payee})"])

    log.warning("Starting JSON import of '%s' (10 rows)", file_name)
    try:
        raise ValueError(detail)
    except ValueError as exc:
        report_exception(exc)
    log.error("Post-upload analytics failed for file=%s", file_name)
    sentry_sdk.flush()

    sent = json.dumps(capture_transport.payloads)
    assert "ValueError" in sent
    for leaked in (file_name, amount, payee, detail):
        assert leaked not in sent
