"""Tests for data normalizer.

Also covers the import-time case folding that pairs with it: the normalizer
preserves the casing a user chose, and ``SyncEngine`` is what merges surviving
case variants onto one label per user.
"""

from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

import pandas as pd
import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ledger_sync.core.sync_engine import SyncEngine
from ledger_sync.db.models import Transaction, TransactionType, User
from ledger_sync.ingest.hash_id import TransactionHasher
from ledger_sync.ingest.normalizer import (
    DataNormalizer,
    NormalizationError,
    format_transfer_category,
)

# Expected values for date assertions
EXPECTED_YEAR = 2024
EXPECTED_DAY = 15


class TestDataNormalizer:
    """Test data normalization."""

    def test_normalize_date_from_datetime(self):
        """Test date normalization from datetime."""
        normalizer = DataNormalizer()
        date = datetime(EXPECTED_YEAR, 1, EXPECTED_DAY, 10, 30, 0, tzinfo=UTC)

        result = normalizer.normalize_date(date)

        assert result == date
        assert isinstance(result, datetime)

    def test_normalize_date_from_string(self):
        """Test date normalization from string."""
        normalizer = DataNormalizer()

        result = normalizer.normalize_date("2024-01-15")

        assert isinstance(result, datetime)
        assert result.year == EXPECTED_YEAR
        assert result.month == 1
        assert result.day == EXPECTED_DAY

    def test_normalize_date_missing_value(self):
        """Test that missing date raises error."""
        normalizer = DataNormalizer()

        with pytest.raises(NormalizationError, match="Date value is missing"):
            normalizer.normalize_date(pd.NA)

    def test_normalize_amount_from_float(self):
        """Test amount normalization from float."""
        normalizer = DataNormalizer()

        result = normalizer.normalize_amount(100.5)

        assert result == Decimal("100.50")
        assert isinstance(result, Decimal)

    def test_normalize_amount_from_int(self):
        """Test amount normalization from int."""
        normalizer = DataNormalizer()

        result = normalizer.normalize_amount(100)

        assert result == Decimal("100.00")

    def test_normalize_amount_rounding(self):
        """Test amount rounding to 2 decimal places."""
        normalizer = DataNormalizer()

        result = normalizer.normalize_amount(100.556)

        assert result == Decimal("100.56")

    def test_normalize_amount_half_up_not_float_banker_rounding(self):
        """Regression: amounts must round HALF_UP via Decimal, not through float.

        The old path did ``Decimal(str(round(float(value), 2)))``: round() uses
        banker's rounding on a binary-float, so 2.675 came out 2.67. Converting
        the string straight to Decimal and quantizing HALF_UP yields 2.68.
        """
        normalizer = DataNormalizer()

        assert normalizer.normalize_amount(2.675) == Decimal("2.68")
        assert normalizer.normalize_amount("2.675") == Decimal("2.68")
        # A clean decimal string is preserved exactly.
        assert normalizer.normalize_amount("19.99") == Decimal("19.99")

    def test_normalize_string(self):
        """Test string normalization."""
        normalizer = DataNormalizer()

        result = normalizer.normalize_string("  Test String  ")

        assert result == "test string"

    def test_normalize_string_preserve_case(self):
        """Test string normalization preserving case."""
        normalizer = DataNormalizer()

        result = normalizer.normalize_string_preserve_case("  Test String  ")

        assert result == "Test String"

    def test_normalize_transaction_type_expense(self):
        """Test transaction type normalization for expense."""
        normalizer = DataNormalizer()

        result = normalizer.normalize_transaction_type("Exp.")

        assert result == TransactionType.EXPENSE

    def test_normalize_transaction_type_income(self):
        """Test transaction type normalization for income."""
        normalizer = DataNormalizer()

        result = normalizer.normalize_transaction_type("Income")

        assert result == TransactionType.INCOME

    def test_normalize_transaction_type_transfer(self):
        """Test transaction type normalization for transfer."""
        normalizer = DataNormalizer()

        result = normalizer.normalize_transaction_type("Transfer-In")

        assert result == TransactionType.TRANSFER

    def test_normalize_transaction_type_case_insensitive(self):
        """Test that transaction type is case-insensitive."""
        normalizer = DataNormalizer()

        result = normalizer.normalize_transaction_type("EXPENSE")

        assert result == TransactionType.EXPENSE

    def test_normalize_transaction_type_invalid(self):
        """Test that invalid transaction type raises error."""
        normalizer = DataNormalizer()

        with pytest.raises(NormalizationError, match="Unknown transaction type"):
            normalizer.normalize_transaction_type("InvalidType")

    def test_bank_name_canonicalization_matches_lowercase_tokens(self):
        """Lowercase bank tokens are canonicalized; chosen casing is preserved."""
        normalizer = DataNormalizer()

        assert normalizer._standardize_account("sbi bank") == "SBI bank"
        assert normalizer._standardize_account("SBI Bank") == "SBI Bank"
        assert normalizer._standardize_account("hdfc bank") == "HDFC bank"
        assert normalizer._standardize_account("HDFC BANK") == "HDFC BANK"
        assert normalizer._standardize_account("hdfc cc") == "HDFC cc"
        # Sentence case is a casing the user chose -- see
        # TestAccountCasingPreservesUserIntent for why it is left alone.
        assert normalizer._standardize_account("Hdfc Credit Card") == "Hdfc Credit Card"

    def test_bank_name_longest_match_wins(self):
        """'IDFC First Bank' should canonicalize 'IDFC First', not just 'IDFC'."""
        normalizer = DataNormalizer()

        assert normalizer._standardize_account("idfc first bank") == "IDFC First bank"
        assert normalizer._standardize_account("standard chartered") == "Standard Chartered"

    def test_bank_name_extended_coverage(self):
        """New banks beyond the original five should be canonicalized."""
        normalizer = DataNormalizer()

        assert "Yes" in normalizer._standardize_account("yes bank")
        assert "IndusInd" in normalizer._standardize_account("indusind savings")
        assert "RBL" in normalizer._standardize_account("rbl credit card")
        assert "AU Small Finance" in normalizer._standardize_account("au small finance fd")

    def test_bank_name_word_boundary(self):
        """Canonicalization should not match inside other words."""
        normalizer = DataNormalizer()

        # 'axis' inside 'maxis' or 'taxis' must not be replaced
        assert normalizer._standardize_account("taxis reimbursement") == "taxis reimbursement"


