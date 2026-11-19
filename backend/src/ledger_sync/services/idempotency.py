"""Idempotency keys for the two ledger upload routes: claim, recover, replay.

A client that may retry an upload sends an ``Idempotency-Key`` header; without
one, a route runs exactly as it always has. The key is claimed in its own
committed transaction (``started``), the ``ledger_saved`` recovery point is
written inside the transaction that commits the ledger and its import log, and
the final 200 body is stored (``completed``) once the analytics refresh ran.

A retry then gets the stored body (replay), resumes a saved ledger whose
refresh never finished, waits while the first request is still running, or is
refused when the same key arrives with a different upload. ``classify`` alone
names what a stored row means; ``begin``, ``mark_ledger_saved``, ``complete``
and ``release`` alone change it, each fenced on the ``locked_at`` it claimed,
so a request that lost its lock can never overwrite the one that took it over.
``run_once`` drives them. Every query is scoped to the uploading user.
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Callable, Sequence
from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from enum import StrEnum
from typing import Any

import sqlalchemy as sa
from pydantic import BaseModel
from sqlalchemy import ColumnElement, delete, select, update
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from ledger_sync.db.models import IdempotencyKey, IdempotencyState
from ledger_sync.utils.logging import logger

# Longer than the longest request: Vercel stops a function at 300 s and
# vercel.json sets no maxDuration, so a live request never loses its lock.
LOCK_TIMEOUT = timedelta(minutes=6)
# Rows are a replay cache: a retry comes within minutes, never a day later.
RETENTION = timedelta(hours=24)
BUSY_RETRY_AFTER = 5

# crypto.randomUUID() matches.
_KEY_PATTERN = re.compile(r"[A-Za-z0-9_-]{8,128}")
_TABLE = IdempotencyKey.__tablename__

INVALID_KEY_DETAIL = "Idempotency-Key must be 8-128 letters, digits, '-' or '_'."
MISMATCH_DETAIL = (
    "This Idempotency-Key was used for a different upload. Send a new key for a new upload."
)
# Never "already imported" or "Use --force": the first request may still fail.
BUSY_DETAIL = (
    "An upload with this Idempotency-Key is still running. Retry in a minute; if the first "
    "request was cut off, the key frees itself within six minutes."
)


class IdempotentRoute(StrEnum):
    UPLOAD = "upload"
    MONEY_MANAGER = "money_manager"


class ClaimKind(StrEnum):
    """What a keyed request does, derived only by ``classify`` (and an absent table)."""

    UNTRACKED = "untracked"  # the table is not migrated yet: run as without a key
    NEW = "new"  # first claim, or a takeover of an abandoned start: run the import
    RESUME = "resume"  # the ledger was saved, the final body was not: refresh and finish
    REPLAY = "replay"  # completed: return the stored body
    BUSY = "busy"  # another request holds a fresh lock: 409, retry later
    MISMATCH = "mismatch"  # the key belongs to a different upload: 422


@dataclass(frozen=True, slots=True)
class IdempotencyScope:
    """One keyed request: who, which route, the key and the request's fingerprint."""

    user_id: int
    route: IdempotentRoute
    key: str
    fingerprint: str


@dataclass(frozen=True, slots=True)
class Claim:
    """The outcome of ``begin``; ``locked_at`` is the fence every later write matches."""

    kind: ClaimKind
    row_id: int | None
    locked_at: datetime | None
    stored: str | None


class InvalidIdempotencyKeyError(ValueError):
    """The header is present but not a valid key (the route answers 400)."""


class IdempotencyConflictError(Exception):
    """The key cannot run now: busy (409, Retry-After) or used for another upload (422)."""

    def __init__(self, status_code: int, detail: str, retry_after: int | None = None) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail
        self.retry_after = retry_after


def _now() -> datetime:
    """Naive UTC, like the other audit timestamps."""
    return datetime.now(UTC).replace(tzinfo=None)


def parse_key(raw: str | None) -> str | None:
    """The key, or None when the header is absent or blank; a malformed key raises.

    A blank header counts as absent so a client that sends ``Idempotency-Key:``
    with nothing in it (an empty Shortcut variable) keeps today's behaviour.
    """
    if raw is None or not raw.strip():
        return None
    if not _KEY_PATTERN.fullmatch(raw):
        raise InvalidIdempotencyKeyError(INVALID_KEY_DETAIL)
    return raw


