"""Idempotency-Key on POST /api/upload and POST /api/upload/money-manager.

Without the header both routes behave exactly as before; with it, a retry of
the same upload returns the first result instead of importing twice.
"""

import gzip
import json
from datetime import UTC, datetime, timedelta
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from ledger_sync.api.deps import UploadPrincipal, get_current_user, get_upload_principal
from ledger_sync.api.main import app
from ledger_sync.api.rate_limit import limiter
from ledger_sync.db.models import (
    CategorizationRule,
    IdempotencyKey,
    IdempotencyState,
    ImportLog,
    Transaction,
    User,
)
from ledger_sync.services import idempotency
from ledger_sync.services.auth_service import AuthService
from ledger_sync.services.idempotency import (
    BUSY_DETAIL,
    INVALID_KEY_DETAIL,
    MISMATCH_DETAIL,
    IdempotentRoute,
    request_fingerprint,
)
from tests.fixtures.money_manager import household

UPLOAD = "/api/upload"
BACKUP = "/api/upload/money-manager"
JSON = {"Content-Type": "application/json"}
GZIP = {"Content-Type": "application/gzip"}
REPLAYED = "Idempotent-Replayed"
KEY = "0b9f5c1e-7a3d-4d2e-9c11-5f6a7b8c9d0e"

Client = tuple[TestClient, Session, User, User, dict[str, User]]


@pytest.fixture
def client(two_user_client: Client, monkeypatch: pytest.MonkeyPatch) -> Client:
    """Signed-in requests on both routes act as ``current["user"]``."""
    monkeypatch.setattr(limiter, "enabled", False)
    current = two_user_client[4]
    app.dependency_overrides[get_upload_principal] = lambda: UploadPrincipal(
        user_id=current["user"].id
    )
    return two_user_client


def _now() -> datetime:
    return datetime.now(UTC).replace(tzinfo=None)


def _snapshot(*, amount: str = "1", force: bool = False) -> bytes:
    row = {"date": "2026-01-15", "currency": "INR", "type": "Expense", "account": "Synthetic"}
    rows = [
        {**row, "amount": amount, "category": "Synthetic"},
        {**row, "amount": "2", "category": "Other"},
    ]
    payload = {"file_name": "synthetic.csv", "file_hash": "d" * 64, "force": force, "rows": rows}
    return json.dumps(payload).encode()


def _backup() -> bytes:
    return gzip.compress(household().backup())


def _keyed(headers: dict[str, str], key: str = KEY) -> dict[str, str]:
    return {**headers, "Idempotency-Key": key}


def _count(session: Session, model: type, user: User | None = None) -> int:
    stmt = select(func.count()).select_from(model)
    if user is not None:
        stmt = stmt.where(model.user_id == user.id)
    return session.scalar(stmt) or 0


def _amounts(session: Session, user: User) -> list[Decimal]:
    return sorted(
        session.scalars(
            select(Transaction.amount).where(
                Transaction.user_id == user.id, Transaction.is_deleted.is_(False)
            )
        )
    )


def _keys(session: Session) -> list[IdempotencyKey]:
    session.expire_all()
    return list(session.scalars(select(IdempotencyKey).order_by(IdempotencyKey.id)))


def _seed(
    session: Session,
    user: User,
    key: str,
    *,
    state: IdempotencyState = IdempotencyState.COMPLETED,
    fingerprint: str = "0" * 64,
    locked_at: datetime | None = None,
    created_at: datetime | None = None,
) -> None:
    now = _now()
    session.add(
        IdempotencyKey(
            user_id=user.id,
            route=IdempotentRoute.UPLOAD,
            idempotency_key=key,
            request_hash=fingerprint,
            state=state,
            response_body=None,
            locked_at=locked_at,
            created_at=created_at or now,
            updated_at=now,
        )
    )
    session.commit()


def _age_locks(session: Session) -> None:
    session.execute(update(IdempotencyKey).values(locked_at=_now() - timedelta(minutes=7)))
    session.commit()


def test_without_a_key_both_routes_behave_as_before(client: Client) -> None:
    http, session, _, _, _ = client

    first = http.post(UPLOAD, content=_snapshot(), headers=JSON)
    repeat = http.post(UPLOAD, content=_snapshot(), headers=JSON)
    backup = _backup()
    imported = http.post(BACKUP, content=backup, headers=GZIP)
    unchanged = http.post(BACKUP, content=backup, headers=GZIP)

    assert first.status_code == 200
    assert repeat.status_code == 409
    assert "already imported" in repeat.json()["detail"]
    assert (imported.json()["status"], unchanged.json()["status"]) == ("imported", "unchanged")
    assert all(REPLAYED not in r.headers for r in (first, imported, unchanged))
    assert _keys(session) == []


