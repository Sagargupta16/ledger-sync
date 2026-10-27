"""CAS import (``POST /api/upload/cas``) and mutual-fund holdings (``GET /api/mf-holdings``).

The upload is multipart/form-data with a ``file`` (the CAS PDF) and a
``password`` field. The body is read into memory under Vercel's 4.5 MB request
cap and parsed there; the PDF and the password are never written to disk,
stored or logged. Both routes authenticate with ``ProviderUser``, so no database
connection is held while the PDF parses or AMFI's NAV file downloads, and each
database phase opens a session of its own.

The holdings read values every scheme at AMFI's latest NAV, fetched on demand
at most once a day (see core/mf_snapshot.py), and falls back to the statement's
own NAV when AMFI cannot be reached.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy.exc import SQLAlchemyError
from starlette.concurrency import run_in_threadpool

from ledger_sync.api.cas_form import FormError, parse_multipart
from ledger_sync.api.cas_holdings import build_response
from ledger_sync.api.deps import HttpClient, ProviderUser
from ledger_sync.api.rate_limit import user_limiter
from ledger_sync.core.amfi_nav import utc_now
from ledger_sync.core.cas_import import CasImportError, read_cas
from ledger_sync.core.cas_records import ParsedCas
from ledger_sync.core.mf_snapshot import load_snapshot, refresh_if_due
from ledger_sync.core.mf_store import replace_holdings
from ledger_sync.db import session as db_session
from ledger_sync.schemas.cas import CasImportResponse, MfHoldingsResponse
from ledger_sync.utils.logging import logger

router = APIRouter(prefix="/api", tags=["mutual-funds"])

# Vercel refuses a larger request body before the function runs.
MAX_BODY_BYTES = 4_500_000
_MAX_PASSWORD_CHARS = 128
_TOO_LARGE = "The upload is over 4.5 MB, more than the server accepts."
# The multipart body is parsed by hand (cas_form.py), so FastAPI cannot document it.
_UPLOAD_BODY = {
    "required": True,
    "content": {
        "multipart/form-data": {
            "schema": {
                "type": "object",
                "required": ["file"],
                "properties": {
                    "file": {
                        "type": "string",
                        "format": "binary",
                        "description": "The original CAS PDF, up to 4.5 MB in the whole request",
                    },
                    "password": {
                        "type": "string",
                        "maxLength": _MAX_PASSWORD_CHARS,
                        "description": "Opens the PDF for this request; never stored or logged",
                    },
                },
            }
        }
    },
}


async def _read_body(request: Request) -> bytes:
    """The whole body in memory, refused once it passes the cap."""
    declared = request.headers.get("content-length", "")
    if declared.isdigit() and int(declared) > MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail=_TOO_LARGE)
    chunks: list[bytes] = []
    size = 0
    async for chunk in request.stream():
        size += len(chunk)
        if size > MAX_BODY_BYTES:
            raise HTTPException(status_code=413, detail=_TOO_LARGE)
        chunks.append(chunk)
    return b"".join(chunks)


def _read_form(body: bytes, content_type: str) -> tuple[bytes, str]:
    """The PDF and its password from the multipart body; a 400 when the form is wrong."""
    try:
        form = parse_multipart(body, content_type)
    except FormError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    pdf = form.get("file")
    if not pdf:
        raise HTTPException(status_code=400, detail="Choose the CAS PDF to upload.")
    password = form.get("password", b"").decode("utf-8", errors="replace")
    if len(password) > _MAX_PASSWORD_CHARS:
        raise HTTPException(status_code=400, detail="That password is too long.")
    return pdf, password


def _replace(user_id: int, parsed: ParsedCas) -> int:
    with db_session.SessionLocal() as session:
        return replace_holdings(session, user_id, parsed)


def _import_response(parsed: ParsedCas, replaced: int) -> CasImportResponse:
    return CasImportResponse(
        source=parsed.source,
        cas_type=parsed.cas_type,
        statement_from=parsed.statement_from,
        statement_to=parsed.statement_to,
        folios=parsed.folios,
        schemes=len(parsed.holdings),
        holdings=sum(1 for holding in parsed.holdings if holding.units > 0),
        transactions=sum(len(holding.transactions) for holding in parsed.holdings),
        replaced=replaced,
        warnings=list(parsed.warnings),
    )


@router.post(
    "/upload/cas",
    openapi_extra={"requestBody": _UPLOAD_BODY},
    responses={
        400: {"description": "Not a readable CAS, a wrong password, or a malformed form"},
        401: {"description": "Invalid access token"},
        413: {"description": "Upload exceeds 4.5 MB"},
        429: {"description": "Rate limit exceeded"},
        500: {"description": "The holdings could not be saved"},
    },
)
@user_limiter.limit("10/minute;30/hour")
async def upload_cas(request: Request, identity: ProviderUser) -> CasImportResponse:
    """Replace the user's CAMS/KFintech (or NSDL/CDSL) holdings with one CAS PDF."""
    body = await _read_body(request)
    pdf, password = _read_form(body, request.headers.get("content-type", ""))
    try:
        parsed = await run_in_threadpool(read_cas, pdf, password)
    except CasImportError as error:
        logger.info("CAS upload rejected")
        raise HTTPException(status_code=400, detail=str(error)) from error
    try:
        replaced = await run_in_threadpool(_replace, identity.id, parsed)
    except SQLAlchemyError as error:
        logger.error("CAS import failed (%s)", type(error).__name__)
        raise HTTPException(
            status_code=500, detail="Could not save the holdings. Please try again."
        ) from error
    return _import_response(parsed, replaced)


@router.get("/mf-holdings")
@user_limiter.limit("30/minute")
async def get_mf_holdings(
    request: Request, identity: ProviderUser, client: HttpClient
) -> MfHoldingsResponse:
    """Holdings at AMFI's latest NAV with cost, gain and XIRR, refreshing NAVs once a day."""
    snapshot = await run_in_threadpool(load_snapshot, identity.id)
    now = utc_now()
    snapshot, message = await refresh_if_due(client, snapshot, now)
    return build_response(snapshot, now, message)
