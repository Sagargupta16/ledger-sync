"""Bucket classification rules for the 50/30/20 spending-rule endpoint.

Pure, stateless helpers: the built-in Indian Needs defaults, the Savings-row
display relabelling, and the per-row Needs/Wants and transfer-direction
decisions. The investment-account perimeter rule is
``core.metric_rules.is_investment_account``. See ``spending_rule`` for the
bucket semantics and the reconciliation invariant.
"""

from __future__ import annotations

import re
from collections.abc import Set as AbstractSet

from ledger_sync.core.metric_rules import (
    DEFAULT_NEEDS,
    is_essential_expense,
    is_investment_account,
)

# ─── opinionated Indian defaults ────────────────────────────────────────────

# The Needs defaults live in ``core.metric_rules`` so the persisted monthly
# rollup and this endpoint share one definition. Re-exported under the name
# ``spending_rule`` and its tests import. Match is case-insensitive on either
# ``category`` or ``subcategory`` --
# users label the same concept differently ("Rent" vs "Housing/Rent" vs
# "Home/Rent"). Better to over-match Needs than under-match, since the failure
# mode of a mis-classified expense in Needs instead of Wants is a slightly
# conservative budget score.
_DEFAULT_NEEDS: frozenset[str] = DEFAULT_NEEDS


# Display-side rename for Savings-bucket rows whose category is a "Transfer:"
# bookkeeping label. Users think of these as investments, not transfers --
# the money went somewhere. Ordered from most specific to most generic; the
# first pattern that matches the ``to_account`` wins.
#
# The DB row is untouched; this only affects what the /budgets page shows.
# Labels are short instrument names (Stocks, Mutual Funds, PPF) so the /budgets
# page rows fit inside the narrow side-by-side columns without truncation.
_MUTUAL_FUNDS_LABEL = "Mutual Funds"

_TRANSFER_RELABEL_BY_ACCOUNT: tuple[tuple[str, str], ...] = (
    # Multi-word patterns first (more specific).
    ("fd/bonds", "FD / Bonds"),
    ("mutual funds", _MUTUAL_FUNDS_LABEL),
    ("mutual fund", _MUTUAL_FUNDS_LABEL),
    ("recurring deposit", "Recurring Deposit"),
    ("fixed deposit", "Fixed Deposit"),
    ("sukanya samriddhi", "Sukanya Samriddhi"),
    # Single-word patterns (matched at word boundaries to avoid substring
    # false positives like "rd" inside "weird" / "board").
    ("ppf", "PPF"),
    ("epf", "EPF"),
    ("nps", "NPS"),
    ("ssy", "Sukanya Samriddhi"),
    ("elss", "ELSS"),
    ("mf", _MUTUAL_FUNDS_LABEL),
    ("sip", "SIP"),
    ("stocks", "Stocks"),
    ("equity", "Stocks"),
    ("shares", "Stocks"),
    ("groww", _MUTUAL_FUNDS_LABEL),
    ("zerodha", "Stocks"),
    ("kite", "Stocks"),
    ("upstox", "Stocks"),
    ("kuvera", _MUTUAL_FUNDS_LABEL),
    ("indmoney", "Stocks"),
    ("coin", _MUTUAL_FUNDS_LABEL),
    ("rd", "Recurring Deposit"),
    ("fd", "Fixed Deposit"),
)


_GENERIC_TRANSFER_LABELS: frozenset[str] = frozenset(
    s.lower() for s in ("transfer", "transfer out", "transfer to", "movement", "internal transfer")
)


def _is_transfer_category(cat_lower: str) -> bool:
    """True if the category is a generic bookkeeping Transfer label.

    Covers both the plain single-word form ('transfer', 'transfer to') AND
    the multi-part 'Transfer: <from> → <to>' pattern that ledger-sync's
    default Excel template uses. Matching by prefix + colon avoids
    accidentally catching a category literally named 'transferable' or a
    user's actual investment category.
    """
    if not cat_lower:
        return True
    if cat_lower in _GENERIC_TRANSFER_LABELS:
        return True
    # "transfer:" (colon suffix) or "transfer: <anything>" -- the ledger-sync
    # Excel template writes rows as "Transfer: Bank: HDFC → Stocks: Groww".
    return cat_lower.startswith("transfer:")


