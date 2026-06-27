"""Unit tests for investment-holding aggregation.

Regression coverage for the real-data finding that income-funded investment
accounts (EPF contributions, RSU vesting -- which arrive as INCOME credited to
the account, not as transfers) were booked as 100% "realized gains" on zero
invested principal, and then hidden by an `is_active = invested > 0` filter.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from ledger_sync.core._analytics_helpers import aggregate_holdings_data
from ledger_sync.db.models import Transaction, TransactionType

INVESTMENT_ACCOUNTS = {"EPF", "Stocks: Groww", "Mutual Funds: Groww"}


def is_inv(account: str | None) -> bool:
    return account in INVESTMENT_ACCOUNTS


def tx(
    amount: float | str,
    type: TransactionType,
    account: str = "Cash",
    from_account: str | None = None,
    to_account: str | None = None,
) -> Transaction:
    return Transaction(
        amount=Decimal(str(amount)),
        type=type,
        date=datetime(2025, 6, 15, tzinfo=UTC),
        category="X",
        subcategory="",
        account=account,
        from_account=from_account,
        to_account=to_account,
        currency="INR",
        note="",
    )


def _holding(account: str, data: dict) -> dict:
    """Apply the same principal/current/active model net_worth.py uses."""
    transfer_invested = data["invested"]
    account_flow = data["income"] - data["expense"]
    current_value = transfer_invested + account_flow
    invested = transfer_invested + max(account_flow, Decimal(0))
    return {
        "invested": invested,
        "current_value": current_value,
        "is_active": current_value > 0,
    }


def test_transfer_funded_account_principal_is_net_transfers():
    txns = [
        tx(100000, TransactionType.TRANSFER, from_account="Bank", to_account="Mutual Funds: Groww"),
        tx(20000, TransactionType.TRANSFER, from_account="Mutual Funds: Groww", to_account="Bank"),
    ]
    data = aggregate_holdings_data(txns, is_inv)["Mutual Funds: Groww"]
    h = _holding("Mutual Funds: Groww", data)
    assert h["invested"] == Decimal(80000)  # 100k in - 20k out
    assert h["current_value"] == Decimal(80000)
    assert h["is_active"] is True


def test_income_funded_account_counts_as_principal_not_gains():
    # EPF contributions arrive as INCOME on the EPF account, zero transfers.
    txns = [
        tx(3600, TransactionType.INCOME, account="EPF"),
        tx(3600, TransactionType.INCOME, account="EPF"),
    ]
    data = aggregate_holdings_data(txns, is_inv)["EPF"]
    h = _holding("EPF", data)
    # Principal = the contributions (7200), NOT 0; current value = 7200.
    assert h["invested"] == Decimal(7200)
    assert h["current_value"] == Decimal(7200)
    # The old `invested > 0` test hid this real holding; it must be active now.
    assert h["is_active"] is True


def test_withdrawals_reduce_current_value_below_invested():
    # Bought 100k via transfer, sold 30k back out (expense booked on account).
    txns = [
        tx(100000, TransactionType.TRANSFER, from_account="Bank", to_account="Stocks: Groww"),
        tx(30000, TransactionType.EXPENSE, account="Stocks: Groww"),
    ]
    data = aggregate_holdings_data(txns, is_inv)["Stocks: Groww"]
    h = _holding("Stocks: Groww", data)
    assert h["invested"] == Decimal(100000)
    assert h["current_value"] == Decimal(70000)  # 100k - 30k withdrawn
    assert h["is_active"] is True


def test_non_investment_account_is_ignored():
    txns = [tx(5000, TransactionType.INCOME, account="Salary Bank")]
    assert "Salary Bank" not in aggregate_holdings_data(txns, is_inv)
