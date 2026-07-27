"""Tests for merchant label extraction from transaction notes."""

from __future__ import annotations

import pytest

from ledger_sync.core.analytics.merchant_extract import (
    clean_note,
    extract_merchant,
    is_placeholder,
    match_brand,
)


class TestCleanNote:
    def test_strips_excel_carriage_return_artifact(self) -> None:
        assert clean_note("Rent_x000D_") == "Rent"

    def test_collapses_whitespace(self) -> None:
        assert clean_note("  Mess   Card  ") == "Mess Card"

    def test_strips_quantity_prefix(self) -> None:
        assert clean_note("3* Jeans - Pant Project") == "Jeans - Pant Project"
        assert clean_note("2 x Track Pants") == "Track Pants"

    def test_strips_trailing_month_and_year(self) -> None:
        assert clean_note("Rent Mar 2026") == "Rent"
        assert clean_note("Rent Apr 2026") == "Rent"

    def test_strips_trailing_fiscal_year(self) -> None:
        assert clean_note("Brokerage Q1 FY27") == "Brokerage"

    def test_returns_none_for_blank(self) -> None:
        assert clean_note("") is None
        assert clean_note("   ") is None
        assert clean_note(None) is None

    def test_keeps_leading_fiscal_year(self) -> None:
        """Only TRAILING period tokens are noise; a leading one identifies the row."""
        assert (
            clean_note("Q1 FY27 Brokerage & Other Charges") == "Q1 FY27 Brokerage & Other Charges"
        )


class TestIsPlaceholder:
    @pytest.mark.parametrize("note", ["Unknown", "unknown", "N/A", "none", "-", "?", "misc"])
    def test_detects_filler_values(self, note: str) -> None:
        assert is_placeholder(note) is True

    @pytest.mark.parametrize("note", ["Netflix", "Mess Card", "Rent"])
    def test_accepts_real_payees(self, note: str) -> None:
        assert is_placeholder(note) is False


class TestMatchBrand:
    def test_matches_brand_anywhere_in_note(self) -> None:
        assert match_brand("Uber Auto AMB to Flat") == "Uber"
        assert match_brand("Payment to Zomato ref123") == "Zomato"

    def test_prefers_longest_brand_name(self) -> None:
        assert match_brand("Amazon Pay wallet load") == "Amazon Pay"
        assert match_brand("Google Play subscription") == "Google Play"

    def test_ambiguous_brand_needs_context(self) -> None:
        assert match_brand("iPhone 16 Pro Max 256GB") == "Apple"
        assert match_brand("Apple Music subscription") == "Apple"
        assert match_brand("Banana & Apple") is None

    def test_ambiguous_brand_rejected_in_food_category(self) -> None:
        """A food row must never be attributed to a technology company."""
        assert match_brand("Milk Shake - Apple", "Food & Dining") is None
        assert match_brand("Fruit Bowl - Apple/Guava", "Food & Dining") is None
        assert match_brand("Apple & Makkhanas", "Food & Dining") is None

    def test_prime_alone_is_not_a_brand(self) -> None:
        """ "Prime" needs context; the old code surfaced it as its own merchant."""
        assert match_brand("Prime cut mutton", "Food & Dining") is None
        assert match_brand("Amazon Prime Shopping Subscription") == "Amazon"

    def test_does_not_match_inside_larger_word(self) -> None:
        assert match_brand("Pineapple juice", "Food & Dining") is None
        assert match_brand("Slicer blade") is None


class TestExtractMerchant:
    def test_returns_brand_kind_for_known_brand(self) -> None:
        assert extract_merchant("Netflix Feb 2026") == ("Netflix", "brand")

    def test_returns_full_note_as_descriptor_when_no_brand(self) -> None:
        """The whole note is kept -- the old first-word heuristic collapsed
        unrelated purchases into one label ("Fruits", "Milk", "Flight")."""
        assert extract_merchant("Milk Shake - Apple", "Food & Dining") == (
            "Milk Shake - Apple",
            "descriptor",
        )
        assert extract_merchant("Fruit Bowl - Papaya/Pineapple", "Food & Dining") == (
            "Fruit Bowl - Papaya/Pineapple",
            "descriptor",
        )

    def test_distinct_notes_stay_distinct(self) -> None:
        first = extract_merchant("Milk Shake - Apple", "Food & Dining")
        second = extract_merchant("Banana & Apple", "Food & Dining")
        assert first != second

    def test_drops_placeholder_notes(self) -> None:
        assert extract_merchant("Unknown", "Miscellaneous") is None

    def test_captures_lowercase_and_quantity_prefixed_notes(self) -> None:
        """These returned None under the old first-word rule and were dropped."""
        assert extract_merchant("3* Jeans - Pant Project", "Shopping") == (
            "Jeans - Pant Project",
            "descriptor",
        )
        assert extract_merchant("wifi bill", "Utilities") == ("wifi bill", "descriptor")

    def test_month_variants_merge_into_one_label(self) -> None:
        assert extract_merchant("Rent Mar 2026") == extract_merchant("Rent Apr 2026")

    def test_truncates_overlong_descriptor(self) -> None:
        result = extract_merchant("x" * 200, "Miscellaneous")
        assert result is not None
        assert len(result[0]) <= 60

    def test_returns_none_for_empty_note(self) -> None:
        assert extract_merchant(None) is None
        assert extract_merchant("") is None
