"""Version lifecycle and selective/full rollup equivalence on isolated data."""

from __future__ import annotations

import json
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import event, select
from sqlalchemy.orm import Session

from ledger_sync.core.analytics import refresh
from ledger_sync.core.analytics.engine import AnalyticsEngine
from ledger_sync.core.analytics.refresh import (
    StaleAnalyticsRefreshError,
    analytics_is_current,
    get_analytics_state,
    mark_ledger_changed,
    mark_preferences_changed,
)
from ledger_sync.db.models import DailySummary, MonthlySummary, Transaction, TransactionType


def _transaction(
    user_id: int,
    key: str,
    day: str,
    amount: str = "100.01",
    *,
    kind: TransactionType = TransactionType.EXPENSE,
    account: str = "Cash",
    category: str = "Food",
    subcategory: str | None = None,
) -> Transaction:
    return Transaction(
        user_id=user_id,
        transaction_id=key,
        date=datetime.fromisoformat(day),  # stored naive IST wall clock
        amount=Decimal(amount),
        currency="INR",
        type=kind,
        account=account,
        category=category,
        subcategory=subcategory,
        source_file="fixture.csv",
        is_deleted=False,
    )


def _seed(session: Session, user_id: int) -> AnalyticsEngine:
    session.add_all(
        [
            _transaction(
                user_id, "jan-income", "2024-01-01", "500.01", kind=TransactionType.INCOME
            ),
            _transaction(user_id, "jan", "2024-01-02"),
            _transaction(user_id, "mar", "2024-03-03", "200.02"),
            _transaction(user_id, "jun", "2024-06-04", "300.03"),
            _transaction(user_id, "sep", "2024-09-05", "400.04"),
        ]
    )
    mark_ledger_changed(session, user_id)
    session.commit()
    engine = AnalyticsEngine(session, user_id)
    engine.refresh_analytics()
    return engine


def _summary_values(session: Session, user_id: int) -> dict:
    result = {}
    for model, key in ((DailySummary, "date"), (MonthlySummary, "period_key")):
        rows = session.scalars(select(model).where(model.user_id == user_id)).all()
        result[model.__tablename__] = {
            getattr(row, key): {
                col.name: getattr(row, col.name)
                for col in model.__table__.columns
                if col.name not in {"id", "user_id", "last_calculated"}
            }
            for row in rows
        }
    return result


@pytest.mark.parametrize(
    "change", ["insert", "edit_date", "edit_amount", "soft_delete", "hard_delete"]
)
def test_selective_equals_full_after_mutation(test_db_session, test_user, change):
    session = test_db_session
    engine = _seed(session, test_user.id)
    txn = session.scalar(select(Transaction).where(Transaction.transaction_id == "mar"))
    dates = [txn.date]
    if change == "insert":
        inserted = _transaction(test_user.id, "feb", "2024-02-11", "77.77")
        session.add(inserted)
        dates = [inserted.date]
    elif change == "edit_date":
        txn.date = datetime.fromisoformat("2024-02-11")
        dates.append(txn.date)
    elif change == "edit_amount":
        txn.amount = Decimal("99.99")
    elif change == "soft_delete":
        txn.is_deleted = True
    else:
        session.delete(txn)
    mark_ledger_changed(session, test_user.id, dates)
    session.commit()

    result = engine.refresh_analytics()
    assert result["refresh_mode"] == "selective_summaries"
    assert result["domain_modes"]["other_domains"] == "full"
    selective = _summary_values(session, test_user.id)
    engine.run_full_analytics()
    assert _summary_values(session, test_user.id) == selective
    assert analytics_is_current(get_analytics_state(session, test_user.id))


