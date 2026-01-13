"""Account classification API endpoints."""

from typing import Any

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from ledger_sync.db.models import AccountClassification, AccountType
from ledger_sync.db.session import get_session

router = APIRouter(prefix="/api/account-classifications", tags=["account-classifications"])


@router.get("")
async def get_all_classifications(db: Session = Depends(get_session)) -> dict[str, str]:
    """Get all account classifications.

    Returns:
        Dictionary mapping account names to their account types
    """
    stmt = select(AccountClassification)
    classifications = db.execute(stmt).scalars().all()

    return {clf.account_name: clf.account_type.value for clf in classifications}


@router.get("/{account_name}")
async def get_classification(
    account_name: str, db: Session = Depends(get_session)
) -> dict[str, Any]:
    """Get classification for a specific account.

    Args:
        account_name: Name of the account

    Returns:
        Account classification details or 404 if not found
    """
    stmt = select(AccountClassification).where(AccountClassification.account_name == account_name)
    classification = db.execute(stmt).scalar()

    if not classification:
        return {"account_name": account_name, "account_type": "Other"}

    return {
        "account_name": classification.account_name,
        "account_type": classification.account_type.value,
    }


@router.post("")
async def create_or_update_classification(
    account_name: str,
    account_type: str,
    db: Session = Depends(get_session),
) -> dict[str, Any]:
    """Create or update an account classification.

    Args:
        account_name: Name of the account
        account_type: Type of account (Investment, Debt, Loan, Savings,
            Checking, Credit Card, Other)

    Returns:
        Created/updated classification
    """
    # Validate account type
    try:
        acc_type = AccountType(account_type)
    except ValueError:
        valid_types = ", ".join([t.value for t in AccountType])
        return {
            "error": f"Invalid account type. Must be one of: {valid_types}",
            "status": "error",
        }

    stmt = select(AccountClassification).where(AccountClassification.account_name == account_name)
    classification = db.execute(stmt).scalar()

    if classification:
        classification.account_type = acc_type
    else:
        classification = AccountClassification(
            account_name=account_name,
            account_type=acc_type,
        )
        db.add(classification)

    db.commit()
    db.refresh(classification)

    return {
        "account_name": classification.account_name,
        "account_type": classification.account_type.value,
        "status": "success",
    }


@router.delete("/{account_name}")
async def delete_classification(
    account_name: str,
    db: Session = Depends(get_session),
) -> dict[str, Any]:
    """Delete an account classification (resets to Other).

    Args:
        account_name: Name of the account

    Returns:
        Success status
    """
    stmt = select(AccountClassification).where(AccountClassification.account_name == account_name)
    classification = db.execute(stmt).scalar()

    if classification:
        db.delete(classification)
        db.commit()

    return {"status": "success", "message": f"Classification for {account_name} deleted"}


@router.get("/type/{account_type}")
async def get_accounts_by_type(
    account_type: str,
    db: Session = Depends(get_session),
) -> dict[str, Any]:
    """Get all accounts of a specific type.

    Args:
        account_type: Type of account to filter by

    Returns:
        List of account names with the specified type
    """
    try:
        acc_type = AccountType(account_type)
    except ValueError:
        valid_types = ", ".join([t.value for t in AccountType])
        return {
            "error": f"Invalid account type. Must be one of: {valid_types}",
            "status": "error",
        }

    stmt = select(AccountClassification).where(AccountClassification.account_type == acc_type)
    classifications = db.execute(stmt).scalars().all()

    return {
        "account_type": account_type,
        "accounts": [clf.account_name for clf in classifications],
    }
