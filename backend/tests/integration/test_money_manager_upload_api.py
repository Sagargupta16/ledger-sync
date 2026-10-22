"""POST /api/upload/money-manager and the upload tokens that automations use."""

import gzip
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.api.deps import UploadPrincipal, get_upload_principal
from ledger_sync.api.main import app
from ledger_sync.api.rate_limit import limiter
from ledger_sync.db.models import Transaction, UploadToken, User
from tests.fixtures.money_manager import household

URL = "/api/upload/money-manager"
GZIP = {"Content-Type": "application/gzip"}

Client = tuple[TestClient, Session, User, User, dict[str, User]]


@pytest.fixture
def client(two_user_client: Client, monkeypatch: pytest.MonkeyPatch) -> Iterator[Client]:
    """Signed-in requests act as ``current["user"]``; a token request has no override."""
    monkeypatch.setattr(limiter, "enabled", False)
    current = two_user_client[4]
    app.dependency_overrides[get_upload_principal] = lambda: UploadPrincipal(
        user_id=current["user"].id
    )
    yield two_user_client


def _body(**edits: str) -> bytes:
    builder = household()
    for sql in edits.values():
        builder.db.execute(sql)
    return gzip.compress(builder.backup())


def _live(session: Session, user: User) -> int:
    rows = session.scalars(
        select(Transaction).where(Transaction.user_id == user.id, Transaction.is_deleted.is_(False))
    )
    return len(list(rows))


def test_a_gzipped_backup_imports_and_appears_in_history(client: Client) -> None:
    http, session, user, _, _ = client

    response = http.post(f"{URL}?file_name=20260501_090000.mmbak", content=_body(), headers=GZIP)

    assert response.status_code == 200
    payload = response.json()
    assert (payload["status"], payload["stats"]["inserted"], payload["analytics_status"]) == (
        "imported",
        3,
        "ready",
    )
    assert _live(session, user) == 3
    history = http.get("/api/upload/history").json()["imports"]
    assert history[0]["file_name"] == "20260501_090000.mmbak"


def test_a_dry_run_previews_without_writing_and_a_repeat_is_unchanged(client: Client) -> None:
    http, session, user, _, _ = client

    preview = http.post(f"{URL}?dry_run=true", content=_body(), headers=GZIP).json()
    assert (preview["status"], preview["stats"]["inserted"], _live(session, user)) == (
        "preview",
        3,
        0,
    )

    http.post(URL, content=_body(), headers=GZIP)
    assert http.post(URL, content=_body(), headers=GZIP).json()["status"] == "unchanged"


def test_an_unreadable_body_is_a_400_with_a_reason(client: Client) -> None:
    response = client[0].post(URL, content=b"Date,Amount\n2026-05-01,10\n", headers=GZIP)

    assert response.status_code == 400
    assert "not a Money Manager backup" in response.json()["detail"]


def test_backups_stay_within_their_own_user(client: Client) -> None:
    http, session, user_a, user_b, current = client
    http.post(URL, content=_body(), headers=GZIP)

    current["user"] = user_b
    response = http.post(URL, content=_body(), headers=GZIP)

    assert response.json()["stats"]["inserted"] == 3
    assert (_live(session, user_a), _live(session, user_b)) == (3, 3)


def _create_token(http: TestClient, name: str = "iPhone Shortcut") -> dict[str, object]:
    response = http.post("/api/upload-tokens", json={"name": name})
    assert response.status_code == 201
    return response.json()


def test_an_upload_token_imports_without_a_session(client: Client) -> None:
    http, session, user, _, _ = client
    created = _create_token(http)
    del app.dependency_overrides[get_upload_principal]

    response = http.post(
        f"{URL}?dry_run=true",
        content=_body(),
        headers={**GZIP, "Authorization": f"Bearer {created['token']}"},
    )

    # Tokens cannot preview: the upload commits.
    assert response.json()["status"] == "imported"
    assert _live(session, user) == 3
    record = session.scalar(select(UploadToken).where(UploadToken.id == created["id"]))
    assert record is not None
    assert record.last_used_at is not None
    assert record.token_hash != created["token"]


def test_a_token_upload_that_removes_too_much_is_refused(client: Client) -> None:
    http, session, user, _, _ = client
    big = household()
    for index in range(40):
        big.entry(f"tx-{index}", "1", "2026-06-01", 10 + index, "acc-bank", category="cat-food")
    http.post(URL, content=gzip.compress(big.backup()), headers=GZIP)
    created = _create_token(http)
    del app.dependency_overrides[get_upload_principal]

    response = http.post(
        f"{URL}?allow_large_delete=true",
        content=_body(),
        headers={**GZIP, "Authorization": f"Bearer {created['token']}"},
    )

    assert response.status_code == 409
    assert _live(session, user) == 43


def test_a_revoked_token_is_refused(client: Client) -> None:
    http = client[0]
    created = _create_token(http)
    assert http.delete(f"/api/upload-tokens/{created['id']}").status_code == 204
    del app.dependency_overrides[get_upload_principal]

    response = http.post(
        URL, content=_body(), headers={**GZIP, "Authorization": f"Bearer {created['token']}"}
    )

    assert response.status_code == 401
    assert http.get("/api/upload-tokens").json()["tokens"] == []


def test_tokens_list_without_secrets_cap_at_five_and_stay_private(client: Client) -> None:
    http, _, _, user_b, current = client
    first = _create_token(http)
    for index in range(4):
        _create_token(http, f"Token {index}")

    listed = http.get("/api/upload-tokens").json()["tokens"]
    assert len(listed) == 5
    assert all("token" not in entry and entry["prefix"].startswith("lsu_") for entry in listed)
    assert http.post("/api/upload-tokens", json={"name": "One more"}).status_code == 409

    current["user"] = user_b
    assert http.get("/api/upload-tokens").json()["tokens"] == []
    assert http.delete(f"/api/upload-tokens/{first['id']}").status_code == 404