def test_only_changed_groups_and_next_populated_month_are_written(test_db_session, test_user):
    session = test_db_session
    engine = _seed(session, test_user.id)
    days = {r.date: (r.id, r.last_calculated) for r in session.scalars(select(DailySummary))}
    months = {
        r.period_key: (r.last_calculated, r.expense_change_pct)
        for r in session.scalars(select(MonthlySummary))
    }
    # Remove a complete month, making June compare to January across the gap.
    txn = session.scalar(select(Transaction).where(Transaction.transaction_id == "mar"))
    txn.is_deleted = True
    mark_ledger_changed(session, test_user.id, [txn.date])
    session.commit()
    engine.refresh_analytics()
    new_days = {r.date: (r.id, r.last_calculated) for r in session.scalars(select(DailySummary))}
    assert new_days == {key: value for key, value in days.items() if key != "2024-03-03"}
    new_months = {
        r.period_key: (r.last_calculated, r.expense_change_pct)
        for r in session.scalars(select(MonthlySummary))
    }
    assert new_months["2024-01"] == months["2024-01"]
    assert new_months["2024-09"] == months["2024-09"]
    assert new_months["2024-06"][1] == pytest.approx(200)


def test_preferences_force_full_and_reload_cached_classification(test_db_session, test_user):
    from ledger_sync.db.models import UserPreferences

    session = test_db_session
    engine = _seed(session, test_user.id)
    session.add_all(
        [
            _transaction(
                test_user.id,
                "loss",
                "2024-01-02",
                "33.33",
                category="Trading",
                subcategory="Loss",
            ),
            _transaction(test_user.id, "excluded", "2024-01-02", "55.55", account="Excluded"),
        ]
    )
    mark_ledger_changed(session, test_user.id, ["2024-01-02"])
    session.add(UserPreferences(user_id=test_user.id))
    session.commit()
    engine.refresh_analytics()
    prefs = session.scalar(select(UserPreferences).where(UserPreferences.user_id == test_user.id))
    prefs.capital_loss_categories = '["Trading::Loss"]'
    prefs.excluded_accounts = '["Excluded"]'
    prefs.essential_categories = '["Food"]'
    mark_preferences_changed(session, test_user.id)
    session.commit()
    assert not analytics_is_current(get_analytics_state(session, test_user.id))
    result = engine.refresh_analytics()
    assert result["refresh_mode"] == "full"
    jan = session.scalar(select(MonthlySummary).where(MonthlySummary.period_key == "2024-01"))
    assert jan.total_expenses == Decimal("100.01")
    assert jan.capital_losses == Decimal("33.33")
    assert jan.essential_expenses == Decimal("100.01")
    assert jan.net_savings == Decimal("366.67")
    day = session.scalar(select(DailySummary).where(DailySummary.date == "2024-01-02"))
    assert day.net == Decimal("-133.34")
    assert day.top_category == "Food"
    assert analytics_is_current(get_analytics_state(session, test_user.id))


def test_marks_are_transactional_coalesce_and_are_user_scoped(
    test_db_session, test_user, make_user
):
    session = test_db_session
    other = make_user("other-refresh@example.com")
    _seed(session, test_user.id)
    other_engine = AnalyticsEngine(session, other.id)
    other_engine.refresh_analytics()
    state = get_analytics_state(session, test_user.id)
    previous = state.ledger_version
    assert mark_ledger_changed(session, test_user.id, ["2024-01-02"]) == previous + 1
    mark_ledger_changed(session, test_user.id, ["2024-03-03", "2024-01-02"])
    session.flush()
    assert json.loads(state.dirty_dates) == ["2024-01-02", "2024-03-03"]
    assert analytics_is_current(get_analytics_state(session, other.id))
    session.rollback()
    assert get_analytics_state(session, test_user.id).ledger_version == previous
    assert analytics_is_current(get_analytics_state(session, test_user.id))


def test_current_refresh_skips_domains_and_force_rebuild_remains(
    test_db_session, test_user, monkeypatch
):
    engine = _seed(test_db_session, test_user.id)
    monkeypatch.setattr(engine, "_user_transaction_query", lambda: pytest.fail("unexpected scan"))
    assert engine.refresh_analytics()["refresh_mode"] == "skipped"
    monkeypatch.undo()
    assert engine.run_full_analytics()["refresh_mode"] == "full"


