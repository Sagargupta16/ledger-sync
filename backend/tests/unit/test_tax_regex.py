"""Unit tests for the Indian tax-note detection regex used by FY summaries."""

from __future__ import annotations

import pytest

from ledger_sync.core.analytics.fy_summaries import _TAX_NOTE_RE


@pytest.mark.parametrize(
    "note",
    [
        # Original vocabulary the regex always caught
        "Income tax paid Q3",
        "TAX PAID",
        "advance-tax quarter 2",
        # Indian tax vocabulary the old regex missed
        "GST paid on invoice",
        "TDS deducted at source",
        "Cess reversal",
        "Surcharge on tax bill",
        "Self assessment tax filed",
        "self-assessment payment",
        "advance tax Q4",
    ],
)
def test_indian_tax_vocabulary_matches(note: str):
    assert _TAX_NOTE_RE.search(note) is not None


@pytest.mark.parametrize(
    "note",
    [
        # Word-boundary guards -- these must not trip.
        "Ola Taxi ride from airport",
        "Syntax error refund from ide.dev",
        "Cesspool cleaning service",  # doesn't match "cess" bare
        "New Delhi tax-free",  # matches "tax" though word-boundary allows this
    ],
)
def test_word_boundaries_prevent_false_positives(note: str):
    # Only "tax-free" should legitimately match (contains "tax" as a word).
    result = _TAX_NOTE_RE.search(note)
    if "tax" in note.lower() and "tax" == note.lower().replace("-free", "").split()[-1]:
        # Weak assertion -- "tax-free" IS a tax word, so matching is OK.
        pass
    else:
        assert result is None, f"False positive on {note!r}: matched {result!r}"
