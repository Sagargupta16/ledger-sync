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


def _classify_categories_into_buckets(
    db: DatabaseSession, user_id: int
) -> tuple[set[str], set[str], set[str], set[str]]:
    """Classify transaction categories into needs/wants/savings/investment buckets."""
    needs: set[str] = set()
    wants: set[str] = set()
    savings: set[str] = set()
    investment_categories: set[str] = set()

    bucket_map: dict[str, set[str]] = {
        "investment": investment_categories,
        "needs": needs,
        "savings": savings,
        "wants": wants,
    }

    for (category,) in (
        db.query(Transaction.category)
        .filter(Transaction.user_id == user_id, Transaction.is_deleted.is_(False))
        .distinct()
    ):
        if not category:
            continue
        bucket = _classify_category(category)
        bucket_map[bucket].add(category)

    return needs, wants, savings, investment_categories


def _collect_investment_accounts(db: DatabaseSession, user_id: int) -> set[str]:
    """Collect investment accounts from account, from_account, and to_account columns."""
    investment_accounts: set[str] = set()
    active_filter = (Transaction.user_id == user_id, Transaction.is_deleted.is_(False))

    account_columns = [
        (Transaction.account, None),
        (Transaction.from_account, Transaction.from_account.isnot(None)),
        (Transaction.to_account, Transaction.to_account.isnot(None)),
    ]

    for column, extra_filter in account_columns:
        query = db.query(column).filter(*active_filter).distinct()
        if extra_filter is not None:
            query = query.filter(extra_filter)
        for (acct,) in query:
            if acct and _classify_account(acct) == "investment":
                investment_accounts.add(acct)

    return investment_accounts


@router.get("/buckets")
def get_buckets(
    current_user: CurrentUser,
    db: DatabaseSession,
) -> dict[str, list[str]]:
    """Return dynamic buckets (needs/wants/savings/investment) from existing data."""
    needs, wants, savings, investment_categories = _classify_categories_into_buckets(
        db, current_user.id
    )
    investment_accounts = _collect_investment_accounts(db, current_user.id)

    return {
        "needs": sorted(needs),
        "wants": sorted(wants),
        "savings": sorted(savings),
        "investment_categories": sorted(investment_categories),
        "investment_accounts": sorted(investment_accounts),
    }
