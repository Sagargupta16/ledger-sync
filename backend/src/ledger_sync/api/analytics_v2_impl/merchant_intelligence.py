"""V2 endpoint: merchant intelligence.

Mounted by ``recurring`` so the route keeps its original position and path.
"""

from __future__ import annotations

import json
from typing import Annotated, Any

from fastapi import APIRouter, Query
from sqlalchemy import desc

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.db.models import MerchantIntelligence

router = APIRouter()


@router.get("/merchant-intelligence")
def get_merchant_intelligence(
    current_user: CurrentUser,
    db: DatabaseSession,
    min_transactions: Annotated[int, Query(ge=1, description="Minimum transaction count")] = 3,
    recurring_only: Annotated[bool, Query(description="Only show recurring merchants")] = False,
    label_kind: Annotated[
        str | None,
        Query(description="Filter by label kind: 'brand' (recognised payee) or 'descriptor'"),
    ] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> dict[str, Any]:
    """Get merchant/vendor intelligence.

    Shows:
    - Top merchants by spend
    - Transaction patterns per merchant
    - Recurring merchant detection

    Each row carries ``label_kind``: ``brand`` rows are recognised payees,
    ``descriptor`` rows are the transaction note itself. A "top merchants"
    surface should filter to ``brand`` or label descriptors as descriptions --
    "Juice - Pineapple" is what was bought, not who was paid.
    """
    query = (
        db.query(MerchantIntelligence)
        .filter(MerchantIntelligence.user_id == current_user.id)
        .order_by(desc(MerchantIntelligence.total_spent))
    )

    if min_transactions:
        query = query.filter(MerchantIntelligence.transaction_count >= min_transactions)
    if recurring_only:
        query = query.filter(MerchantIntelligence.is_recurring.is_(True))
    if label_kind:
        query = query.filter(MerchantIntelligence.label_kind == label_kind)

    merchants = query.limit(limit).all()

    return {
        "data": [
            {
                "merchant": m.merchant_name,
                "label_kind": m.label_kind,
                "aliases": json.loads(m.merchant_aliases) if m.merchant_aliases else [],
                "category": m.primary_category,
                "subcategory": m.primary_subcategory,
                "total_spent": float(m.total_spent),
                "transaction_count": m.transaction_count,
                "avg_transaction": float(m.avg_transaction),
                "first_transaction": (
                    m.first_transaction.isoformat() if m.first_transaction else None
                ),
                "last_transaction": (
                    m.last_transaction.isoformat() if m.last_transaction else None
                ),
                "months_active": m.months_active,
                "avg_days_between": m.avg_days_between,
                "is_recurring": m.is_recurring,
            }
            for m in merchants
        ],
        "count": len(merchants),
    }