class TestCategoryCasing:
    """User-authored category casing must survive the importer.

    Regression cover for the importer silently rewriting labels: the old rule
    title-cased anything that was ``isupper() or islower()``, which turned
    every all-caps Indian finance acronym into sentence case ("EPF" -> "Epf").

    Merging case variants that survive here is a separate concern -- see
    ``tests/integration/test_account_case_folding.py``.
    """

    @pytest.mark.parametrize("acronym", ["EPF", "PPF", "TDS", "ELSS"])
    def test_all_caps_acronym_is_preserved_verbatim(self, acronym: str):
        """An all-caps category the user typed is intentional -- never re-cased."""
        assert DataNormalizer()._standardize_category(acronym) == acronym

    def test_multi_word_all_caps_is_preserved(self):
        """'EPF CONTRIBUTION' must not become 'Epf Contribution'."""
        normalizer = DataNormalizer()

        assert normalizer._standardize_category("EPF CONTRIBUTION") == "EPF CONTRIBUTION"
        # isupper() ignores digits, so a trailing year does not change the rule.
        assert normalizer._standardize_category("EPF 2024") == "EPF 2024"

    def test_lowercase_is_title_cased(self):
        """Lowercase reads as 'did not bother with shift' -- still title-cased."""
        normalizer = DataNormalizer()

        assert normalizer._standardize_category("housing") == "Housing"
        assert normalizer._standardize_category("personal shopping") == "Personal Shopping"

    def test_mixed_case_is_left_alone(self):
        """Mixed case is already deliberate."""
        normalizer = DataNormalizer()

        assert normalizer._standardize_category("Food & Dining") == "Food & Dining"
        assert normalizer._standardize_category("EPF contribution") == "EPF contribution"

    def test_corrections_table_still_wins_over_casing_rules(self):
        """CATEGORY_CORRECTIONS is an explicit map and outranks the casing rule."""
        normalizer = DataNormalizer()

        assert normalizer._standardize_category("food and dining") == "Food & Dining"
        # ...including for all-caps input, which the casing rule would preserve.
        assert normalizer._standardize_category("ENTERTAINMENT") == "Entertainment & Recreations"

    def test_empty_category_stays_empty(self):
        assert DataNormalizer()._standardize_category("") == ""


