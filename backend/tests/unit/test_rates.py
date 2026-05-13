"""Tests for instrument rates endpoint."""

from __future__ import annotations

from ledger_sync.api.rates import get_instrument_rates


class FakeUser:
    id = 1


def test_instrument_rates_returns_epf_ppf_nps():
    """The endpoint loads the config JSON and returns all three instruments."""
    result = get_instrument_rates(_current_user=FakeUser())

    # Structure
    assert "epf" in result
    assert "ppf" in result
    assert "nps" in result
    assert "updated_at" in result

    # EPF
    assert isinstance(result["epf"]["rate_pct"], (int, float))
    assert result["epf"]["rate_pct"] > 0
    assert result["epf"]["source_url"].startswith("http")

    # PPF
    assert isinstance(result["ppf"]["rate_pct"], (int, float))
    assert result["ppf"]["rate_pct"] > 0

    # NPS
    alloc = result["nps"]["default_allocation_pct"]
    assert alloc["equity"] + alloc["corp_bond"] + alloc["govt_bond"] == 100
    returns = result["nps"]["historical_return_pct"]
    assert returns["equity"] > returns["corp_bond"] > returns["govt_bond"]