def _match_instrument(account: str | None) -> str | None:
    """Short instrument name for an account, or None if nothing matches.

    Word-boundary match so 'rd' doesn't match 'weird broker' and 'mf' doesn't
    match 'management firm'. Multi-word patterns like 'mutual funds' fit
    \\b...\\b naturally on space boundaries.
    """
    text = (account or "").lower()
    if not text:
        return None
    for pattern, pretty in _TRANSFER_RELABEL_BY_ACCOUNT:
        if re.search(rf"\b{re.escape(pattern)}\b", text):
            return pretty
    return None


def _instrument_label(account: str | None) -> str:
    """Display label for a Savings row derived from an INCOME/EXPENSE row.

    Falls back to the raw account name so a perimeter account the user added
    through ``investment_account_mappings`` still gets a readable row even
    when it matches none of the built-in instrument patterns.
    """
    return _match_instrument(account) or (account or "Investments")


def _prettify_savings_label(
    category: str,
    subcategory: str | None,
    instrument_account: str | None,
) -> tuple[str, str | None]:
    """Return (category, subcategory) with generic 'Transfer' labels swapped
    for the instrument name inferred from the investment side of the leg.

    ``instrument_account`` is the destination for an allocation and the SOURCE
    for a redemption, so both legs of the same holding group under one label
    and the row shows the net.

    Only fires for Savings-bucket rows; leaves everything else alone. Handles
    both the plain 'Transfer' category AND the ledger-sync default template's
    'Transfer: <from> → <to>' compound form.
    """
    cat_lower = (category or "").lower().strip()
    if not _is_transfer_category(cat_lower) or not instrument_account:
        return category, subcategory

    pretty = _match_instrument(instrument_account)
    if pretty is None:
        # Transfer-flavored category but the instrument side didn't match any
        # known pattern (e.g. 'Cashback Shared', 'Security Deposits'). Return
        # the raw category rather than a bogus label -- these get filtered out
        # one step earlier by the internal-movement skip in practice; this is
        # a safety net.
        return category, subcategory

    # Keep the original subcategory only if it's not also a generic transfer
    # label -- otherwise the row reads "PPF / Transfer" which is exactly what
    # we're trying to fix.
    sub_lower = (subcategory or "").lower().strip()
    return pretty, (None if _is_transfer_category(sub_lower) else subcategory)


def _classify_expense(
    category: str,
    subcategory: str | None,
    essential_set: set[str],
) -> str:
    """Return 'needs' or 'wants' for an expense row.

    Purely category-driven. The account the expense was booked on is
    deliberately ignored: a brokerage fee debited on ``Stocks: Groww`` is money
    spent, not money saved, and routing it to Savings on account of where it
    landed counted the same rupee in ``expense_total`` AND in a bucket.

    The predicate itself is ``core.metric_rules.is_essential_expense`` so the
    persisted monthly essential split uses the same rule.
    """
    # Wants is the residual expense bucket.
    return "needs" if is_essential_expense(category, subcategory, essential_set) else "wants"


def _transfer_direction(
    account: str,
    to_account: str | None,
    perimeter_names: AbstractSet[str],
) -> int:
    """Signed savings contribution of a transfer: +1 in, -1 out, 0 internal.

    A transfer writes one rupee twice (leaving ``account``, arriving at
    ``to_account``), so only its direction relative to the investment-account
    perimeter carries information:

    - crossing INTO the perimeter is a real allocation (+1)
    - crossing OUT is a redemption -- money coming back, so it must subtract
      (-1), otherwise selling shares registers as "you saved more"
    - staying wholly inside or wholly outside is internal bookkeeping (0):
      bank-to-bank shuffles, card repayments, wallet top-ups, ledger
      settlements, and investment-to-investment reallocations alike

    *perimeter_names* comes from ``core.metric_rules.investment_account_names``
    over the user's mapped accounts; empty means the default keyword fallback.
    """
    into = is_investment_account(to_account, perimeter_names)
    out_of = is_investment_account(account, perimeter_names)
    if into == out_of:
        return 0
    return 1 if into else -1
