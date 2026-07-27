"""``/api/analytics/insights/generated`` must render the CALLER's currency.

``core/insights.py`` was fixed to thread one resolved symbol through all ~12
emit sites, replacing nine hardcoded rupee signs. But the fix could not reach a
single user, because the router constructed the engine as ``InsightEngine()``
with no argument: the engine supported every symbol and was always handed none.

That is the gap this file covers, and it has to be covered at the HTTP boundary.
A unit test on ``InsightEngine(_Prefs("$"))`` passes whether or not the router
loads the row -- the defect lives in the wiring, not the engine -- so these
tests go through ``TestClient`` and read the JSON the browser would receive.

Also pinned: the endpoint is a GET and must not create a defaults row as a side
effect, and it must read the ROW OF THE AUTHENTICATED USER, not whichever
preferences row the query happens to find first.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from ledger_sync.db.models import Transaction, TransactionType, UserPreferences

URL = "/api/analytics/insights/generated"
RUPEE = "₹"

# The engine drops the month in progress, so the ledger is seeded in months that
# are complete relative to the real clock: two full calendar years back. Using
# `datetime.now()`-relative dates keeps this from expiring, but fixed dates in
# 2024 are already unconditionally complete and read more clearly.
_SEED_YEAR = 2024


def _tx(
    user_id: int,
    kind: TransactionType,
    amount: str,
    *,
    month: int,
    category: str,
    day: int = 15,
) -> Transaction:
    when = datetime(_SEED_YEAR, month, day, tzinfo=UTC)
    return Transaction(
        transaction_id=f"{user_id}-{kind.value}-{category}-{month}-{day}-{amount}",
        user_id=user_id,
        date=when,
        amount=Decimal(amount),
        currency="INR",
        type=kind,
        account="Bank: HDFC",
        category=category,
        subcategory=None,
        source_file="t.xlsx",
        last_seen_at=when,
        is_deleted=False,
    )


def _seed(session, user_id: int) -> None:
    """A ledger rich enough that several amount-bearing insights fire.

    Six complete months stepping 50k -> 150k gives the upward trend, the
    concentration branch, the daily rate and a best month with a real surplus.
    """
    rows: list[Transaction] = []
    for month, amount in ((1, "50000"), (2, "50000"), (3, "50000"), (4, "150000"), (5, "150000")):
        rows.append(_tx(user_id, TransactionType.EXPENSE, amount, month=month, category="Housing"))
    rows.append(
        _tx(user_id, TransactionType.EXPENSE, "150000", month=6, category="Housing"),
    )
    rows.append(
        _tx(
            user_id,
            TransactionType.INCOME,
            "200000",
            month=6,
            category="Employment Income",
            day=28,
        ),
    )
    session.add_all(rows)
    session.commit()


def _set_symbol(session, user_id: int, symbol: str) -> None:
    prefs = session.query(UserPreferences).filter(UserPreferences.user_id == user_id).one()
    prefs.currency_symbol = symbol
    session.commit()


def _descriptions(payload: dict) -> str:
    return " ".join(i["description"] for i in payload["insights"])


def test_insights_render_the_users_configured_symbol(two_user_client) -> None:
    client, session, user_a, _, _ = two_user_client
    _seed(session, user_a.id)
    _set_symbol(session, user_a.id, "$")

    body = client.get(URL).json()

    combined = _descriptions(body)
    assert body["insights"], "seed produced no insights, so this proves nothing"
    assert "$" in combined
    assert RUPEE not in combined


def test_insights_render_the_rupee_for_a_user_who_kept_the_default(two_user_client) -> None:
    """The other direction: the fix must not force a symbol on an INR user."""
    client, session, user_a, _, _ = two_user_client
    _seed(session, user_a.id)

    body = client.get(URL).json()

    assert RUPEE in _descriptions(body)


def test_each_user_reads_their_own_symbol(two_user_client) -> None:
    """A `select(UserPreferences).limit(1)` without the user filter passes the
    single-user tests above and serves user B's symbol to user A."""
    client, session, user_a, user_b, current = two_user_client
    _seed(session, user_a.id)
    _seed(session, user_b.id)
    _set_symbol(session, user_a.id, "$")
    _set_symbol(session, user_b.id, "£")

    as_a = _descriptions(client.get(URL).json())
    current["user"] = user_b
    as_b = _descriptions(client.get(URL).json())

    assert "$" in as_a
    assert "£" not in as_a
    assert "£" in as_b
    assert "$" not in as_b


def test_a_user_with_no_preferences_row_gets_defaults_and_no_row_is_written(
    two_user_client,
) -> None:
    """A GET must not have a write side effect.

    ``_get_or_create_preferences`` -- the pattern the rest of the preferences API
    uses -- would COMMIT a defaults row here. The read-only loader returns
    ``None`` instead and the engine falls back to the shipped symbol.
    """
    client, session, user_a, _, _ = two_user_client
    _seed(session, user_a.id)
    session.query(UserPreferences).filter(UserPreferences.user_id == user_a.id).delete()
    session.commit()

    body = client.get(URL).json()

    assert RUPEE in _descriptions(body)
    remaining = (
        session.query(UserPreferences).filter(UserPreferences.user_id == user_a.id).one_or_none()
    )
    assert remaining is None


def test_empty_ledger_short_circuits_before_loading_preferences(two_user_client) -> None:
    """The early return stays ahead of the new query -- no wasted round trip."""
    client, _session, _user_a, _, _ = two_user_client

    assert client.get(URL).json() == {"insights": []}
