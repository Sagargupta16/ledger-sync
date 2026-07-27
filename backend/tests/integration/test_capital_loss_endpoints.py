"""HTTP-boundary tests for the realised-capital-loss split and the TRANSFER guard.

Three endpoint behaviours are pinned here, all of which were wrong at the
boundary rather than in the engine:

1. ``/api/calculations/category-breakdown`` and ``/top-categories`` LEAKED
   TRANSFER rows into an expense ranking whenever ``transaction_type`` was
   omitted. Transfers are 66% of rupee volume on a real ledger (the same rupee
   written twice, once leaving the bank and once arriving at the broker), so the
   "top spending categories" list was topped by money the user never spent.
2. ``/api/calculations/{totals,monthly-aggregation,yearly-aggregation}`` report a
   classified realised loss under its own ``capital_losses`` key instead of
   inside ``expense``. It still lowers ``net_savings`` (the cash left) but not
   ``savings_rate`` (nothing was consumed).
3. ``/api/analytics/v2/data-health`` SURFACES loss-looking taxonomies as
   candidates rather than reclassifying them. The rows are typed EXPENSE in the
   user's own ledger; only they can confirm, and confirming moves their
   historical totals.

Every test also asserts the default-off direction where it applies: with
``capital_loss_categories`` empty, responses are identical to the pre-preference
behaviour.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

import pytest

from ledger_sync.core.analytics.engine import AnalyticsEngine
from ledger_sync.db.models import Transaction, TransactionType, UserPreferences

LOSS_CATEGORY = "Investment Expenses"
LOSS_SUBCATEGORY = "F&O Loss"
LOSS_KEY = f"{LOSS_CATEGORY}::{LOSS_SUBCATEGORY}"

TOTALS_URL = "/api/calculations/totals"
MONTHLY_URL = "/api/calculations/monthly-aggregation"
BREAKDOWN_URL = "/api/calculations/category-breakdown"
TOP_URL = "/api/calculations/top-categories"
HEALTH_URL = "/api/analytics/v2/data-health"
OVERVIEW_URL = "/api/analytics/overview"
TRENDS_CHART_URL = "/api/analytics/charts/monthly-trends"
INC_EXP_CHART_URL = "/api/analytics/charts/income-expense"


def _txn(
    user_id: int,
    txn_type: TransactionType,
    amount: str,
    *,
    category: str,
    subcategory: str | None = None,
    account: str = "Bank: HDFC",
    to_account: str | None = None,
    day: int = 5,
) -> Transaction:
    when = datetime(2024, 12, day, tzinfo=UTC)
    return Transaction(
        transaction_id=f"{user_id}-{txn_type.value}-{category}-{subcategory}-{amount}-{day}",
        user_id=user_id,
        date=when,
        amount=Decimal(amount),
        currency="INR",
        type=txn_type,
        account=account,
        category=category,
        subcategory=subcategory,
        from_account=account if txn_type == TransactionType.TRANSFER else None,
        to_account=to_account,
        source_file="t.xlsx",
        last_seen_at=when,
        is_deleted=False,
    )


def _classify(session, user_id: int, keys: str) -> None:
    """Set ``capital_loss_categories`` for *user_id*."""
    prefs = session.query(UserPreferences).filter(UserPreferences.user_id == user_id).one()
    prefs.capital_loss_categories = keys
    session.commit()


def _build_rollups(session, user_id: int) -> None:
    """Populate ``monthly_summaries`` so ``/totals`` takes its FAST path.

    The fast path only triggers when ``total_transactions > 0`` in the rollup
    table, which no test previously arranged, so every ``/totals`` assertion fell
    through to the raw-row fallback and the fast-path SQL was never executed.
    """
    AnalyticsEngine(session, user_id=user_id)._calculate_monthly_summaries()
    session.commit()


def _seed_ledger(session, user_id: int) -> None:
    session.add_all(
        [
            _txn(
                user_id,
                TransactionType.INCOME,
                "170458.40",
                category="Employment Income",
                subcategory="Salary",
                day=1,
            ),
            _txn(user_id, TransactionType.EXPENSE, "30000", category="Housing", day=3),
            _txn(user_id, TransactionType.EXPENSE, "14639.68", category="Food & Dining", day=4),
            _txn(
                user_id,
                TransactionType.EXPENSE,
                "102789.41",
                category=LOSS_CATEGORY,
                subcategory=LOSS_SUBCATEGORY,
                account="Stocks: Groww",
                day=31,
            ),
            # The transfer that used to top the "spending" ranking: one rupee
            # written twice, moving between two accounts the user owns.
            _txn(
                user_id,
                TransactionType.TRANSFER,
                "500000",
                category="Transfer: Bank: HDFC -> Stocks: Groww",
                to_account="Stocks: Groww",
                day=10,
            ),
        ]
    )
    session.commit()


# --- finding 5: TRANSFER leak into expense rankings --------------------------


def test_category_breakdown_omits_transfers_when_type_is_unspecified(two_user_client) -> None:
    client, session, user_a, _, _ = two_user_client
    _seed_ledger(session, user_a.id)

    body = client.get(BREAKDOWN_URL).json()

    # The 500,000 transfer is not spending and must not appear at all, let alone
    # as the largest "expense category".
    assert not any("Transfer" in name for name in body["categories"])
    # It also must not inflate the denominator every percentage is computed from.
    assert body["total"] == pytest.approx(147429.09)
    assert max(c["total"] for c in body["categories"].values()) < 500000


def test_top_categories_omits_transfers_when_type_is_unspecified(two_user_client) -> None:
    client, session, user_a, _, _ = two_user_client
    _seed_ledger(session, user_a.id)

    rows = client.get(TOP_URL).json()
    names = {row["category"] for row in rows}

    assert names
    assert not any("Transfer" in name for name in names)
    # Percentages are shares of spending, so they must sum to 100 here.
    assert sum(row["percentage"] for row in rows) == pytest.approx(100.0)


def test_explicit_income_type_still_selects_income(two_user_client) -> None:
    # The defaulting must not become a hardcode: asking for Income has to still
    # return income, otherwise the fix breaks the /income pages.
    client, session, user_a, _, _ = two_user_client
    _seed_ledger(session, user_a.id)

    body = client.get(BREAKDOWN_URL, params={"transaction_type": "Income"}).json()

    assert set(body["categories"]) == {"Employment Income"}


# --- finding 1/6: the totals split ------------------------------------------


def test_totals_unclassified_loss_keeps_pre_preference_numbers(two_user_client) -> None:
    client, session, user_a, _, _ = two_user_client
    _seed_ledger(session, user_a.id)

    body = client.get(TOTALS_URL).json()

    # 30000 + 14639.68 + 102789.41. Nothing moved because nothing is classified.
    assert body["total_expenses"] == pytest.approx(147429.09)
    assert body["capital_losses"] == 0
    assert body["net_savings"] == pytest.approx(23029.31)


def test_totals_classified_loss_leaves_expenses_but_not_net_savings(two_user_client) -> None:
    client, session, user_a, _, _ = two_user_client
    _seed_ledger(session, user_a.id)
    _classify(session, user_a.id, f'["{LOSS_KEY}"]')

    body = client.get(TOTALS_URL).json()

    assert body["total_expenses"] == pytest.approx(44639.68)
    assert body["capital_losses"] == pytest.approx(102789.41)
    # income - expenses - losses: unchanged, because the cash really left. The
    # split re-labels the money, it does not make it reappear.
    assert body["net_savings"] == pytest.approx(23029.31)
    # ``savings_rate`` stays net/income for the same reason, so the rate and the
    # net on one payload never disagree. The "what share did I CONSUME" question
    # is answered by ``expense_ratio`` on monthly-summaries, not here -- see
    # ``_totals_payload`` in api/calculations.py.
    assert body["savings_rate"] == pytest.approx(23029.31 / 170458.40 * 100)


def test_monthly_aggregation_reports_the_loss_separately(two_user_client) -> None:
    client, session, user_a, _, _ = two_user_client
    _seed_ledger(session, user_a.id)
    _classify(session, user_a.id, f'["{LOSS_KEY}"]')

    # start_date forces the raw-transaction fallback path rather than the
    # monthly_summaries fast path, which is where expense_sum_col is used.
    month = client.get(MONTHLY_URL, params={"start_date": "2024-01-01"}).json()["2024-12"]

    assert month["expense"] == pytest.approx(44639.68)
    assert month["capital_losses"] == pytest.approx(102789.41)
    assert month["net_savings"] == pytest.approx(23029.31)


def test_totals_fallback_and_fast_path_agree(two_user_client) -> None:
    # The fast path reads monthly_summaries and the fallback recomputes from raw
    # rows with two different SQL shapes. They must not disagree, or a user sees
    # their expense total change simply for having picked a date range.
    client, session, user_a, _, _ = two_user_client
    _seed_ledger(session, user_a.id)
    _classify(session, user_a.id, f'["{LOSS_KEY}"]')

    fallback = client.get(TOTALS_URL, params={"start_date": "2024-01-01"}).json()

    assert fallback["total_expenses"] == pytest.approx(44639.68)
    assert fallback["capital_losses"] == pytest.approx(102789.41)


def test_loss_split_is_user_scoped(two_user_client) -> None:
    # user_b classified nothing, so their identical ledger must be untouched by
    # user_a's preference.
    client, session, user_a, user_b, current = two_user_client
    _seed_ledger(session, user_a.id)
    _seed_ledger(session, user_b.id)
    _classify(session, user_a.id, f'["{LOSS_KEY}"]')

    assert client.get(TOTALS_URL).json()["capital_losses"] == pytest.approx(102789.41)

    current["user"] = user_b
    body = client.get(TOTALS_URL).json()
    assert body["capital_losses"] == 0
    assert body["total_expenses"] == pytest.approx(147429.09)


# --- finding 4 ported: detection is surfaced, never applied ------------------


def test_data_health_surfaces_loss_candidates_without_reclassifying(two_user_client) -> None:
    client, session, user_a, _, _ = two_user_client
    _seed_ledger(session, user_a.id)

    health = client.get(HEALTH_URL).json()
    candidates = health["capital_loss_candidates"]

    assert [c["key"] for c in candidates] == [LOSS_KEY]
    assert candidates[0]["transaction_count"] == 1
    assert health["capital_loss_candidate_amount"] == pytest.approx(102789.41)

    # The signal fired, and the money has NOT moved. This is the whole contract:
    # detection prompts the user, it never rewrites their history.
    assert client.get(TOTALS_URL).json()["total_expenses"] == pytest.approx(147429.09)


def test_candidate_disappears_once_classified(two_user_client) -> None:
    client, session, user_a, _, _ = two_user_client
    _seed_ledger(session, user_a.id)
    _classify(session, user_a.id, f'["{LOSS_KEY}"]')

    health = client.get(HEALTH_URL).json()

    assert health["capital_loss_candidates"] == []
    assert health["capital_loss_candidate_count"] == 0


def test_brokerage_fee_is_never_offered_as_a_candidate(two_user_client) -> None:
    # A fee is real spending. Offering it would invite the user to understate
    # their own expenses, which is the dangerous direction of this error.
    client, session, user_a, _, _ = two_user_client
    session.add(
        _txn(
            user_a.id,
            TransactionType.EXPENSE,
            "354.20",
            category=LOSS_CATEGORY,
            subcategory="Brokerage Charges",
            account="Stocks: Groww",
        )
    )
    session.commit()

    health = client.get(HEALTH_URL).json()

    assert health["capital_loss_candidates"] == []


def test_candidates_are_user_scoped(two_user_client) -> None:
    client, session, user_a, user_b, current = two_user_client
    _seed_ledger(session, user_a.id)

    current["user"] = user_b
    health = client.get(HEALTH_URL).json()

    assert health["capital_loss_candidates"] == []


# --- the preference API ------------------------------------------------------


def test_preference_round_trips_through_its_own_endpoint(two_user_client) -> None:
    client, session, user_a, _, _ = two_user_client
    _seed_ledger(session, user_a.id)

    # Ships empty, so the app behaves exactly as before for every existing user.
    assert client.get("/api/preferences/").json()["capital_loss_categories"] == []

    written = client.put(
        "/api/preferences/capital-loss-categories",
        json={"capital_loss_categories": [LOSS_KEY]},
    )
    assert written.status_code == 200
    assert written.json()["capital_loss_categories"] == [LOSS_KEY]

    # And it takes effect on the money endpoints without a further step.
    assert client.get(TOTALS_URL).json()["capital_losses"] == pytest.approx(102789.41)
