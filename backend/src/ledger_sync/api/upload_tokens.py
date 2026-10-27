"""Automation tokens: list, create for one scope (plaintext returned once) and revoke.

The path keeps its original name: every token is still an ``lsu_`` token, now
for one of three scopes (Money Manager upload, MCP ledger read, alert inbox).
"""

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.api.rate_limit import _user_key_func, limiter
from ledger_sync.db._models.upload_tokens import UPLOAD_SCOPE, TokenScope, UploadToken
from ledger_sync.schemas.money_manager import UploadTokenCreate, UploadTokenEntry
from ledger_sync.services.upload_tokens import (
    TooManyTokensError,
    create_upload_token,
    list_upload_tokens,
    revoke_upload_token,
)

router = APIRouter(prefix="/api/upload-tokens", tags=["upload-tokens"])


class ScopedTokenCreate(UploadTokenCreate):
    """The name plus the one thing the token may do; an omitted scope is upload."""

    scope: TokenScope = UPLOAD_SCOPE


class ScopedTokenEntry(UploadTokenEntry):
    scope: TokenScope


class ScopedTokenCreated(ScopedTokenEntry):
    """The new token; ``token`` is the only time its plaintext is returned."""

    token: str


class ScopedTokenList(BaseModel):
    tokens: list[ScopedTokenEntry]


def _utc(value: datetime | None) -> str | None:
    """Stored naive but holding UTC; attach the zone so browsers do not shift it."""
    return value.replace(tzinfo=UTC).isoformat() if value is not None else None


def _entry(record: UploadToken) -> ScopedTokenEntry:
    return ScopedTokenEntry(
        id=record.id,
        name=record.name,
        scope=record.scope,
        prefix=record.token_prefix,
        created_at=_utc(record.created_at) or "",
        expires_at=_utc(record.expires_at) or "",
        last_used_at=_utc(record.last_used_at),
    )


@router.get("")
def get_upload_tokens(current_user: CurrentUser, db: DatabaseSession) -> ScopedTokenList:
    """The user's active tokens of every scope, oldest first, without their secrets."""
    return ScopedTokenList(
        tokens=[_entry(record) for record in list_upload_tokens(db, current_user.id)]
    )


@router.post("", status_code=status.HTTP_201_CREATED, responses={409: {"description": "Limit"}})
@limiter.limit("10/hour", key_func=_user_key_func)
def post_upload_token(
    request: Request,  # required by slowapi
    payload: ScopedTokenCreate,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> ScopedTokenCreated:
    """Create a token; its plaintext is in this response and nowhere else, ever."""
    try:
        record, plaintext = create_upload_token(db, current_user.id, payload.name, payload.scope)
    except TooManyTokensError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    db.commit()
    return ScopedTokenCreated(**_entry(record).model_dump(), token=plaintext)


@router.delete(
    "/{token_id}", status_code=status.HTTP_204_NO_CONTENT, responses={404: {"description": "None"}}
)
def delete_upload_token(token_id: int, current_user: CurrentUser, db: DatabaseSession) -> Response:
    """Revoke a token at once; automations using it start failing with 401."""
    if not revoke_upload_token(db, current_user.id, token_id):
        raise HTTPException(status_code=404, detail="Upload token not found")
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
