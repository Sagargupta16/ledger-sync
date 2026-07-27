"""Invariant tests for the 50/30/20 spending-rule aggregation.

THE INVARIANT: ``needs + wants + savings + unallocated == income``, exactly,
and no rupee is counted twice inside one bucket set. The buckets are shares of
the income denominator; whatever income is neither spent nor allocated into the
investment perimeter is the explicit residual ``unallocated``.

Note on how that is tested. The implementation DEFINES
``unallocated := income - needs - wants - savings``, so asserting the four-way
sum equals income is an algebraic identity that can never fail -- it passes even
for an implementation that books every expense rupee into Needs AND Wants. The
real check therefore runs against the per-category rows, which are emitted on a
separate code path: ``_assert_rows_reconcile`` sums the returned rows per bucket
and cross-checks them against ``bucket_totals``, and checks that the expense
buckets together equal ``expense_total``. A rupee landing in two buckets
produces two rows and fails that.

Transfers are the whole reason this needs pinning. On the owner's live ledger
transfers carry 15,384,043 of the 25,588,344 total rupee volume (60.1%) across
1,220 rows, because the same rupee is written twice -- once leaving the bank,
once landing at the broker. A self-transfer is neither income nor expense.

Measured on that ledger, the three buckets summed to 137.75% of income all-time
(needs 45.66 + wants 14.10 + savings 77.98) and to 183.03% in FY2024-25. The
mechanisms:

1. gross inflow measured against an income-only denominator: every transfer
   INTO the perimeter added to Savings (4,553,682 all-time over 155 rows) while
   the 2,855,917 of OUT legs over 78 rows was SKIPPED entirely, not subtracted.
   The old code read ``if t.type == TRANSFER and bucket != "savings": continue``,
   so a redemption contributed nothing and disinvestment was invisible. Decomposing
   the old Savings bucket confirms it: in-legs 4,553,682.83 + expense-on-broker
   285,747.70 = 4,839,430.53, exactly the old total, leaving zero room for the
   OUT legs;
2. an EXPENSE booked on a broker account (285,748 over 15 rows all-time) was
   routed to the Savings bucket AND added to ``expense_total`` with the same
   sign -- one rupee counted twice in the same direction;
3. the header card's Savings (income - expense) and the table's Savings column
   (gross investment inflow) were two different quantities under one label,
   2,624,632 apart all-time;
4. nothing computed the residual, so no reconciliation could ever be checked.

Savings is now the NET CHANGE in the investment perimeter, which is checkable
against an independent per-account balance delta computed over the same rows.
On the real ledger the two agree to the paisa in every window: 735,833.07 for
FY2025-26, 532,772.27 for FY2024-25, 1,651,554.14 all-time. The four buckets
then sum to exactly 100.00% of income in all of them.

Every fixture below is shaped like real rows from that ledger -- the compound
``Transfer: Bank: HDFC -> Stocks: Groww`` category is the exact string the
ledger-sync Excel template writes.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal

from ledger_sync.api.analytics_v2_impl.spending_rule import (
    _DEFAULT_INVESTMENT_ACCOUNTS,
    _DEFAULT_NEEDS,
    _aggregate_txns,
    _CategoryRow,
    _is_transfer_category,
    _pct_of_income,
)
from ledger_sync.core.expense_class import classification_key, is_capital_loss
from ledger_sync.db.models import Transaction, TransactionType

_ESSENTIALS = set(_DEFAULT_NEEDS)
_INVESTMENTS = set(_DEFAULT_INVESTMENT_ACCOUNTS)

# Amounts must reconcile to the last paisa; 0.01 absorbs Decimal/float display
# rounding only.
_EPSILON = Decimal("0.01")

_EXPENSE_BUCKETS = ("needs", "wants")


def _txn(
    txn_type: TransactionType,
    amount: str,
    *,
    category: str,
    account: str = "Bank: HDFC",
    subcategory: str | None = None,
    to_account: str | None = None,
    day: int = 5,
) -> Transaction:
    return Transaction(
        transaction_id=f"{txn_type.value}-{category}-{amount}-{day}",
        user_id=1,
        date=datetime(2025, 4, day, tzinfo=UTC),
        amount=Decimal(amount),
        currency="INR",
        type=txn_type,
        account=account,
        category=category,
        subcategory=subcategory,
        from_account=account if txn_type == TransactionType.TRANSFER else None,
        to_account=to_account,
        note=None,
        source_file="test.xlsx",
        last_seen_at=datetime(2025, 4, day, tzinfo=UTC),
        is_deleted=False,
    )


def _assert_rows_reconcile(
    txns: list[Transaction],
    expense: Decimal,
    buckets: dict[str, Decimal],
    rows: dict[tuple[str, str], _CategoryRow],
    loss_keys: set[str],
) -> None:
    """Cross-check the per-category rows against the bucket totals.

    This is the load-bearing assertion. ``unallocated`` is DEFINED as the
    residual, so a four-way sum against income is an identity; the rows are
    built on a separate path, keyed by (category, bucket). A rupee booked into
    two buckets emits two rows, so summing rows per bucket and comparing to
    ``bucket_totals`` -- and summing the expense buckets against
    ``expense_total`` -- catches the double-count the identity cannot.
    """
    for bucket in ("needs", "wants", "savings"):
        row_sum = sum(
            (r.total_amount for r in rows.values() if r.bucket == bucket), start=Decimal(0)
        )
        assert abs(row_sum - buckets[bucket]) <= _EPSILON, (
            f"{bucket} rows sum to {row_sum} but bucket total is {buckets[bucket]}"
        )

    # Every expense rupee lands in exactly one of Needs/Wants, so the two
    # together must equal expense_total. Booking one rupee into both breaks it.
    expense_buckets = sum((buckets[b] for b in _EXPENSE_BUCKETS), start=Decimal(0))
    assert abs(expense_buckets - expense) <= _EPSILON, (
        f"needs+wants = {expense_buckets} but expense_total is {expense}"
    )

    # Transaction counts must partition too: a rupee written into two buckets
    # emits two rows and counts its transaction twice. Counts rather than
    # category names, because a CATEGORY may legitimately span both expense
    # buckets -- classification reads subcategory as well, so on the real ledger
    # "Entertainment & Recreation / Recharge" is Needs (124 rows) while its six
    # sibling subcategories are Wants.
    # A classified realised loss is not an expense at all (it consumed nothing),
    # so it is excluded from the expected count the same way it is excluded from
    # expense_total.
    expected = sum(
        1
        for t in txns
        if t.type == TransactionType.EXPENSE
        and not is_capital_loss(t.category, t.subcategory, loss_keys)
    )
    counted = sum(r.txn_count for r in rows.values() if r.bucket in _EXPENSE_BUCKETS)
    assert counted == expected, (
        f"expense rows count {counted} transactions but {expected} were expensed"
    )


def _assert_invariant(income: Decimal, buckets: dict[str, Decimal]) -> None:
    """The four-way sum equals income.

    Definitional given the implementation (see the module docstring); kept as a
    guard in case ``unallocated`` is ever computed some other way. The real
    coverage is ``_assert_rows_reconcile``.
    """
    total = buckets["needs"] + buckets["wants"] + buckets["savings"] + buckets["unallocated"]
    assert abs(total - income) <= _EPSILON, (
        f"buckets sum to {total} but income is {income} "
        f"(needs={buckets['needs']} wants={buckets['wants']} "
        f"savings={buckets['savings']} unallocated={buckets['unallocated']})"
    )


def _aggregate(txns: list[Transaction], *, loss_keys: set[str] | None = None):
    """Aggregate and assert both reconciliations before returning.

    Folded into the wrapper so no fixture can forget the checks -- every test
    below gets the row-level cross-check for free.

    *loss_keys* defaults to empty, which is the shipped state of
    ``capital_loss_categories``: with nothing classified every assertion below
    exercises exactly the behaviour that predates the preference.
    """
    keys = loss_keys or set()
    income, expense, buckets, rows = _aggregate_txns(
        txns,
        essential_set=_ESSENTIALS,
        investment_accounts_set=_INVESTMENTS,
        capital_loss_key_set=keys,
    )
    _assert_rows_reconcile(txns, expense, buckets, rows, keys)
    _assert_invariant(income, buckets)
    return income, expense, buckets, rows


def test_self_transfer_between_own_accounts_is_neither_income_nor_expense() -> None:
    # Salary in, rent out, then 50,000 shuffled bank-to-bank. The shuffle is the
    # same rupee twice: it must not touch any bucket or either denominator.
    txns = [
        _txn(TransactionType.INCOME, "100000", category="Employment Income"),
        _txn(TransactionType.EXPENSE, "30000", category="Housing"),
        _txn(
            TransactionType.TRANSFER,
            "50000",
            category="Transfer: Bank: HDFC -> Bank: SBI",
            account="Bank: HDFC",
            to_account="Bank: SBI",
        ),
    ]
    income, expense, buckets, _rows = _aggregate(txns)

    assert income == Decimal("100000")
    assert expense == Decimal("30000")
    assert buckets["needs"] == Decimal("30000")
    assert buckets["wants"] == Decimal("0")
    assert buckets["savings"] == Decimal("0")
    assert buckets["unallocated"] == Decimal("70000")


def test_compound_transfer_category_to_broker_counts_once_as_savings() -> None:
    # "Transfer: Bank: HDFC -> Stocks: Groww" is the template's compound label.
    # It is a real savings allocation, but exactly one leg of it.
    txns = [
        _txn(TransactionType.INCOME, "200000", category="Employment Income"),
        _txn(TransactionType.EXPENSE, "60000", category="Housing"),
        _txn(TransactionType.EXPENSE, "20000", category="Entertainment & Recreation"),
        _txn(
            TransactionType.TRANSFER,
            "80000",
            category="Transfer: Bank: HDFC -> Stocks: Groww",
            account="Bank: HDFC",
            to_account="Stocks: Groww",
        ),
    ]
    income, expense, buckets, rows = _aggregate(txns)

    assert income == Decimal("200000")
    assert expense == Decimal("80000")
    assert buckets["needs"] == Decimal("60000")
    assert buckets["wants"] == Decimal("20000")
    assert buckets["savings"] == Decimal("80000")
    assert buckets["unallocated"] == Decimal("40000")

    # The compound label is relabelled for display, and appears exactly once.
    savings_rows = [r for r in rows.values() if r.bucket == "savings"]
    assert [r.category for r in savings_rows] == ["Stocks"]
    assert savings_rows[0].total_amount == Decimal("80000")


def test_investment_redemption_does_not_inflate_savings() -> None:
    # Selling shares (Stocks: Groww -> Bank: HDFC) is money coming BACK. The old
    # rule SKIPPED the OUT leg of a redemption entirely, so disinvestment was
    # invisible and gross inflow was scored against an income-only denominator.
    txns = [
        _txn(TransactionType.INCOME, "100000", category="Employment Income"),
        _txn(
            TransactionType.TRANSFER,
            "70000",
            category="Transfer: Bank: HDFC -> Stocks: Groww",
            account="Bank: HDFC",
            to_account="Stocks: Groww",
            day=6,
        ),
        _txn(
            TransactionType.TRANSFER,
            "50000",
            category="Transfer: Stocks: Groww -> Bank: HDFC",
            account="Stocks: Groww",
            to_account="Bank: HDFC",
            day=20,
        ),
    ]
    _income, _expense, buckets, rows = _aggregate(txns)

    # Net allocation into investments = 70,000 in - 50,000 out = 20,000.
    assert buckets["savings"] == Decimal("20000")
    assert buckets["unallocated"] == Decimal("80000")

    # Both legs group under ONE instrument label so the row shows the net --
    # the redemption is labelled from its SOURCE account, not its destination
    # (which is a bank and would otherwise leak the raw "Transfer: ..." string).
    savings_rows = [r for r in rows.values() if r.bucket == "savings"]
    assert [r.category for r in savings_rows] == ["Stocks"]
    assert savings_rows[0].total_amount == Decimal("20000")
    assert not any(r.category.lower().startswith("transfer") for r in rows.values())


def test_reallocation_inside_the_perimeter_is_not_a_fresh_allocation() -> None:
    # Stocks: Groww -> Mutual Funds: Groww never leaves the perimeter, so the
    # perimeter balance is unchanged and Savings must not move. Counting it
    # would book an allocation that no rupee of income funded.
    txns = [
        _txn(TransactionType.INCOME, "100000", category="Employment Income"),
        _txn(
            TransactionType.TRANSFER,
            "60000",
            category="Transfer: Stocks: Groww -> Mutual Funds: Groww",
            account="Stocks: Groww",
            to_account="Mutual Funds: Groww",
            day=9,
        ),
    ]
    _income, _expense, buckets, rows = _aggregate(txns)

    assert buckets["savings"] == Decimal("0")
    assert buckets["unallocated"] == Decimal("100000")
    assert [r for r in rows.values() if r.bucket == "savings"] == []


def test_expense_on_broker_account_is_spending_and_shrinks_the_holding() -> None:
    # Brokerage fees are debited ON the broker account. They are a real expense
    # (285,748 of them on the owner's ledger); the old code routed them to
    # Savings with a POSITIVE sign while also adding them to expense_total --
    # one rupee counted twice in the same direction.
    #
    # Now the fee is spending AND a withdrawal from the holding, so the two
    # entries carry opposite signs and the perimeter total still matches a
    # per-account balance delta.
    txns = [
        _txn(TransactionType.INCOME, "100000", category="Employment Income"),
        _txn(
            TransactionType.TRANSFER,
            "40000",
            category="Transfer: Bank: HDFC -> Stocks: Groww",
            account="Bank: HDFC",
            to_account="Stocks: Groww",
            day=4,
        ),
        _txn(
            TransactionType.EXPENSE,
            "5000",
            category="Investment Expenses",
            subcategory="Brokerage & Other Fees",
            account="Stocks: Groww",
        ),
    ]
    _income, expense, buckets, _rows = _aggregate(txns)

    assert expense == Decimal("5000")
    # Not essential -> Wants. Counted once on the expense side.
    assert buckets["wants"] == Decimal("5000")
    assert buckets["needs"] == Decimal("0")
    # 40,000 in minus the 5,000 that left the holding as a fee.
    assert buckets["savings"] == Decimal("35000")
    assert buckets["unallocated"] == Decimal("60000")


def test_sip_logged_as_an_expense_is_not_treated_as_an_allocation() -> None:
    # A contribution only registers as Savings when it is logged as a TRANSFER
    # into the holding. An EXPENSE row's ``account`` is the account the money
    # LEFT, so an EXPENSE booked on the broker reads as a withdrawal -- it lands
    # in Wants and reduces the perimeter. Pinned so the documented requirement
    # ("log contributions as TRANSFER rows") cannot drift silently.
    txns = [
        _txn(TransactionType.INCOME, "100000", category="Employment Income"),
        _txn(
            TransactionType.EXPENSE,
            "25000",
            category="Investment",
            subcategory="SIP",
            account="Mutual Funds: Groww",
            day=7,
        ),
    ]
    _income, expense, buckets, _rows = _aggregate(txns)

    assert expense == Decimal("25000")
    assert buckets["wants"] == Decimal("25000")
    assert buckets["savings"] == Decimal("-25000")


def test_income_credited_inside_the_perimeter_counts_as_saved() -> None:
    # EPF contributions, RSU vests and reinvested dividends land already
    # allocated: they never cross the perimeter as a TRANSFER. On the owner's
    # ledger that is 239,536 all-time over 47 rows (164,168 in FY2025-26 alone,
    # 6.20% of income) which previously only inflated the denominator, so a
    # user whose EPF is their main vehicle read as saving nothing.
    txns = [
        _txn(
            TransactionType.INCOME,
            "43200",
            category="Employment Income",
            subcategory="EPF Contribution",
            account="EPF",
        ),
        _txn(
            TransactionType.INCOME,
            "82750",
            category="Employment Income",
            subcategory="RSUs",
            account="Stocks: Fidelity",
            day=8,
        ),
        _txn(
            TransactionType.INCOME,
            "100000",
            category="Employment Income",
            account="Bank: HDFC",
            day=1,
        ),
    ]
    income, expense, buckets, rows = _aggregate(txns)

    assert income == Decimal("225950")
    assert expense == Decimal("0")
    assert buckets["savings"] == Decimal("125950")
    assert buckets["unallocated"] == Decimal("100000")
    # Grouped under instrument labels, not the raw income category.
    savings_labels = sorted(r.category for r in rows.values() if r.bucket == "savings")
    assert savings_labels == ["EPF", "Stocks"]


def test_credit_card_repayment_transfer_is_not_a_bucket() -> None:
    # Paying the card is settling an expense already booked when it was spent.
    # Bucketing the repayment would count that spend twice.
    txns = [
        _txn(TransactionType.INCOME, "100000", category="Employment Income"),
        _txn(
            TransactionType.EXPENSE,
            "12000",
            category="Food & Dining",
            account="CC: HDFC Swiggy",
        ),
        _txn(
            TransactionType.TRANSFER,
            "12000",
            category="Transfer: Bank: SBI -> CC: HDFC Swiggy",
            account="Bank: SBI",
            to_account="CC: HDFC Swiggy",
            day=25,
        ),
    ]
    _income, expense, buckets, _rows = _aggregate(txns)

    assert expense == Decimal("12000")
    assert buckets["needs"] == Decimal("12000")  # Food & Dining is a default need
    assert buckets["savings"] == Decimal("0")


def test_buckets_reconcile_across_a_full_mixed_year() -> None:
    # A miniature of the real ledger: salary, an EPF credit, needs, wants, an
    # investment SIP, a redemption, a bank shuffle, a card repayment, and a
    # broker fee.
    txns = [
        _txn(TransactionType.INCOME, "500000", category="Employment Income"),
        _txn(TransactionType.INCOME, "20000", category="Investment Income", day=9),
        _txn(
            TransactionType.INCOME,
            "24000",
            category="Employment Income",
            subcategory="EPF Contribution",
            account="EPF",
            day=10,
        ),
        _txn(TransactionType.EXPENSE, "150000", category="Housing"),
        _txn(TransactionType.EXPENSE, "40000", category="Food & Dining", day=7),
        _txn(TransactionType.EXPENSE, "25000", category="Transportation", day=8),
        _txn(TransactionType.EXPENSE, "35000", category="Gadgets & Accessories", day=11),
        _txn(TransactionType.EXPENSE, "15000", category="Entertainment & Recreation", day=12),
        _txn(
            TransactionType.EXPENSE,
            "2000",
            category="Investment Expenses",
            account="Stocks: Groww",
            day=13,
        ),
        _txn(
            TransactionType.TRANSFER,
            "120000",
            category="Transfer: Bank: SBI -> Mutual Funds: Groww",
            account="Bank: SBI",
            to_account="Mutual Funds: Groww",
            day=14,
        ),
        _txn(
            TransactionType.TRANSFER,
            "30000",
            category="Transfer: Stocks: Groww -> Bank: SBI",
            account="Stocks: Groww",
            to_account="Bank: SBI",
            day=15,
        ),
        _txn(
            TransactionType.TRANSFER,
            "200000",
            category="Transfer: Bank: HDFC -> Bank: SBI",
            account="Bank: HDFC",
            to_account="Bank: SBI",
            day=16,
        ),
        _txn(
            TransactionType.TRANSFER,
            "18000",
            category="Transfer: Bank: SBI -> CC: ICICI Others",
            account="Bank: SBI",
            to_account="CC: ICICI Others",
            day=17,
        ),
    ]
    income, expense, buckets, _rows = _aggregate(txns)

    assert income == Decimal("544000")
    assert expense == Decimal("267000")
    # Needs: Housing 150k + Food 40k + Transportation 25k.
    assert buckets["needs"] == Decimal("215000")
    # Wants: Gadgets 35k + Entertainment 15k + broker fee 2k.
    assert buckets["wants"] == Decimal("52000")
    # Savings: 120k into MF + 24k EPF credit - 30k redemption - 2k broker fee.
    assert buckets["savings"] == Decimal("112000")
    assert buckets["unallocated"] == Decimal("165000")

    # All four shares sum to exactly 100% of income.
    pct = sum(_pct_of_income(b, income) for b in buckets.values())
    assert abs(pct - 100.0) < 0.01


def test_gross_inflow_is_netted_against_redemptions() -> None:
    # A year where gross investment inflow dwarfs income (the owner's FY2024-25
    # reported savings = 124.84% of income this way). Netting the redemption
    # against the allocation restores the true perimeter change.
    txns = [
        _txn(TransactionType.INCOME, "100000", category="Employment Income"),
        _txn(
            TransactionType.TRANSFER,
            "400000",
            category="Transfer: Bank: HDFC -> Stocks: Groww",
            account="Bank: HDFC",
            to_account="Stocks: Groww",
            day=6,
        ),
        _txn(
            TransactionType.TRANSFER,
            "380000",
            category="Transfer: Stocks: Groww -> Bank: HDFC",
            account="Stocks: Groww",
            to_account="Bank: HDFC",
            day=21,
        ),
    ]
    _income, _expense, buckets, _rows = _aggregate(txns)

    assert buckets["savings"] == Decimal("20000")


def test_investing_from_prior_savings_may_exceed_income() -> None:
    # No individual bucket is bounded by income -- only the four-way sum is.
    # Investing a lump sum accumulated in an earlier period is entirely normal
    # and must report savings above 100% with a negative residual, not a
    # clamped number. Pinned so nobody "fixes" the overshoot by scaling.
    txns = [
        _txn(TransactionType.INCOME, "100000", category="Employment Income"),
        _txn(
            TransactionType.TRANSFER,
            "400000",
            category="Transfer: Bank: HDFC -> Stocks: Groww",
            account="Bank: HDFC",
            to_account="Stocks: Groww",
            day=6,
        ),
    ]
    income, _expense, buckets, _rows = _aggregate(txns)

    assert buckets["savings"] == Decimal("400000")
    assert buckets["unallocated"] == Decimal("-300000")
    assert _pct_of_income(buckets["savings"], income) == 400.0


def test_net_disinvestment_period_reports_negative_savings() -> None:
    # Two real quarters on the owner's ledger are net disinvestment (2025Q2 at
    # -44.8% of income). Redeeming more than you invest must show as negative
    # savings, not as zero and not as a positive number.
    txns = [
        _txn(TransactionType.INCOME, "100000", category="Employment Income"),
        _txn(
            TransactionType.TRANSFER,
            "10000",
            category="Transfer: Bank: HDFC -> Stocks: Groww",
            account="Bank: HDFC",
            to_account="Stocks: Groww",
            day=6,
        ),
        _txn(
            TransactionType.TRANSFER,
            "45000",
            category="Transfer: Stocks: Groww -> Bank: HDFC",
            account="Stocks: Groww",
            to_account="Bank: HDFC",
            day=21,
        ),
    ]
    _income, _expense, buckets, _rows = _aggregate(txns)

    assert buckets["savings"] == Decimal("-35000")


def test_overspending_year_shows_negative_unallocated_not_a_broken_sum() -> None:
    # Spending more than you earn is real. The residual goes negative rather
    # than the invariant breaking.
    txns = [
        _txn(TransactionType.INCOME, "100000", category="Employment Income"),
        _txn(TransactionType.EXPENSE, "90000", category="Housing"),
        _txn(TransactionType.EXPENSE, "40000", category="Gadgets & Accessories", day=6),
    ]
    _income, _expense, buckets, _rows = _aggregate(txns)

    assert buckets["unallocated"] == Decimal("-30000")


def test_percentages_use_income_as_the_denominator() -> None:
    # Income is the single denominator for all four buckets -- that is what
    # makes the shares sum to 100. Dividing by expense_total instead would
    # reconcile to nothing, and the aggregation tests alone cannot see it.
    assert _pct_of_income(Decimal("25000"), Decimal("100000")) == 25.0
    assert _pct_of_income(Decimal("-30000"), Decimal("100000")) == -30.0
    # Zero or negative income yields 0.0 rather than dividing by zero.
    assert _pct_of_income(Decimal("5000"), Decimal("0")) == 0.0
    assert _pct_of_income(Decimal("5000"), Decimal("-100")) == 0.0


def test_empty_ledger_reconciles_without_dividing_by_zero() -> None:
    income, expense, buckets, rows = _aggregate([])

    assert income == Decimal("0")
    assert expense == Decimal("0")
    assert all(v == Decimal("0") for v in buckets.values())
    assert rows == {}


def test_is_transfer_category_matches_compound_and_generic_labels() -> None:
    assert _is_transfer_category("transfer: bank: hdfc -> stocks: groww")
    assert _is_transfer_category("transfer")
    assert _is_transfer_category("internal transfer")
    assert _is_transfer_category("")
    # A real spending category must never be mistaken for bookkeeping.
    assert not _is_transfer_category("transferable assets")
    assert not _is_transfer_category("food & dining")


# --- realised capital losses -------------------------------------------------
#
# A realised trading loss has to be booked as an EXPENSE for a cashbook's cash
# column to balance, but it bought nothing. The old code charged it to Wants AND
# subtracted it from Savings, defending the pair as "opposite signs, so no
# double-count". That defence holds for a brokerage FEE (cash really was both
# consumed and removed from the holding) but not for a loss, which consumed
# nothing -- so one bad trade moved two buckets away from target at once.
#
# Shaped like the real rows: `Investment Expenses / F&O Loss` on `Stocks: Groww`.

_LOSS_CATEGORY = "Investment Expenses"
_LOSS_SUBCATEGORY = "F&O Loss"
_LOSS_KEYS = {classification_key(_LOSS_CATEGORY, _LOSS_SUBCATEGORY)}


def _loss_txn(amount: str, *, day: int = 5) -> Transaction:
    return _txn(
        TransactionType.EXPENSE,
        amount,
        category=_LOSS_CATEGORY,
        subcategory=_LOSS_SUBCATEGORY,
        account="Stocks: Groww",
        day=day,
    )


def test_classified_loss_is_not_charged_to_an_expense_bucket() -> None:
    txns = [
        _txn(TransactionType.INCOME, "200000", category="Employment Income"),
        _txn(TransactionType.EXPENSE, "40000", category="Housing"),
        _loss_txn("102789.41", day=8),
    ]
    _income, expense, buckets, rows = _aggregate(txns, loss_keys=_LOSS_KEYS)

    # The loss is not consumption: it is out of Wants and out of expense_total.
    assert buckets["wants"] == Decimal("0")
    assert expense == Decimal("40000")
    # It shrank the investment perimeter, and that is the ONLY bucket it moves.
    assert buckets["savings"] == Decimal("-102789.41")
    assert not any(
        r.category == _LOSS_CATEGORY for r in rows.values() if r.bucket in _EXPENSE_BUCKETS
    )


def test_unclassified_loss_keeps_the_pre_preference_behaviour() -> None:
    # Same rows, empty preference: the loss is still an ordinary expense. This
    # is what guarantees no user's historical numbers move until they classify.
    txns = [
        _txn(TransactionType.INCOME, "200000", category="Employment Income"),
        _loss_txn("102789.41", day=8),
    ]
    _income, expense, buckets, _rows = _aggregate(txns)

    assert expense == Decimal("102789.41")
    assert buckets["wants"] == Decimal("102789.41")
    # Booked on a perimeter account, so it also shrinks the holding -- the
    # double-book this preference exists to let the user opt out of.
    assert buckets["savings"] == Decimal("-102789.41")


def test_brokerage_fee_on_the_same_account_is_still_spending() -> None:
    # The fee/loss distinction is the crux: a fee IS consumption (cash paid to
    # participate in a market) and must keep both entries, so classifying the
    # loss must not quietly reclassify fees booked on the same account.
    txns = [
        _txn(TransactionType.INCOME, "200000", category="Employment Income"),
        _txn(
            TransactionType.EXPENSE,
            "354.20",
            category=_LOSS_CATEGORY,
            subcategory="Brokerage Charges",
            account="Stocks: Groww",
            day=9,
        ),
    ]
    _income, expense, buckets, _rows = _aggregate(txns, loss_keys=_LOSS_KEYS)

    assert expense == Decimal("354.20")
    assert buckets["wants"] == Decimal("354.20")
    assert buckets["savings"] == Decimal("-354.20")