def request_fingerprint(route: IdempotentRoute, body: bytes, params: Sequence[str]) -> str:
    """SHA-256 hex of the route, each option on its own line, then the raw body."""
    head = "".join(f"{part}\n" for part in (route, *params)).encode()
    return hashlib.sha256(head + body).hexdigest()


def classify(row: IdempotencyKey | None, fingerprint: str, now: datetime) -> ClaimKind:
    """Name what a stored row means for a request with this fingerprint, at ``now``."""
    if row is None:
        return ClaimKind.NEW
    if row.request_hash != fingerprint:
        return ClaimKind.MISMATCH
    if row.state == IdempotencyState.COMPLETED:
        return ClaimKind.REPLAY
    if row.locked_at is not None and row.locked_at > now - LOCK_TIMEOUT:
        return ClaimKind.BUSY
    if row.state == IdempotencyState.LEDGER_SAVED:
        return ClaimKind.RESUME
    return ClaimKind.NEW


def _locked_at_is(locked_at: datetime | None) -> ColumnElement[bool]:
    if locked_at is None:
        return IdempotencyKey.locked_at.is_(None)
    return IdempotencyKey.locked_at == locked_at


def _rowcount(result: Any) -> int:
    return int(getattr(result, "rowcount", 0) or 0)


def _find(db: Session, scope: IdempotencyScope) -> IdempotencyKey | None:
    return db.scalar(
        select(IdempotencyKey)
        .where(
            IdempotencyKey.user_id == scope.user_id,
            IdempotencyKey.route == scope.route,
            IdempotencyKey.idempotency_key == scope.key,
        )
        .execution_options(populate_existing=True)
    )


def _insert(db: Session, scope: IdempotencyScope, now: datetime) -> int | None:
    """The new row's id, or None when a concurrent request inserted the key first."""
    row = IdempotencyKey(
        user_id=scope.user_id,
        route=scope.route,
        idempotency_key=scope.key,
        request_hash=scope.fingerprint,
        state=IdempotencyState.STARTED,
        locked_at=now,
        created_at=now,
        updated_at=now,
    )
    try:
        with db.begin_nested():
            db.add(row)
    except IntegrityError:
        return None
    return row.id


def begin(db: Session, scope: IdempotencyScope) -> Claim:
    """Reap this user's old keys, then look the key up, classify it and claim it; commits."""
    if not sa.inspect(db.connection()).has_table(_TABLE):
        logger.info("Idempotency-Key ignored for user_id=%s: %s is absent", scope.user_id, _TABLE)
        return Claim(ClaimKind.UNTRACKED, None, None, None)
    now = _now()
    db.execute(
        delete(IdempotencyKey)
        .where(
            IdempotencyKey.user_id == scope.user_id,
            IdempotencyKey.created_at < now - RETENTION,
        )
        .execution_options(synchronize_session=False)
    )
    row = _find(db, scope)
    kind = classify(row, scope.fingerprint, now)
    if kind is ClaimKind.NEW and row is None:
        row_id = _insert(db, scope, now)
        if row_id is not None:
            db.commit()
            return Claim(ClaimKind.NEW, row_id, now, None)
        # A concurrent request claimed the key between the lookup and the insert.
        row = _find(db, scope)
        kind = classify(row, scope.fingerprint, now) if row is not None else ClaimKind.BUSY
    if row is None:
        db.commit()
        return Claim(kind, None, None, None)
    row_id, held, stored = row.id, row.locked_at, row.response_body
    if kind in (ClaimKind.NEW, ClaimKind.RESUME):
        # Take over an expired lock; a concurrent takeover leaves rowcount 0.
        taken = db.execute(
            update(IdempotencyKey)
            .where(
                IdempotencyKey.id == row_id,
                IdempotencyKey.user_id == scope.user_id,
                _locked_at_is(held),
            )
            .values(locked_at=now, updated_at=now)
            .execution_options(synchronize_session=False)
        )
        if _rowcount(taken) == 1:
            db.commit()
            return Claim(kind, row_id, now, stored)
        kind = ClaimKind.BUSY
    db.commit()
    return Claim(kind, row_id, held, stored if kind is ClaimKind.REPLAY else None)


