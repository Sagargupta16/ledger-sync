"""Credit-card statement cycles from the Money Manager card settings."""

from typing import Annotated

from fastapi import APIRouter, Query

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.core.card_cycles_report import DEFAULT_HISTORY, card_cycles_report
from ledger_sync.schemas.card_cycles import CardCyclesResponse

router = APIRouter(prefix="/api/card-cycles", tags=["card-cycles"])


@router.get("")
def get_card_cycles(
    current_user: CurrentUser,
    db: DatabaseSession,
    history: Annotated[
        int, Query(ge=1, le=24, description="Closed statements returned per card")
    ] = DEFAULT_HISTORY,
) -> CardCyclesResponse:
    """Each credit card's latest statement, open cycle, due date and payment status.

    Cards without a statement or payment day, which only a Money Manager backup
    import supplies, and closed cards are listed in ``skipped`` with the reason.
    """
    return card_cycles_report(db, current_user, history)