class TestAccountCasingPreservesUserIntent:
    """Bank canonicalization is house style, not licence to rewrite user labels."""

    def test_shift_keyed_bank_token_is_preserved(self):
        """Any casing the user chose survives -- only all-lowercase is re-cased.

        BANK_CANONICAL_NAMES maps "axis" -> "Axis" and the old substitution
        applied it regardless of the matched spelling, so "CC: AXIS Google Flex"
        became "CC: Axis Google Flex".

        Scope: this governs the spelling stored on a FRESH import only. A user
        whose ledger already holds the mangled spelling keeps it, by design --
        ``SyncEngine._canonicalize_account_casing`` folds new uploads onto
        stored data so re-uploads never rewrite history, and the
        account_case_fold_2026 migration keeps the majority spelling. Renaming
        an existing ledger is a rename feature, not an importer change.
        """
        normalizer = DataNormalizer()

        assert normalizer._standardize_account("CC: AXIS Google Flex") == "CC: AXIS Google Flex"
        assert normalizer._standardize_account("CC: Axis Google Flex") == "CC: Axis Google Flex"

    def test_sentence_case_person_name_is_not_shouted(self):
        """The "bob" -> "BOB" (Bank of Baroda) entry must not shout a person's name.

        Same defect class as the AXIS case, one casing bucket over: the table
        is house style, so it may only fix casing the user did not choose.
        "yes", "union", "federal" and "citi" collide the same way.
        """
        normalizer = DataNormalizer()

        assert normalizer._standardize_account("Bob") == "Bob"
        assert normalizer._standardize_account("Transfer to Bob") == "Transfer to Bob"
        assert normalizer._standardize_account("Federal") == "Federal"
        # Only the all-lowercase spelling is treated as unchosen.
        assert normalizer._standardize_account("bob") == "BOB"

    def test_lowercase_is_still_canonicalized(self):
        """The useful half of the feature keeps working."""
        normalizer = DataNormalizer()

        assert normalizer._standardize_account("hdfc bank") == "HDFC bank"
        assert normalizer._standardize_account("axis flex") == "Axis flex"
        assert normalizer._standardize_account("idfc first bank") == "IDFC First bank"

    def test_all_caps_account_label_is_untouched(self):
        """Investment "accounts" the user writes in caps (EPF, PPF) stay as typed."""
        normalizer = DataNormalizer()

        assert normalizer._standardize_account("EPF") == "EPF"
        assert normalizer._standardize_account("PPF") == "PPF"

    def test_normalize_from_dict_preserves_all_caps_account(self):
        """End-to-end through the web-upload entry point, not just the helper."""
        normalized = DataNormalizer().normalize_from_dict(
            {
                "date": "2026-06-01",
                "amount": 250.0,
                "currency": "INR",
                "type": "Exp.",
                "account": "CC: AXIS Google Flex",
                "category": "PPF",
                "subcategory": None,
                "note": None,
            }
        )

        assert normalized["account"] == "CC: AXIS Google Flex"
        assert normalized["category"] == "PPF"


