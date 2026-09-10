"""Investment rebalancing must not count as new funding in persisted summaries."""

import json
from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from ledger_sync.core.analytics_engine import AnalyticsEngine
from ledger_sync.db.models import (
    FYSummary,
    MonthlySummary,
    Transaction,
    TransactionType,
    User,
    UserPreferences,
)


def test_fy_funding_excludes_internal_moves_and_monthly_flow_nets_withdrawals(
    test_db_session: Session,
    test_user: User,
) -> None:
    test_db_session.add(
        UserPreferences(
            user_id=test_user.id,
            investment_account_mappings=json.dumps({"Fund A": "mutual_funds", "Fund B": "stocks"}),
        ),
    )
    test_db_session.flush()
    transactions = [
        Transaction(
            user_id=test_user.id,
            transaction_id=f"investment-boundary-{index}",
            date=datetime(2025, 4, 10, tzinfo=UTC),
            type=TransactionType.TRANSFER,
            account=source,
            from_account=source,
            to_account=destination,
            amount=Decimal(amount),
            currency="INR",
            category="Transfer",
            source_file="synthetic.xlsx",
        )
        for index, (source, destination, amount) in enumerate(
            [
                ("Bank", "Fund A", "10000"),
                ("Fund A", "Fund B", "10000"),
                ("Fund B", "Bank", "4000"),
                ("Bank", "Wallet", "500"),
            ],
        )
    ]
    engine = AnalyticsEngine(test_db_session, user_id=test_user.id)
    engine._calculate_fy_summaries(transactions)
    engine._calculate_monthly_summaries(transactions)
    test_db_session.flush()

    fy = test_db_session.query(FYSummary).filter_by(user_id=test_user.id).one()
    monthly = test_db_session.query(MonthlySummary).filter_by(user_id=test_user.id).one()
    assert fy.investments_made == Decimal("10000")
    assert monthly.net_investment_flow == Decimal("-6000")
    assert monthly.total_income == Decimal("0")
    assert monthly.total_expenses == Decimal("0")
    assert monthly.net_savings == Decimal("0")
