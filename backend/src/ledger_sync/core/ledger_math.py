"""Pure account-balance and investment-transfer arithmetic.

Investment deltas are positive when money enters the configured investment
accounts and negative when it leaves. Transfers within that set cancel.
"""

from collections import defaultdict
from decimal import Decimal

from ledger_sync.db.models import Transaction, TransactionType


def investment_transfer_delta(
    amount: Decimal,
    *,
    source_is_investment: bool,
    destination_is_investment: bool,
) -> Decimal:
    """Return the signed contribution across the investment boundary."""
    return amount * (int(destination_is_investment) - int(source_is_investment))


def compute_account_balances(
    transactions: list[Transaction],
) -> dict[str, Decimal]:
    """Apply income, expenses, and both transfer legs without losing precision."""
    balances: dict[str, Decimal] = defaultdict(Decimal)
    for txn in transactions:
        amount = Decimal(str(txn.amount))
        if txn.type == TransactionType.TRANSFER:
            if txn.from_account:
                balances[txn.from_account] -= amount
            if txn.to_account:
                balances[txn.to_account] += amount
        elif txn.type == TransactionType.INCOME:
            balances[txn.account] += amount
        elif txn.type == TransactionType.EXPENSE:
            balances[txn.account] -= amount
    return balances