def mark_ledger_saved(db: Session, claim: Claim, body_json: str) -> None:
    """started -> ledger_saved inside the import transaction; no commit, fenced.

    Raises RuntimeError (the import then rolls back) when the lock was lost.
    """
    saved = db.execute(
        update(IdempotencyKey)
        .where(
            IdempotencyKey.id == claim.row_id,
            IdempotencyKey.state == IdempotencyState.STARTED,
            _locked_at_is(claim.locked_at),
        )
        .values(state=IdempotencyState.LEDGER_SAVED, response_body=body_json, updated_at=_now())
        .execution_options(synchronize_session=False)
    )
    if _rowcount(saved) != 1:
        raise RuntimeError("The Idempotency-Key lock was lost before the ledger was saved.")


def complete(db: Session, claim: Claim, body_json: str) -> None:
    """Store the final body and drop the lock; commits."""
    done = db.execute(
        update(IdempotencyKey)
        .where(IdempotencyKey.id == claim.row_id, _locked_at_is(claim.locked_at))
        .values(
            state=IdempotencyState.COMPLETED,
            response_body=body_json,
            locked_at=None,
            updated_at=_now(),
        )
        .execution_options(synchronize_session=False)
    )
    if _rowcount(done) != 1:
        logger.warning("Idempotency-Key row %s was taken over before it completed", claim.row_id)
    db.commit()


def release(db: Session, claim: Claim) -> None:
    """Forget a claim whose import failed before the ledger was saved; commits.

    A database error here is logged and swallowed: the lock then expires.
    """
    try:
        db.execute(
            delete(IdempotencyKey)
            .where(
                IdempotencyKey.id == claim.row_id,
                IdempotencyKey.state == IdempotencyState.STARTED,
                _locked_at_is(claim.locked_at),
            )
            .execution_options(synchronize_session=False)
        )
        db.commit()
    except SQLAlchemyError as exc:
        logger.warning("Idempotency-Key row %s not released (%s)", claim.row_id, type(exc).__name__)
        with suppress(SQLAlchemyError):
            db.rollback()


def _stored[R: BaseModel](model: type[R], claim: Claim) -> R:
    if claim.stored is None:
        raise RuntimeError("The Idempotency-Key row has no stored response.")
    return model.model_validate_json(claim.stored)


def _finish(db: Session, claim: Claim, result: BaseModel) -> None:
    """Complete the claim; a failure leaves it to be resumed once the lock expires."""
    try:
        complete(db, claim, result.model_dump_json())
    except SQLAlchemyError as exc:
        logger.warning(
            "Idempotency-Key row %s not completed (%s)", claim.row_id, type(exc).__name__
        )
        with suppress(SQLAlchemyError):
            db.rollback()


def run_once[R: BaseModel](
    db: Session,
    scope: IdempotencyScope | None,
    model: type[R],
    execute: Callable[[Callable[[R], None] | None], R],
    resume: Callable[[R], R],
) -> tuple[R, bool]:
    """Run ``execute`` at most once per key and return (response, replayed).

    ``execute`` receives the hook that stores its provisional body inside the
    import transaction, or None when untracked. ``resume`` finishes a stored
    provisional body (the analytics refresh) after a lost request.
    """
    if scope is None:
        return execute(None), False
    claim = begin(db, scope)
    if claim.kind is ClaimKind.UNTRACKED:
        return execute(None), False
    if claim.kind is ClaimKind.MISMATCH:
        raise IdempotencyConflictError(422, MISMATCH_DETAIL)
    if claim.kind is ClaimKind.BUSY:
        raise IdempotencyConflictError(409, BUSY_DETAIL, retry_after=BUSY_RETRY_AFTER)
    if claim.kind is ClaimKind.REPLAY:
        return _stored(model, claim), True
    if claim.kind is ClaimKind.RESUME:
        resumed = resume(_stored(model, claim))
        _finish(db, claim, resumed)
        return resumed, True

    def save_provisional(provisional: R) -> None:
        mark_ledger_saved(db, claim, provisional.model_dump_json())

    try:
        result = execute(save_provisional)
    except Exception:
        db.rollback()
        # Deletes only a row still started: a saved ledger stays resumable.
        release(db, claim)
        raise
    _finish(db, claim, result)
    return result, False
