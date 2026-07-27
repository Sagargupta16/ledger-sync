"""Net-worth bucketing is driven by the ``AccountType`` enum, not string literals.

``_assign_balance_to_bucket`` used to test ``account_type in ("Loans", "Loans/Lended")``.
``"Loans"`` is not a value any enum member serializes to -- ``AccountType.LOANS`` is
``"Loans/Lended"`` -- and no migration ever wrote it, so half that test was dead.
The comparisons now go through ``AccountType`` members, which cannot drift from the
vocabulary the API serves.

The parametrised case list is built FROM ``AccountType`` so a new enum member shows
up as a missing case here rather than as a balance silently landing in
``other_assets``.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from ledger_sync.core.analytics_engine import AnalyticsEngine
from ledger_sync.db.base import Base
from ledger_sync.db.models import AccountType

#: Which bucket each account type feeds, split by balance sign. ``None`` means the
#: balance is dropped (a credit card in credit is not an asset).
_POSITIVE_BUCKET: dict[AccountType, str] = {
    AccountType.CASH: "cash_and_bank",
    AccountType.BANK_ACCOUNTS: "cash_and_bank",
    AccountType.CREDIT_CARDS: "",
    AccountType.INVESTMENTS: "other_assets",
    AccountType.LOANS: "other_assets",
    AccountType.OTHER_WALLETS: "other_assets",
}

_NEGATIVE_BUCKET: dict[AccountType, str] = {
    AccountType.CASH: "cash_and_bank",
    AccountType.BANK_ACCOUNTS: "cash_and_bank",
    AccountType.CREDIT_CARDS: "credit_card_outstanding",
    AccountType.INVESTMENTS: "other_assets",
    AccountType.LOANS: "loans_payable",
    AccountType.OTHER_WALLETS: "other_assets",
}


@pytest.fixture
def session() -> Session:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    yield db
    db.close()


def _buckets(session: Session, account_type_value: str, balance: str) -> dict[str, Decimal]:
    engine = AnalyticsEngine(session, user_id=1)
    return engine._categorize_account_balances(
        {"Acct": Decimal(balance)},
        {"Acct": account_type_value},
    )


def test_every_account_type_is_covered_by_the_case_maps() -> None:
    """A new enum member must be given a bucket, not fall into ``other_assets``."""
    assert set(_POSITIVE_BUCKET) == set(AccountType)
    assert set(_NEGATIVE_BUCKET) == set(AccountType)


@pytest.mark.parametrize("account_type", list(AccountType))
def test_positive_balance_lands_in_its_bucket(session: Session, account_type: AccountType) -> None:
    buckets = _buckets(session, account_type.value, "1000")
    expected = _POSITIVE_BUCKET[account_type]
    if not expected:
        # A credit card in credit contributes nothing; it is not an asset.
        assert sum(buckets.values()) == Decimal(0)
        return
    assert buckets[expected] == Decimal("1000")
    assert sum(buckets.values()) == Decimal("1000")


@pytest.mark.parametrize("account_type", list(AccountType))
def test_negative_balance_lands_in_its_bucket(session: Session, account_type: AccountType) -> None:
    buckets = _buckets(session, account_type.value, "-1000")
    expected = _NEGATIVE_BUCKET[account_type]
    # Liability buckets store the magnitude; asset buckets keep the sign.
    is_liability = expected in {"credit_card_outstanding", "loans_payable"}
    assert buckets[expected] == (Decimal("1000") if is_liability else Decimal("-1000"))


def test_loans_lended_is_the_only_loan_vocabulary_on_the_wire(session: Session) -> None:
    """``"Loans"`` is not an enum value, so it must not reach ``loans_payable``."""
    assert AccountType.LOANS.value == "Loans/Lended"
    assert "Loans" not in {member.value for member in AccountType}

    real = _buckets(session, AccountType.LOANS.value, "-5000")
    assert real["loans_payable"] == Decimal("5000")
    assert real["other_assets"] == Decimal(0)

    # An unrecognised type is not a loan: it falls to other_assets like any other
    # unclassified account, magnitude and sign intact.
    drifted = _buckets(session, "Loans", "-5000")
    assert drifted["loans_payable"] == Decimal(0)
    assert drifted["other_assets"] == Decimal("-5000")


def test_unclassified_account_defaults_to_other_wallets(session: Session) -> None:
    """No classification row -> the enum's own default, not a bare literal."""
    engine = AnalyticsEngine(session, user_id=1)
    buckets = engine._categorize_account_balances({"Acct": Decimal("700")}, {})
    assert buckets["other_assets"] == Decimal("700")
