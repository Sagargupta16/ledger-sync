"""The idempotency claim table: what a stored key means for the next request."""

import hashlib
from datetime import UTC, datetime, timedelta

import pytest

from ledger_sync.db.models import IdempotencyKey, IdempotencyState
from ledger_sync.services.idempotency import (
    LOCK_TIMEOUT,
    ClaimKind,
    IdempotentRoute,
    InvalidIdempotencyKeyError,
    classify,
    parse_key,
    request_fingerprint,
)

# Naive UTC, as the column stores it.
NOW = datetime(2026, 11, 19, 10, 0, 0, tzinfo=UTC).replace(tzinfo=None)
FINGERPRINT = "a" * 64
FRESH = NOW - timedelta(seconds=30)
EXPIRED = NOW - LOCK_TIMEOUT - timedelta(seconds=1)


def _row(state: IdempotencyState, locked_at: datetime | None, request_hash: str = FINGERPRINT):
    return IdempotencyKey(
        user_id=1,
        route=IdempotentRoute.UPLOAD,
        idempotency_key="key-12345678",
        request_hash=request_hash,
        state=state,
        locked_at=locked_at,
    )


def test_no_row_is_a_new_claim() -> None:
    assert classify(None, FINGERPRINT, NOW) is ClaimKind.NEW


@pytest.mark.parametrize(
    ("state", "locked_at", "expected"),
    [
        (IdempotencyState.STARTED, FRESH, ClaimKind.BUSY),
        (IdempotencyState.STARTED, EXPIRED, ClaimKind.NEW),
        (IdempotencyState.STARTED, None, ClaimKind.NEW),
        (IdempotencyState.LEDGER_SAVED, FRESH, ClaimKind.BUSY),
        (IdempotencyState.LEDGER_SAVED, EXPIRED, ClaimKind.RESUME),
        (IdempotencyState.LEDGER_SAVED, None, ClaimKind.RESUME),
        (IdempotencyState.COMPLETED, None, ClaimKind.REPLAY),
        (IdempotencyState.COMPLETED, FRESH, ClaimKind.REPLAY),
        (IdempotencyState.COMPLETED, EXPIRED, ClaimKind.REPLAY),
    ],
)
def test_matching_fingerprint_by_state_and_lock_age(
    state: IdempotencyState, locked_at: datetime | None, expected: ClaimKind
) -> None:
    assert classify(_row(state, locked_at), FINGERPRINT, NOW) is expected


@pytest.mark.parametrize("state", list(IdempotencyState))
@pytest.mark.parametrize("locked_at", [FRESH, EXPIRED, None])
def test_a_different_fingerprint_is_a_mismatch_in_every_state(
    state: IdempotencyState, locked_at: datetime | None
) -> None:
    assert classify(_row(state, locked_at, "b" * 64), FINGERPRINT, NOW) is ClaimKind.MISMATCH


def test_the_lock_expires_exactly_at_the_timeout() -> None:
    at_edge = _row(IdempotencyState.STARTED, NOW - LOCK_TIMEOUT)

    assert classify(at_edge, FINGERPRINT, NOW) is ClaimKind.NEW
    assert LOCK_TIMEOUT == timedelta(minutes=6)


@pytest.mark.parametrize("raw", ["0b9f5c1e-7a3d-4d2e-9c11-5f6a7b8c9d0e", "abcdEFGH", "a_b-" * 32])
def test_valid_keys_parse(raw: str) -> None:
    assert parse_key(raw) == raw


def test_an_absent_header_is_no_key() -> None:
    assert parse_key(None) is None


@pytest.mark.parametrize("raw", ["", "   "])
def test_a_blank_header_is_no_key(raw: str) -> None:
    # An empty Shortcut variable sends the header with nothing in it; that is today's behaviour.
    assert parse_key(raw) is None


@pytest.mark.parametrize("raw", ["short", "a" * 129, "has space1", "semi;colon", "dot.ted.key"])
def test_malformed_keys_raise(raw: str) -> None:
    with pytest.raises(InvalidIdempotencyKeyError):
        parse_key(raw)


def test_fingerprint_covers_route_options_and_body() -> None:
    body = b'{"rows": []}'
    upload = request_fingerprint(IdempotentRoute.UPLOAD, body, ())

    assert upload == hashlib.sha256(b"upload\n" + body).hexdigest()
    assert upload != request_fingerprint(IdempotentRoute.MONEY_MANAGER, body, ())
    forced = request_fingerprint(IdempotentRoute.MONEY_MANAGER, body, ("f", "True", "False"))
    plain = request_fingerprint(IdempotentRoute.MONEY_MANAGER, body, ("f", "False", "False"))
    assert forced == hashlib.sha256(b"money_manager\nf\nTrue\nFalse\n" + body).hexdigest()
    assert forced != plain
    assert upload != request_fingerprint(IdempotentRoute.UPLOAD, body + b" ", ())
