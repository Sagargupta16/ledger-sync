"""Analytics and AI read account authority through historical case/alias labels."""

from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import select

from ledger_sync.api.ai_tools_impl.transactions import _exec_list_accounts
from ledger_sync.core.analytics_engine import AnalyticsEngine
from ledger_sync.db.models import (
    AccountType,
    LedgerAccountAlias,
    NetWorthSnapshot,
    Transaction,
    TransactionType,
    TransferFlow,
)
from ledger_sync.services.account_settings import set_account_type


def test_net_worth_flows_and_ai_use_authoritative_account_types(two_user_client):
    _, db, user, other, _ = two_user_client
    card, _ = set_account_type(db, user.id, "Card", AccountType.CREDIT_CARDS)
    set_account_type(db, user.id, "Bank", AccountType.BANK_ACCOUNTS)
    set_account_type(db, other.id, "Card", AccountType.CASH)
    db.add(
        LedgerAccountAlias(
            user_id=user.id, account_id=card.id, source_key="old card", label="Old Card"
        )
    )
    now = datetime(2026, 9, 1, tzinfo=UTC).replace(tzinfo=None)
    db.add_all(
        [
            Transaction(
                transaction_id="income",
                user_id=user.id,
                date=now,
                amount=Decimal("100"),
                currency="INR",
                type=TransactionType.INCOME,
                account="BANK",
                category="Salary",
                source_file="account-tests",
            ),
            Transaction(
                transaction_id="expense",
                user_id=user.id,
                date=now,
                amount=Decimal("50"),
                currency="INR",
                type=TransactionType.EXPENSE,
                account="OLD CARD",
                category="Food",
                source_file="account-tests",
            ),
            Transaction(
                transaction_id="transfer",
                user_id=user.id,
                date=now,
                amount=Decimal("10"),
                currency="INR",
                type=TransactionType.TRANSFER,
                account="BANK",
                category="Transfer",
                from_account="BANK",
                to_account="OLD CARD",
                source_file="account-tests",
            ),
        ]
    )
    db.commit()
    engine = AnalyticsEngine(db, user_id=user.id)
    result = engine._calculate_net_worth_snapshot()
    assert result["total_assets"] == 90
    assert result["total_liabilities"] == 40
    assert result["net_worth"] == 50
    assert engine._calculate_transfer_flows() == 1
    db.flush()
    snapshot = db.scalar(select(NetWorthSnapshot).where(NetWorthSnapshot.user_id == user.id))
    assert snapshot.cash_and_bank == Decimal("90")
    assert snapshot.credit_card_outstanding == Decimal("40")
    flow = db.scalar(select(TransferFlow).where(TransferFlow.user_id == user.id))
    assert flow.from_account_type == "Bank Accounts"
    assert flow.to_account_type == "Credit Cards"
    ai_accounts = _exec_list_accounts(user, db, {})["accounts"]
    assert {account["name"]: account["type"] for account in ai_accounts} == {
        "BANK": "Bank Accounts",
        "OLD CARD": "Credit Cards",
    }
    assert db.get(Transaction, "expense").account == "OLD CARD"