def test_a_keyed_upload_retried_returns_the_first_result_once(client: Client) -> None:
    http, session, user, _, _ = client

    first = http.post(UPLOAD, content=_snapshot(), headers=_keyed(JSON))
    live_after_first = _amounts(session, user)
    retry = http.post(UPLOAD, content=_snapshot(), headers=_keyed(JSON))

    assert (first.status_code, retry.status_code) == (200, 200)
    assert retry.json() == first.json()
    assert REPLAYED not in first.headers
    assert retry.headers[REPLAYED] == "true"
    assert _count(session, ImportLog, user) == 1
    assert _amounts(session, user) == live_after_first
    (row,) = _keys(session)
    assert (row.state, row.locked_at, row.route) == (IdempotencyState.COMPLETED, None, "upload")


def test_a_keyed_backup_replay_returns_imported_not_unchanged(client: Client) -> None:
    http, session, user, _, _ = client
    backup = _backup()

    first = http.post(BACKUP, content=backup, headers=_keyed(GZIP))
    retry = http.post(BACKUP, content=backup, headers=_keyed(GZIP))

    assert first.json()["status"] == "imported"
    assert first.json()["stats"]["inserted"] == 3
    assert retry.json() == first.json()
    assert retry.headers[REPLAYED] == "true"
    assert _count(session, ImportLog, user) == 1


def test_the_same_key_with_another_upload_is_refused(client: Client) -> None:
    http, session, user, _, _ = client
    http.post(UPLOAD, content=_snapshot(), headers=_keyed(JSON))
    before = _amounts(session, user)

    other = http.post(UPLOAD, content=_snapshot(amount="9", force=True), headers=_keyed(JSON))

    assert other.status_code == 422
    assert other.json()["detail"] == MISMATCH_DETAIL
    assert _amounts(session, user) == before
    assert _count(session, ImportLog, user) == 1


def test_another_user_with_the_same_key_imports_independently(client: Client) -> None:
    http, session, user_a, user_b, current = client
    http.post(UPLOAD, content=_snapshot(), headers=_keyed(JSON))

    current["user"] = user_b
    response = http.post(UPLOAD, content=_snapshot(), headers=_keyed(JSON))

    assert response.status_code == 200
    assert REPLAYED not in response.headers
    assert response.json()["stats"]["inserted"] == 2
    assert len(_amounts(session, user_a)) == len(_amounts(session, user_b)) == 2
    assert len(_keys(session)) == 2


def test_a_running_claim_is_busy_until_its_lock_expires(client: Client) -> None:
    http, session, user, _, _ = client
    body = _snapshot()
    fingerprint = request_fingerprint(IdempotentRoute.UPLOAD, body, ())
    _seed(
        session,
        user,
        KEY,
        state=IdempotencyState.STARTED,
        fingerprint=fingerprint,
        locked_at=_now() - timedelta(seconds=30),
    )

    busy = http.post(UPLOAD, content=body, headers=_keyed(JSON))

    assert busy.status_code == 409
    assert busy.headers["Retry-After"] == "5"
    assert busy.json()["detail"] == BUSY_DETAIL
    assert "already imported" not in BUSY_DETAIL
    assert "Use --force" not in BUSY_DETAIL
    assert _count(session, ImportLog, user) == 0

    _age_locks(session)
    taken_over = http.post(UPLOAD, content=body, headers=_keyed(JSON))

    assert taken_over.status_code == 200
    assert REPLAYED not in taken_over.headers
    assert _count(session, ImportLog, user) == 1
    (row,) = _keys(session)
    assert row.state == IdempotencyState.COMPLETED


def test_a_saved_ledger_whose_finish_failed_resumes_on_retry(
    client: Client, monkeypatch: pytest.MonkeyPatch
) -> None:
    http, session, user, _, _ = client
    real_complete = idempotency.complete
    calls: list[int] = []

    def fail_once(db: Session, claim: idempotency.Claim, body_json: str) -> None:
        calls.append(1)
        if len(calls) == 1:
            raise SQLAlchemyError("synthetic failure")
        real_complete(db, claim, body_json)

    monkeypatch.setattr(idempotency, "complete", fail_once)
    first = http.post(UPLOAD, content=_snapshot(), headers=_keyed(JSON))
    (saved,) = _keys(session)
    assert first.status_code == 200
    assert saved.state == IdempotencyState.LEDGER_SAVED
    assert json.loads(saved.response_body or "{}")["analytics_status"] == "failed"
    imported_at = session.scalar(select(ImportLog.imported_at))
    live = _amounts(session, user)
    _age_locks(session)

    resumed = http.post(UPLOAD, content=_snapshot(), headers=_keyed(JSON))

    assert resumed.status_code == 200
    assert resumed.headers[REPLAYED] == "true"
    assert resumed.json()["analytics_status"] == "ready"
    assert resumed.json()["analytics_message"] is None
    assert resumed.json()["stats"] == first.json()["stats"]
    assert _count(session, ImportLog, user) == 1
    assert session.scalar(select(ImportLog.imported_at)) == imported_at
    assert _amounts(session, user) == live
    (row,) = _keys(session)
    assert (row.state, row.locked_at) == (IdempotencyState.COMPLETED, None)


