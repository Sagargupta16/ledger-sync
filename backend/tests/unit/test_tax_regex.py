"""Unit tests for the tax-paid rule used by FY summaries (``metric_rules.is_tax_paid``).

Tax paid is decided by the row's own TAXONOMY -- the exact "Taxes" category or
income-tax vocabulary in the category or subcategory. The free-text note used
to be searched for any tax word, so a purchase note "incl GST" or a broker note
"STCG advance tax adjustment" was booked as income tax the user paid.
"""

from __future__ import annotations

import pytest

from ledger_sync.core.metric_rules import is_tax_paid


@pytest.mark.parametrize(
    ("category", "subcategory"),
    [
        ("Taxes", None),
        ("Taxes", "Anything"),
        ("Income Tax", None),
        ("Tax", "Income Tax"),
        ("Tax", "Income-Tax"),
        ("Government", "TDS"),
        ("Tax", "Advance Tax"),
        ("Tax", "advance-tax Q4"),
        ("Tax", "Self Assessment"),
        ("Tax", "Self-Assessment Tax"),
        ("Payments", "Tax Paid"),
        ("Taxes Paid", None),
        ("Salary Deductions", "Professional Tax"),
    ],
)
def test_income_tax_taxonomy_counts_as_tax_paid(category: str, subcategory: str | None):
    assert is_tax_paid(category, subcategory)


@pytest.mark.parametrize(
    ("category", "subcategory"),
    [
        # Word-boundary guards -- these must not trip.
        ("Transportation", "Ola Taxi"),
        ("Software", "Syntax Highlighter"),
        # Indirect taxes and levies are not income tax paid.
        ("Shopping", "GST"),
        ("Utilities", "Cess"),
        ("Tax", "Surcharge"),
        (None, None),
        ("", ""),
    ],
)
def test_other_taxonomies_are_not_tax_paid(category: str | None, subcategory: str | None):
    assert not is_tax_paid(category, subcategory)