@pytest.mark.parametrize("scope", [None, [], "overflow"])
def test_unknown_or_large_scope_requests_full_rebuild(test_db_session, test_user, scope):
    session = test_db_session
    engine = _seed(session, test_user.id)
    if scope == "overflow":
        scope = (date(2024, 1, 1) + timedelta(days=i) for i in range(refresh.MAX_DIRTY_DATES + 5))
    mark_ledger_changed(session, test_user.id, scope)
    session.commit()
    state = get_analytics_state(session, test_user.id)
    assert state.full_rebuild_required
    assert state.dirty_dates == "[]"
    assert engine.refresh_analytics()["refresh_mode"] == "full"


def test_failure_keeps_published_rollups_and_dirty_generation(
    test_db_session, test_user, monkeypatch
):
    session = test_db_session
    engine = _seed(session, test_user.id)
    before = _summary_values(session, test_user.id)
    txn = session.scalar(select(Transaction).where(Transaction.transaction_id == "mar"))
    txn.amount = Decimal("999.99")
    mark_ledger_changed(session, test_user.id, [txn.date])
    session.commit()
    state = get_analytics_state(session, test_user.id)
    published = state.published_ledger_version

    def fail(_transactions):
        raise RuntimeError("fixture domain failed")

    monkeypatch.setattr(engine, "_calculate_category_trends", fail)
    with pytest.raises(RuntimeError, match="fixture domain failed"):
        engine.refresh_analytics()
    assert _summary_values(session, test_user.id) == before
    state = get_analytics_state(session, test_user.id)
    assert state.published_ledger_version == published
    assert state.ledger_version == published + 1
    assert not analytics_is_current(state)


def test_publication_guard_rejects_changed_target(test_db_session, test_user, monkeypatch):
    session = test_db_session
    engine = _seed(session, test_user.id)
    before = _summary_values(session, test_user.id)
    mark_ledger_changed(session, test_user.id, ["2024-01-02"])
    session.commit()
    original = engine._calculate_cohort_spending

    def invalidate_again(transactions):
        result = original(transactions)
        # Simulate a superseded target. Real writers serialize on the User lock.
        mark_preferences_changed(session, test_user.id)
        return result

    monkeypatch.setattr(engine, "_calculate_cohort_spending", invalidate_again)
    with pytest.raises(StaleAnalyticsRefreshError):
        engine.refresh_analytics()
    assert _summary_values(session, test_user.id) == before
    assert not analytics_is_current(get_analytics_state(session, test_user.id))


def test_algorithm_upgrade_rebuilds_and_old_worker_cannot_publish(
    test_db_session, test_user, monkeypatch
):
    session = test_db_session
    engine = _seed(session, test_user.id)
    monkeypatch.setattr(refresh, "ANALYTICS_ALGORITHM_VERSION", 2)
    assert engine.refresh_analytics()["refresh_mode"] == "full"
    assert get_analytics_state(session, test_user.id).published_algorithm_version == 2
    monkeypatch.setattr(refresh, "ANALYTICS_ALGORITHM_VERSION", 1)
    with pytest.raises(StaleAnalyticsRefreshError, match="newer analytics algorithm"):
        engine.run_full_analytics()


def test_monthly_existing_rows_are_loaded_in_one_query(test_db_session, test_user):
    session = test_db_session
    engine = _seed(session, test_user.id)
    transactions = engine._user_transaction_query().all()
    selects = []

    def record(_conn, _cursor, statement, _params, _context, _many):
        if statement.lstrip().upper().startswith("SELECT") and "monthly_summaries" in statement:
            selects.append(statement)

    event.listen(session.get_bind(), "before_cursor_execute", record)
    try:
        engine._calculate_monthly_summaries(transactions)
        session.flush()
    finally:
        event.remove(session.get_bind(), "before_cursor_execute", record)
    assert len(selects) == 1


def test_aware_dirty_dates_use_ist_month_boundary():
    assert refresh.ledger_date_key(datetime(2024, 3, 31, 20, 0, tzinfo=UTC)) == "2024-04-01"
    assert refresh.ledger_date_key(date(2024, 3, 31)) == "2024-03-31"


