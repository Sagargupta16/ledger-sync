"""Instrument rates endpoint.

Serves EPF/PPF/NPS rates from a dated JSON config. No reliable public
JSON API exists for these rates, so the file at
``config/instrument_rates.json`` is the source of truth. Update it when
a new rate is notified (EPFO yearly, Ministry of Finance quarterly).
"""

from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException

from ledger_sync.api.deps import CurrentUser

router = APIRouter(prefix="/rates", tags=["rates"])

_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "instrument_rates.json"


@lru_cache(maxsize=1)
def _load_rates() -> dict[str, Any]:
    if not _CONFIG_PATH.exists():
        raise FileNotFoundError(f"Missing instrument rates config at {_CONFIG_PATH}")
    with _CONFIG_PATH.open(encoding="utf-8") as f:
        data: dict[str, Any] = json.load(f)
    return data


@router.get("/instruments")
def get_instrument_rates(_current_user: CurrentUser) -> dict[str, Any]:
    """Return EPF/PPF/NPS rates with effective_from and source_url metadata."""
    try:
        return _load_rates()
    except (OSError, json.JSONDecodeError) as e:
        raise HTTPException(
            status_code=503,
            detail="Instrument rates config unavailable",
        ) from e