def test_a_refused_upload_releases_its_key(client: Client) -> None:
    http, session, _, _, _ = client
    http.post(UPLOAD, content=_snapshot(), headers=JSON)

    refused = http.post(UPLOAD, content=_snapshot(), headers=_keyed(JSON))
    assert refused.status_code == 409
    assert "already imported" in refused.json()["detail"]
    assert _keys(session) == []

    forced = http.post(UPLOAD, content=_snapshot(force=True), headers=_keyed(JSON))
    assert forced.status_code == 200
    assert REPLAYED not in forced.headers


def test_a_normalization_error_releases_its_key(client: Client) -> None:
    http, session, user, _, _ = client
    # A stored rule with an empty output label fails normalization after the claim.
    session.add(
        CategorizationRule(user_id=user.id, match_field="account", pattern="Synthetic", category="")
    )
    session.commit()

    rejected = http.post(UPLOAD, content=_snapshot(), headers=_keyed(JSON))
    assert rejected.status_code == 400
    assert _keys(session) == []

    session.query(CategorizationRule).delete()
    session.commit()
    accepted = http.post(UPLOAD, content=_snapshot(), headers=_keyed(JSON))
    assert accepted.status_code == 200
    assert REPLAYED not in accepted.headers


def test_an_unreadable_backup_releases_its_key(client: Client) -> None:
    http, session, _, _, _ = client

    unreadable = http.post(BACKUP, content=b"Date,Amount\n2026-05-01,10\n", headers=_keyed(GZIP))
    assert unreadable.status_code == 400
    assert _keys(session) == []

    imported = http.post(BACKUP, content=_backup(), headers=_keyed(GZIP))
    assert imported.json()["status"] == "imported"
    assert REPLAYED not in imported.headers


def test_a_keyed_dry_run_stores_nothing(client: Client) -> None:
    http, session, _, _, _ = client
    backup = _backup()

    preview = http.post(f"{BACKUP}?dry_run=true", content=backup, headers=_keyed(GZIP))
    assert preview.json()["status"] == "preview"
    assert _keys(session) == []

    imported = http.post(BACKUP, content=backup, headers=_keyed(GZIP))
    assert imported.json()["status"] == "imported"
    assert REPLAYED not in imported.headers


@pytest.mark.parametrize(
    ("url", "body", "headers"),
    [(UPLOAD, _snapshot(), JSON), (BACKUP, b"not read", GZIP)],
)
def test_a_malformed_key_is_a_400(
    client: Client, url: str, body: bytes, headers: dict[str, str]
) -> None:
    http, session, _, _, _ = client

    response = http.post(url, content=body, headers=_keyed(headers, "not a key"))

    assert response.status_code == 400
    assert response.json()["detail"] == INVALID_KEY_DETAIL
    assert _keys(session) == []


@pytest.mark.parametrize(
    ("url", "body", "headers"),
    [(UPLOAD, _snapshot(), JSON), (BACKUP, b"not read", GZIP)],
)
def test_an_unauthenticated_keyed_request_is_a_401(
    client: Client, url: str, body: bytes, headers: dict[str, str]
) -> None:
    http = client[0]
    app.dependency_overrides.pop(get_current_user)
    app.dependency_overrides.pop(get_upload_principal)

    response = http.post(url, content=body, headers=_keyed(headers, "not a key"))

    assert response.status_code == 401


def test_without_the_table_a_keyed_upload_runs_as_before(client: Client) -> None:
    http, session, _, _, _ = client
    session.commit()
    IdempotencyKey.__table__.drop(session.get_bind())

    first = http.post(UPLOAD, content=_snapshot(), headers=_keyed(JSON))
    repeat = http.post(UPLOAD, content=_snapshot(), headers=_keyed(JSON))

    assert first.status_code == 200
    assert repeat.status_code == 409
    assert "already imported" in repeat.json()["detail"]
    assert REPLAYED not in repeat.headers


def test_a_keyed_request_reaps_only_this_users_old_keys(client: Client) -> None:
    http, session, user_a, user_b, _ = client
    day_old = _now() - timedelta(hours=25)
    _seed(session, user_a, "old-key-a", created_at=day_old)
    _seed(session, user_a, "recent-key-a", created_at=_now() - timedelta(hours=1))
    _seed(session, user_b, "old-key-b", created_at=day_old)

    http.post(UPLOAD, content=_snapshot(), headers=_keyed(JSON))

    remaining = {(row.user_id, row.idempotency_key) for row in _keys(session)}
    assert remaining == {
        (user_a.id, "recent-key-a"),
        (user_a.id, KEY),
        (user_b.id, "old-key-b"),
    }


@pytest.mark.parametrize("mode", ["transactions", "full", "delete"])
def test_reset_and_delete_remove_only_the_owners_keys(client: Client, mode: str) -> None:
    _, session, owner, other, _ = client
    _seed(session, owner, "owner-key-1")
    _seed(session, other, "other-key-1")
    other_id = other.id
    service = AuthService(session)

    if mode == "delete":
        service.delete_account(owner)
    else:
        service.reset_account(owner, transactions_only=mode == "transactions")

    assert [row.user_id for row in _keys(session)] == [other_id]
