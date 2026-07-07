"""Unit tests for the categorization rule engine (core/rules.py).

Covers match_rule semantics (case-insensitive substring, field selection,
empty patterns), apply_rules_to_row (first-match-wins, transfer exemption,
subcategory clearing), and load_active_rules ordering/filtering.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from ledger_sync.core.rules import apply_rules_to_row, load_active_rules, match_rule
from ledger_sync.db.models import CategorizationRule, User


def _rule(
    pattern: str,
    category: str,
    *,
    match_field: str = "note",
    subcategory: str | None = None,
) -> CategorizationRule:
    """Build an unpersisted rule for pure matching tests."""
    return CategorizationRule(
        match_field=match_field,
        pattern=pattern,
        category=category,
        subcategory=subcategory,
    )


def _row(
    note: str | None = None,
    account: str = "HDFC",
    *,
    is_transfer: bool = False,
    category: str = "Misc",
    subcategory: str | None = "Old Sub",
) -> dict[str, Any]:
    return {
        "note": note,
        "account": account,
        "category": category,
        "subcategory": subcategory,
        "is_transfer": is_transfer,
    }


def _persist_rule(
    session: Session,
    user: User,
    pattern: str,
    category: str,
    *,
    sort_order: int = 0,
    is_active: bool = True,
) -> CategorizationRule:
    rule = CategorizationRule(
        user_id=user.id,
        match_field="note",
        pattern=pattern,
        category=category,
        subcategory=None,
        is_active=is_active,
        sort_order=sort_order,
    )
    session.add(rule)
    session.commit()
    return rule


def test_match_is_case_insensitive_substring() -> None:
    rule = _rule("SWIGGY", "Food")

    assert match_rule(rule, "UPI-swiggy-food", None) is True
    assert match_rule(rule, "no delivery apps here", None) is False


def test_first_match_wins_by_sort_order_then_id(test_db_session: Session, test_user: User) -> None:
    # Lower sort_order wins even when inserted later.
    later_but_first = _persist_rule(test_db_session, test_user, "swiggy", "Winner", sort_order=0)
    _persist_rule(test_db_session, test_user, "swiggy", "Loser", sort_order=1)

    rules = load_active_rules(test_db_session, test_user.id)
    row = _row(note="swiggy order")
    assert apply_rules_to_row(rules, row) is True
    assert row["category"] == later_but_first.category == "Winner"

    # Tie on sort_order: lower id (inserted first) wins.
    tie_a = _persist_rule(test_db_session, test_user, "zomato", "TieFirst", sort_order=5)
    tie_b = _persist_rule(test_db_session, test_user, "zomato", "TieSecond", sort_order=5)
    assert tie_a.id < tie_b.id

    rules = load_active_rules(test_db_session, test_user.id)
    row = _row(note="zomato dinner")
    apply_rules_to_row(rules, row)
    assert row["category"] == "TieFirst"


def test_inactive_rules_are_skipped(test_db_session: Session, test_user: User) -> None:
    _persist_rule(test_db_session, test_user, "swiggy", "Food", is_active=False)

    rules = load_active_rules(test_db_session, test_user.id)
    row = _row(note="swiggy order")

    assert rules == []
    assert apply_rules_to_row(rules, row) is False
    assert row["category"] == "Misc"


def test_transfer_rows_are_never_mutated() -> None:
    rules = [_rule("swiggy", "Food")]
    row = _row(note="swiggy order", is_transfer=True)

    assert apply_rules_to_row(rules, row) is False
    assert row["category"] == "Misc"
    assert row["subcategory"] == "Old Sub"


def test_match_sets_category_and_subcategory_including_none() -> None:
    # subcategory=None on the rule clears the row's existing subcategory.
    rules = [_rule("swiggy", "Food", subcategory=None)]
    row = _row(note="swiggy order", subcategory="Old Sub")

    assert apply_rules_to_row(rules, row) is True
    assert row["category"] == "Food"
    assert row["subcategory"] is None

    # A non-null rule subcategory is set as-is.
    rules = [_rule("uber", "Transportation", subcategory="Cabs")]
    row = _row(note="uber trip", subcategory=None)
    apply_rules_to_row(rules, row)
    assert row["category"] == "Transportation"
    assert row["subcategory"] == "Cabs"


def test_account_match_field_checks_account_not_note() -> None:
    rule = _rule("hdfc", "Banking", match_field="account")

    assert match_rule(rule, None, "HDFC Savings") is True
    # Pattern present in the note but not the account must NOT match.
    assert match_rule(rule, "paid via hdfc upi", "Cash") is False


def test_empty_or_whitespace_pattern_never_matches() -> None:
    rule = _rule("  ", "Food")

    assert match_rule(rule, "anything at all", "any account") is False
    assert match_rule(rule, "", "") is False
