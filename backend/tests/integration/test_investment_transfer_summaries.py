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


def _transfers(user_id: int, legs: list[tuple[str, str, str]]) -> list[Transaction]:
    return [
        Transaction(
            user_id=user_id,
            transaction_id=f"perimeter-{index}",
            date=datetime(2025, 5, 10, tzinfo=UTC),
            type=TransactionType.TRANSFER,
            account=source,
            from_account=source,
            to_account=destination,
            amount=Decimal(amount),
            currency="INR",
            category="Transfer",
            source_file="synthetic.xlsx",
        )
        for index, (source, destination, amount) in enumerate(legs)
    ]


def test_mapped_investment_accounts_match_the_exact_name_case_insensitively(
    test_db_session: Session,
    test_user: User,
) -> None:
    # The mapping names an ACCOUNT. A substring rule let "Groww" also claim the
    # user's "Groww Wallet" cash float, booking a wallet top-up as investing.
    test_db_session.add(
        UserPreferences(
            user_id=test_user.id,
            investment_account_mappings=json.dumps({"Groww": "mutual_funds"}),
        ),
    )
    test_db_session.flush()
    transactions = _transfers(
        test_user.id,
        [("Bank", "groww", "7000"), ("Bank", "Groww Wallet", "2500")],
    )
    engine = AnalyticsEngine(test_db_session, user_id=test_user.id)
    engine._calculate_fy_summaries(transactions)
    engine._calculate_monthly_summaries(transactions)
    test_db_session.flush()

    fy = test_db_session.query(FYSummary).filter_by(user_id=test_user.id).one()
    monthly = test_db_session.query(MonthlySummary).filter_by(user_id=test_user.id).one()
    assert fy.investments_made == Decimal("7000")
    assert monthly.net_investment_flow == Decimal("-7000")


def test_without_mappings_the_default_investment_keywords_apply(
    test_db_session: Session,
    test_user: User,
) -> None:
    # An unconfigured user used to report zero investing on every rollup,
    # because the mapping was empty and nothing else was consulted.
    test_db_session.add(UserPreferences(user_id=test_user.id))
    test_db_session.flush()
    transactions = _transfers(
        test_user.id,
        [("Bank", "Groww MF", "5000"), ("Bank", "Weird Broker Wallet", "900")],
    )
    engine = AnalyticsEngine(test_db_session, user_id=test_user.id)
    engine._calculate_fy_summaries(transactions)
    test_db_session.flush()

    fy = test_db_session.query(FYSummary).filter_by(user_id=test_user.id).one()
    # "rd" must not match inside "Weird": word boundaries, not substrings.
    assert fy.investments_made == Decimal("5000")
