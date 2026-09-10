"""Balance conservation and investment-boundary regression cases."""

from decimal import Decimal

import pytest

from ledger_sync.core.ledger_math import compute_account_balances, investment_transfer_delta
from ledger_sync.db.models import Transaction, TransactionType


@pytest.mark.parametrize(
    ("source_is_investment", "destination_is_investment", "expected"),
    [
        (False, False, "0"),
        (False, True, "100.25"),
        (True, False, "-100.25"),
        (True, True, "0"),
    ],
)
def test_investment_transfer_boundary(
    source_is_investment: bool,
    destination_is_investment: bool,
    expected: str,
) -> None:
    assert investment_transfer_delta(
        Decimal("100.25"),
        source_is_investment=source_is_investment,
        destination_is_investment=destination_is_investment,
    ) == Decimal(expected)


def test_internal_transfers_conserve_balances_and_decimal_precision() -> None:
    transactions = [
        Transaction(type=TransactionType.INCOME, account="Bank", amount=Decimal("10000.30")),
        Transaction(
            type=TransactionType.TRANSFER,
            account="Bank",
            from_account="Bank",
            to_account="Fund A",
            amount=Decimal("10000.10"),
        ),
        Transaction(
            type=TransactionType.TRANSFER,
            account="Fund A",
            from_account="Fund A",
            to_account="Fund B",
            amount=Decimal("10000.10"),
        ),
        Transaction(
            type=TransactionType.TRANSFER,
            account="Fund B",
            from_account="Fund B",
            to_account="Bank",
            amount=Decimal("4000"),
        ),
        Transaction(type=TransactionType.EXPENSE, account="Bank", amount=Decimal("0.10")),
    ]
    balances = compute_account_balances(transactions)

    assert balances == {
        "Bank": Decimal("4000.10"),
        "Fund A": Decimal("0"),
        "Fund B": Decimal("6000.10"),
    }
    assert sum(balances.values()) == Decimal("10000.20")
