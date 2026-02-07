"""Metadata API endpoints for dropdowns and filters."""

from fastapi import APIRouter
from sqlalchemy import union_all

from ledger_sync.api.deps import CurrentUser, DatabaseSession
from ledger_sync.db.models import Transaction, TransactionType

router = APIRouter(prefix="/api/meta", tags=["meta"])


@router.get("/types")
def get_types(current_user: CurrentUser) -> dict[str, list[str]]:
    """Return transaction types."""
    return {
        "transaction_types": [t.value for t in TransactionType],
    }


@router.get("/accounts")
def get_accounts(
    current_user: CurrentUser,
    db: DatabaseSession,
) -> dict[str, list[str]]:
    """Return unique accounts from transactions (including transfers)."""
    q1 = (
        db.query(Transaction.account.label("acct"))
        .filter(Transaction.user_id == current_user.id, Transaction.is_deleted.is_(False))
        .distinct()
    )
    q2 = (
        db.query(Transaction.from_account.label("acct"))
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.is_deleted.is_(False),
            Transaction.from_account.isnot(None),
        )
        .distinct()
    )
    q3 = (
        db.query(Transaction.to_account.label("acct"))
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.is_deleted.is_(False),
            Transaction.to_account.isnot(None),
        )
        .distinct()
    )

    combined = union_all(q1, q2, q3).subquery()
    results = db.query(combined.c.acct).distinct().all()
    accounts = sorted({row[0] for row in results if row[0]})

    return {"accounts": accounts}


@router.get("/filters")
def get_filter_meta(
    current_user: CurrentUser,
    db: DatabaseSession,
) -> dict[str, list[str]]:
    """Return combined filter metadata (types + accounts).

    Categories remain available via /api/calculations/categories/master.
    """
    types = get_types(current_user)
    accounts = get_accounts(current_user, db)
    return {
        "transaction_types": types["transaction_types"],
        "accounts": accounts["accounts"],
    }


def _classify_category(name: str) -> str:
    """Classify category into needs/wants/savings/investment via simple keywords."""
    n = name.lower()

    investment_kw = [
        "invest",
        "stock",
        "sip",
        "mutual",
        "fd",
        "rd",
        "ppf",
        "nps",
        "etf",
        "equity",
        "crypto",
        "gold",
    ]
    needs_kw = [
        "grocery",
        "food",
        "dining",
        "utility",
        "rent",
        "housing",
        "insurance",
        "loan",
        "fuel",
        "transport",
        "medical",
        "health",
        "bill",
        "child",
        "education",
    ]
    savings_kw = ["saving", "deposit", "emergency"]

    if any(k in n for k in investment_kw):
        return "investment"
    if any(k in n for k in needs_kw):
        return "needs"
    if any(k in n for k in savings_kw):
        return "savings"
    return "wants"


def _classify_account(name: str) -> str:
    n = name.lower()
    investment_kw = ["grow", "stock", "zerodha", "upstox", "broker", "demat", "mutual"]
    return "investment" if any(k in n for k in investment_kw) else "general"


@router.get("/buckets")
def get_buckets(
    current_user: CurrentUser,
    db: DatabaseSession,
) -> dict[str, list[str]]:
    """Return dynamic buckets (needs/wants/savings/investment) from existing data."""
    needs: set[str] = set()
    wants: set[str] = set()
    savings: set[str] = set()
    investment_categories: set[str] = set()
    investment_accounts: set[str] = set()

    # Classify categories from transactions
    for (category,) in (
        db.query(Transaction.category)
        .filter(Transaction.user_id == current_user.id, Transaction.is_deleted.is_(False))
        .distinct()
    ):
        if not category:
            continue
        bucket = _classify_category(category)
        if bucket == "investment":
            investment_categories.add(category)
        elif bucket == "needs":
            needs.add(category)
        elif bucket == "savings":
            savings.add(category)
        else:
            wants.add(category)

    # Classify accounts
    for (acct,) in (
        db.query(Transaction.account)
        .filter(Transaction.user_id == current_user.id, Transaction.is_deleted.is_(False))
        .distinct()
    ):
        if acct and _classify_account(acct) == "investment":
            investment_accounts.add(acct)

    # Check from_account and to_account in transactions (for transfers)
    for (from_acct,) in (
        db.query(Transaction.from_account)
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.is_deleted.is_(False),
            Transaction.from_account.isnot(None),
        )
        .distinct()
    ):
        if from_acct and _classify_account(from_acct) == "investment":
            investment_accounts.add(from_acct)

    for (to_acct,) in (
        db.query(Transaction.to_account)
        .filter(
            Transaction.user_id == current_user.id,
            Transaction.is_deleted.is_(False),
            Transaction.to_account.isnot(None),
        )
        .distinct()
    ):
        if to_acct and _classify_account(to_acct) == "investment":
            investment_accounts.add(to_acct)

    return {
        "needs": sorted(needs),
        "wants": sorted(wants),
        "savings": sorted(savings),
        "investment_categories": sorted(investment_categories),
        "investment_accounts": sorted(investment_accounts),
    }
