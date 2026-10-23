"""Upload tokens for automations: list, create (plaintext returned once) and revoke."""

from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException, Request, Response, status

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.api.rate_limit import _user_key_func, limiter
from ledger_sync.db._models.upload_tokens import UploadToken
from ledger_sync.schemas.money_manager import (
    UploadTokenCreate,
    UploadTokenCreated,
    UploadTokenEntry,
    UploadTokenList,
)
from ledger_sync.services.upload_tokens import (
    TooManyTokensError,
    create_upload_token,
    list_upload_tokens,
    revoke_upload_token,
)

router = APIRouter(prefix="/api/upload-tokens", tags=["upload-tokens"])


def _utc(value: datetime | None) -> str | None:
    """Stored naive but holding UTC; attach the zone so browsers do not shift it."""
    return value.replace(tzinfo=UTC).isoformat() if value is not None else None


def _entry(record: UploadToken) -> UploadTokenEntry:
    return UploadTokenEntry(
        id=record.id,
        name=record.name,
        prefix=record.token_prefix,
        created_at=_utc(record.created_at) or "",
        expires_at=_utc(record.expires_at) or "",
        last_used_at=_utc(record.last_used_at),
    )


@router.get("")
def get_upload_tokens(current_user: CurrentUser, db: DatabaseSession) -> UploadTokenList:
    """The user's active tokens, oldest first, without their secrets."""
    return UploadTokenList(
        tokens=[_entry(record) for record in list_upload_tokens(db, current_user.id)]
    )


@router.post("", status_code=status.HTTP_201_CREATED, responses={409: {"description": "Limit"}})
@limiter.limit("10/hour", key_func=_user_key_func)
def post_upload_token(
    request: Request,  # required by slowapi
    payload: UploadTokenCreate,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> UploadTokenCreated:
    """Create a token; its plaintext is in this response and nowhere else, ever."""
    try:
        record, plaintext = create_upload_token(db, current_user.id, payload.name)
    except TooManyTokensError as e:
        raise HTTPException(status_code=409, detail=str(e)) from e
    db.commit()
    return UploadTokenCreated(**_entry(record).model_dump(), token=plaintext)


@router.delete(
    "/{token_id}", status_code=status.HTTP_204_NO_CONTENT, responses={404: {"description": "None"}}
)
def delete_upload_token(token_id: int, current_user: CurrentUser, db: DatabaseSession) -> Response:
    """Revoke a token at once; automations using it start failing with 401."""
    if not revoke_upload_token(db, current_user.id, token_id):
        raise HTTPException(status_code=404, detail="Upload token not found")
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
