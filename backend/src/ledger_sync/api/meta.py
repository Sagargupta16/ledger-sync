"""Metadata API endpoints for dropdowns and filters."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ledger_sync.db.models import Transaction, TransactionType
from ledger_sync.db.session import get_session

router = APIRouter(prefix="/api/meta", tags=["meta"])


@router.get("/types")
def get_types() -> dict[str, list[str]]:
    """Return transaction types."""
    return {
        "transaction_types": [t.value for t in TransactionType],
    }


@router.get("/accounts")
def get_accounts(db: Session = Depends(get_session)) -> dict[str, list[str]]:
    """Return unique accounts from transactions (including transfers)."""
    accounts: set[str] = set()

    # From transactions (account field)
    for (acct,) in (
        db.query(Transaction.account).filter(Transaction.is_deleted.is_(False)).distinct()
    ):
        if acct:
            accounts.add(acct)

    # From transfers (from_account field)
    for (from_acct,) in (
        db.query(Transaction.from_account)
        .filter(Transaction.is_deleted.is_(False), Transaction.from_account.isnot(None))
        .distinct()
    ):
        if from_acct:
            accounts.add(from_acct)

    # From transfers (to_account field)
    for (to_acct,) in (
        db.query(Transaction.to_account)
        .filter(Transaction.is_deleted.is_(False), Transaction.to_account.isnot(None))
        .distinct()
    ):
        if to_acct:
            accounts.add(to_acct)

    return {"accounts": sorted(accounts)}


@router.get("/filters")
def get_filter_meta(db: Session = Depends(get_session)) -> dict[str, list[str]]:
    """Return combined filter metadata (types + accounts).

    Categories remain available via /api/calculations/categories/master.
    """
    types = get_types()
    accounts = get_accounts(db)
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
def get_buckets(db: Session = Depends(get_session)) -> dict[str, list[str]]:
    """Return dynamic buckets (needs/wants/savings/investment) from existing data."""
    needs: set[str] = set()
    wants: set[str] = set()
    savings: set[str] = set()
    investment_categories: set[str] = set()
    investment_accounts: set[str] = set()

    # Classify categories from transactions
    for (category,) in (
        db.query(Transaction.category).filter(Transaction.is_deleted.is_(False)).distinct()
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
        db.query(Transaction.account).filter(Transaction.is_deleted.is_(False)).distinct()
    ):
        if acct and _classify_account(acct) == "investment":
            investment_accounts.add(acct)

    # Check from_account and to_account in transactions (for transfers)
    for (from_acct,) in (
        db.query(Transaction.from_account)
        .filter(Transaction.is_deleted.is_(False), Transaction.from_account.isnot(None))
        .distinct()
    ):
        if from_acct and _classify_account(from_acct) == "investment":
            investment_accounts.add(from_acct)

    for (to_acct,) in (
        db.query(Transaction.to_account)
        .filter(Transaction.is_deleted.is_(False), Transaction.to_account.isnot(None))
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