class TestTransferCategoryCarriesDestination:
    """The transfer category label is load-bearing for transfer IDENTITY.

    ``reconciler_transfers.reconcile_transfers_batch`` hashes
    (date, amount, from_account, note, category, subcategory, type) and never
    passes ``to_account``, so the destination reaches the SHA-256 only through
    this category string. Collapsing the label to a constant "Transfer" would
    therefore make two same-day, same-amount transfers to DIFFERENT
    destinations hash alike and silently drop the second as a batch duplicate
    (measured: 6 of 1,217 transfers on one live workbook, 0 of 1,211 on
    another). De-polluting the taxonomy needs ``to_account`` threaded into the
    transfer hash first; these tests pin that order of operations.
    """

    @staticmethod
    def _transfer(to_account: str) -> dict[str, object]:
        return DataNormalizer().normalize_from_dict(
            {
                "date": "2026-03-04",
                "amount": 50000.0,
                "currency": "INR",
                "type": "Transfer-Out",
                "account": "Bank: Slice",
                "category": to_account,
                "subcategory": None,
                "note": None,
            }
        )

    def test_destination_is_recoverable_from_the_hashed_fields(self):
        """Two transfers differing ONLY in destination must not hash alike."""
        to_hdfc = self._transfer("Bank: HDFC")
        to_sbi = self._transfer("Bank: SBI")

        hasher = TransactionHasher()

        def transfer_id(row: dict[str, object]) -> str:
            return hasher.generate_transaction_id(
                date=row["date"],
                amount=row["amount"],
                account=row["from_account"],
                note=row["note"],
                category=row["category"],
                subcategory=row["subcategory"],
                tx_type=row["type"],
                user_id=1,
            )

        assert to_hdfc["to_account"] == "Bank: HDFC"
        assert to_sbi["to_account"] == "Bank: SBI"
        assert transfer_id(to_hdfc) != transfer_id(to_sbi)

    def test_transfer_legs_of_one_transfer_agree_on_the_category(self):
        """The In and Out leg of the same real transfer must produce one label."""
        out_leg = DataNormalizer().normalize_from_dict(
            {
                "date": "2026-03-04",
                "amount": 50000.0,
                "currency": "INR",
                "type": "Transfer-Out",
                "account": "Bank: Slice",
                "category": "Bank: HDFC",
                "subcategory": None,
                "note": None,
            }
        )
        in_leg = DataNormalizer().normalize_from_dict(
            {
                "date": "2026-03-04",
                "amount": 50000.0,
                "currency": "INR",
                "type": "Transfer-In",
                "account": "Bank: HDFC",
                "category": "Bank: Slice",
                "subcategory": None,
                "note": None,
            }
        )

        assert out_leg["from_account"] == in_leg["from_account"] == "Bank: Slice"
        assert out_leg["to_account"] == in_leg["to_account"] == "Bank: HDFC"
        assert out_leg["category"] == in_leg["category"]
        assert out_leg["transfer_leg"] == "out"
        assert in_leg["transfer_leg"] == "in"

    def test_format_transfer_category_matches_the_label_normalizer_rows_writes(self):
        """The helper and the two inlined f-strings must not drift apart.

        ``normalizer_rows`` cannot import ``format_transfer_category`` (it is
        the lower-level module of the pair, so the import would cycle), so this
        pins the shared form: rebuilding the label from the row's own accounts
        must reproduce the label the normalizer already stored. Any change to
        one form fails here, and ``SyncEngine._canonicalize_account_casing``
        rebuilds the label through the helper on every import.
        """
        row = self._transfer("Bank: HDFC")

        assert row["category"] == format_transfer_category("Bank: Slice", "Bank: HDFC")


def _expense_row(**overrides: Any) -> dict[str, Any]:
    row: dict[str, Any] = {
        "date": "2026-06-01",
        "amount": 100.0,
        "currency": "INR",
        "type": "Expense",
        "account": "Bank: Slice",
        "category": "Groceries",
        "subcategory": None,
        "note": "note",
    }
    row.update(overrides)
    return row


def _category_totals(session: Session, user: User) -> dict[str, tuple[int, float]]:
    """What ``/api/calculations/category-breakdown`` groups by, for this user."""
    stmt = (
        select(Transaction.category, func.count(), func.sum(Transaction.amount))
        .where(Transaction.user_id == user.id)
        .group_by(Transaction.category)
    )
    return {cat: (n, float(total)) for cat, n, total in session.execute(stmt)}


