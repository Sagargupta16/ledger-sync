"""Categorization rule API endpoints.

CRUD for user-defined "note/account contains X -> set category Y" rules,
plus an explicit retroactive apply endpoint. Rules never auto-run on
save -- import-time application happens in the sync engine, and the
user triggers retroactive application via POST /apply. All business
logic lives in ``core/rules.py``; this router only maps models to
responses.
"""

from fastapi import APIRouter, HTTPException
from sqlalchemy import select
from sqlalchemy.exc import OperationalError

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.core import rules as rules_engine
from ledger_sync.core.analytics_engine import AnalyticsEngine
from ledger_sync.db.models import CategorizationRule
from ledger_sync.schemas.categorization_rules import (
    CategorizationRuleCreateRequest,
    CategorizationRuleResponse,
    CategorizationRuleUpdateRequest,
    RulesApplyResponse,
)
from ledger_sync.utils.logging import logger

router = APIRouter(prefix="/api/categorization-rules", tags=["categorization-rules"])


def _to_rule_response(rule: CategorizationRule) -> CategorizationRuleResponse:
    """Convert a CategorizationRule model to a CategorizationRuleResponse."""
    return CategorizationRuleResponse(
        id=rule.id,
        match_field=rule.match_field,
        pattern=rule.pattern,
        category=rule.category,
        subcategory=rule.subcategory or "",
        is_active=rule.is_active,
        sort_order=rule.sort_order,
        created_at=rule.created_at.isoformat(),
    )


@router.get("")
async def list_rules(
    current_user: CurrentUser,
    db: DatabaseSession,
) -> list[CategorizationRuleResponse]:
    """List all of the user's rules (including inactive) in evaluation order."""
    stmt = (
        select(CategorizationRule)
        .where(CategorizationRule.user_id == current_user.id)
        .order_by(CategorizationRule.sort_order.asc(), CategorizationRule.id.asc())
    )
    rules = db.execute(stmt).scalars().all()
    return [_to_rule_response(rule) for rule in rules]


@router.post("", status_code=201)
async def create_rule(
    payload: CategorizationRuleCreateRequest,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> CategorizationRuleResponse:
    """Create a rule. Does NOT apply it retroactively -- use POST /apply."""
    rule = CategorizationRule(
        user_id=current_user.id,
        match_field=payload.match_field,
        pattern=payload.pattern,
        category=payload.category,
        subcategory=payload.subcategory,
        is_active=payload.is_active,
        sort_order=payload.sort_order,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return _to_rule_response(rule)


@router.put("/{rule_id}", responses={404: {"description": "Rule not found"}})
async def update_rule(
    rule_id: int,
    payload: CategorizationRuleUpdateRequest,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> CategorizationRuleResponse:
    """Fully replace a rule. Does NOT retro-apply -- use POST /apply."""
    stmt = select(CategorizationRule).where(
        CategorizationRule.id == rule_id,
        CategorizationRule.user_id == current_user.id,
    )
    rule = db.execute(stmt).scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")

    rule.match_field = payload.match_field
    rule.pattern = payload.pattern
    rule.category = payload.category
    rule.subcategory = payload.subcategory
    rule.is_active = payload.is_active
    rule.sort_order = payload.sort_order

    db.commit()
    db.refresh(rule)
    return _to_rule_response(rule)


@router.delete("/{rule_id}", status_code=204)
async def delete_rule(
    rule_id: int,
    current_user: CurrentUser,
    db: DatabaseSession,
) -> None:
    """Delete a rule. Idempotent: a nonexistent id is also a 204."""
    stmt = select(CategorizationRule).where(
        CategorizationRule.id == rule_id,
        CategorizationRule.user_id == current_user.id,
    )
    rule = db.execute(stmt).scalar_one_or_none()
    if rule is not None:
        db.delete(rule)
        db.commit()


@router.post("/apply")
async def apply_rules(
    current_user: CurrentUser,
    db: DatabaseSession,
) -> RulesApplyResponse:
    """Apply all active rules to the user's live non-transfer transactions.

    Updated rows get NEW transaction_id values (category feeds the dedup
    hash) and their tags are migrated server-side. Analytics tables bake
    in categories, so a full analytics rebuild runs afterwards --
    non-fatally: the apply itself still succeeds if the rebuild fails.
    """
    matched, updated = rules_engine.apply_rules_retroactively(db, current_user.id)

    analytics_refreshed = True
    try:
        analytics = AnalyticsEngine(db, user_id=current_user.id)
        analytics.run_full_analytics(source_file="rules_apply")
    except (OSError, RuntimeError, ValueError, OperationalError) as exc:
        # Don't fail the apply if the analytics rebuild blows up -- the
        # category rewrites are already committed; the user can re-run
        # POST /api/analytics/v2/refresh.
        logger.warning(
            "Post-apply analytics refresh failed for user_id=%s: %s",
            current_user.id,
            exc,
        )
        db.rollback()
        analytics_refreshed = False

    return RulesApplyResponse(
        matched=matched,
        updated=updated,
        analytics_refreshed=analytics_refreshed,
    )
