"""Bearer check shared by the endpoints Vercel cron calls."""

from __future__ import annotations

import secrets

from fastapi import HTTPException, Request

from ledger_sync.config.push_settings import CRON_ENV, push_settings


def require_cron_secret(request: Request, feature: str = "Daily alerts are") -> None:
    """Refuse unless ``Authorization: Bearer <CRON_SECRET>`` matches; 503 while it is unset.

    ``feature`` names what is off in the 503 message, so each cron route says its own.
    """
    secret = push_settings.cron_secret.get_secret_value().strip()
    if not secret:
        raise HTTPException(
            status_code=503,
            detail=f"{feature} off until {CRON_ENV} is set on the server.",
        )
    supplied = request.headers.get("authorization", "")
    if not secrets.compare_digest(supplied.encode(), f"Bearer {secret}".encode()):
        raise HTTPException(
            status_code=401, detail="Not authorised", headers={"WWW-Authenticate": "Bearer"}
        )