class TestCategoryCaseFoldingThroughSyncEngine:
    """Case-variant categories must land in ONE taxonomy bucket per user.

    ``_standardize_category`` deliberately preserves user casing (so "EPF" is
    not rewritten to "Epf"), which means "GROCERIES" and "Groceries" both reach
    the reconciler. Consumers compare exactly -- ``api/calculations.py`` filters
    ``Transaction.category == category`` -- so a split silently halves any
    per-category total. ``SyncEngine._canonicalize_category_casing`` folds them.
    """

    def test_variants_in_one_batch_fold_to_the_first_spelling(
        self, test_db_session: Session, test_user: User
    ) -> None:
        SyncEngine(test_db_session, user_id=test_user.id).import_rows(
            [
                _expense_row(category="GROCERIES", note="a"),
                _expense_row(category="Groceries", note="b"),
                _expense_row(category="groceries", note="c"),
            ],
            file_name="june.xlsx",
            file_hash="hash-1",
        )

        assert _category_totals(test_db_session, test_user) == {"GROCERIES": (3, 300.0)}

    def test_new_upload_folds_onto_the_spelling_already_in_the_ledger(
        self, test_db_session: Session, test_user: User
    ) -> None:
        engine = SyncEngine(test_db_session, user_id=test_user.id)
        engine.import_rows([_expense_row(category="Groceries")], "june.xlsx", "hash-1")
        engine.import_rows(
            [_expense_row(category="GROCERIES", note="later")], "july.xlsx", "hash-2"
        )

        assert _category_totals(test_db_session, test_user) == {"Groceries": (2, 200.0)}

    def test_distinct_categories_are_not_merged(
        self, test_db_session: Session, test_user: User
    ) -> None:
        """Folding is per lowercased label -- unrelated categories stay separate."""
        SyncEngine(test_db_session, user_id=test_user.id).import_rows(
            [_expense_row(category="Groceries"), _expense_row(category="Rent", note="rent")],
            file_name="june.xlsx",
            file_hash="hash-1",
        )

        assert set(_category_totals(test_db_session, test_user)) == {"Groceries", "Rent"}

    def test_folding_is_user_scoped(self, test_db_session: Session, test_user: User) -> None:
        other = User(
            email="other@example.com", is_active=True, is_verified=True, hashed_password=""
        )
        test_db_session.add(other)
        test_db_session.commit()

        SyncEngine(test_db_session, user_id=test_user.id).import_rows(
            [_expense_row(category="Groceries")], "a.xlsx", "hash-a"
        )
        SyncEngine(test_db_session, user_id=other.id).import_rows(
            [_expense_row(category="GROCERIES")], "b.xlsx", "hash-b"
        )

        assert set(_category_totals(test_db_session, test_user)) == {"Groceries"}
        assert set(_category_totals(test_db_session, other)) == {"GROCERIES"}


class TestAccountCasingThroughSyncEngine:
    """What the account-casing fix does and does not change, via ``import_rows``.

    ``_standardize_account`` no longer rewrites "CC: AXIS Google Flex", but that
    only decides the spelling a FRESH import stores. Once a spelling is in the
    ledger it wins, so the fix is deliberately inert for an existing ledger.
    """

    @staticmethod
    def _accounts(session: Session, user: User) -> set[str]:
        stmt = select(Transaction.account).where(Transaction.user_id == user.id).distinct()
        return {name for (name,) in session.execute(stmt)}

    def test_fresh_import_keeps_the_users_all_caps_spelling(
        self, test_db_session: Session, test_user: User
    ) -> None:
        SyncEngine(test_db_session, user_id=test_user.id).import_rows(
            [_expense_row(account="CC: AXIS Google Flex")], "june.xlsx", "hash-1"
        )

        assert self._accounts(test_db_session, test_user) == {"CC: AXIS Google Flex"}

    def test_existing_ledger_spelling_still_wins_over_a_new_upload(
        self, test_db_session: Session, test_user: User
    ) -> None:
        """No retroactive rename: re-uploads converge on stored data.

        A user whose history was imported before the fix keeps "CC: Axis Google
        Flex". Fixing that is the account_case_fold_2026 migration / a rename
        feature, not the importer.
        """
        engine = SyncEngine(test_db_session, user_id=test_user.id)
        engine.import_rows([_expense_row(account="CC: Axis Google Flex")], "june.xlsx", "hash-1")
        engine.import_rows(
            [_expense_row(account="CC: AXIS Google Flex", note="later")], "july.xlsx", "hash-2"
        )

        assert self._accounts(test_db_session, test_user) == {"CC: Axis Google Flex"}