def test_new_ist_day_refreshes_clock_domains_without_rewriting_summaries(
    test_db_session, test_user, monkeypatch
):
    session = test_db_session
    engine = _seed(session, test_user.id)
    state = get_analytics_state(session, test_user.id)
    state.published_at = datetime.now(UTC) - timedelta(days=1)
    session.commit()
    assert refresh.analytics_inputs_current(state)
    assert not analytics_is_current(state)
    before = {r.date: r.last_calculated for r in session.scalars(select(DailySummary))}
    result = engine.refresh_analytics()
    assert result["refresh_mode"] == "clock_refresh"
    assert result["domain_modes"]["daily_summaries"] == "skipped"
    assert result["domain_modes"]["monthly_summaries"] == "skipped"
    assert result["domain_modes"]["other_domains"] == "full"
    assert {r.date: r.last_calculated for r in session.scalars(select(DailySummary))} == before
    assert analytics_is_current(get_analytics_state(session, test_user.id))

    # 20:00 UTC is already April 1 in the ledger.
    state.published_at = datetime(2024, 3, 31, 20, 0, tzinfo=UTC)
    monkeypatch.setattr(refresh, "ledger_today", lambda: date(2024, 4, 1))
    assert analytics_is_current(state)


def test_deleting_every_transaction_removes_all_summaries(test_db_session, test_user):
    session = test_db_session
    engine = _seed(session, test_user.id)
    rows = session.scalars(select(Transaction).where(Transaction.user_id == test_user.id)).all()
    mark_ledger_changed(session, test_user.id, [row.date for row in rows])
    for row in rows:
        session.delete(row)
    session.commit()
    engine.refresh_analytics()
    assert _summary_values(session, test_user.id) == {
        "daily_summaries": {},
        "monthly_summaries": {},
    }
    engine.run_full_analytics()
    assert _summary_values(session, test_user.id) == {
        "daily_summaries": {},
        "monthly_summaries": {},
    }


def test_refresh_reloads_preferences_loaded_before_user_lock(test_db_session, test_user):
    from ledger_sync.db.models import UserPreferences

    session = test_db_session
    session.add(UserPreferences(user_id=test_user.id))
    session.commit()
    engine = _seed(session, test_user.id)
    assert engine.excluded_accounts == set()
    # A separate writer may commit after construction but before refresh obtains
    # the User lock. An identity-mapped preferences object must not survive stale.
    with Session(session.get_bind()) as writer:
        prefs = writer.scalar(
            select(UserPreferences).where(UserPreferences.user_id == test_user.id)
        )
        prefs.excluded_accounts = '["Cash"]'
        mark_preferences_changed(writer, test_user.id)
        writer.commit()
    engine.refresh_analytics()
    assert _summary_values(session, test_user.id)["monthly_summaries"] == {}


def test_selective_refresh_drops_prelock_cached_monthly_predecessor(test_db_session, test_user):
    session = test_db_session
    engine = _seed(session, test_user.id)
    cached_january = session.scalar(
        select(MonthlySummary).where(MonthlySummary.period_key == "2024-01")
    )
    with Session(session.get_bind()) as writer:
        january = writer.scalar(select(Transaction).where(Transaction.transaction_id == "jan"))
        january.amount = Decimal("111.11")
        mark_ledger_changed(writer, test_user.id, [january.date])
        writer.commit()
        AnalyticsEngine(writer, test_user.id).refresh_analytics()
        march = writer.scalar(select(Transaction).where(Transaction.transaction_id == "mar"))
        march.amount = Decimal("150.00")
        mark_ledger_changed(writer, test_user.id, [march.date])
        writer.commit()
    assert cached_january.total_expenses == Decimal("100.01")
    engine.refresh_analytics()
    selective = _summary_values(session, test_user.id)
    engine.run_full_analytics()
    assert _summary_values(session, test_user.id) == selective
