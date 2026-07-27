"""Data normalization and preprocessing.

This module provides comprehensive data cleaning and normalization:
- Date parsing from various formats
- Amount normalization to Decimal with 2 decimal places
- Text cleaning (whitespace, unicode, special characters)
- Category and account name standardization
- Transaction type mapping
"""

import re
import unicodedata
from collections.abc import Callable
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any, ClassVar

import pandas as pd

from ledger_sync.db.models import TransactionType

# NormalizationError is defined in normalizer_rows (the lower-level module) and
# re-exported here so the canonical `ledger_sync.ingest.normalizer.NormalizationError`
# import path keeps working. Previously BOTH modules declared their own class, so
# errors raised by the row mixin were a DIFFERENT type than the one upload.py and
# sync_engine.py catch -- they escaped every handler as a raw 500.
from ledger_sync.ingest.normalizer_rows import NormalizationError, NormalizeRowsMixin

__all__ = ["DataNormalizer", "NormalizationError", "format_transfer_category"]


FOOD_AND_DINING = "Food & Dining"
ENTERTAINMENT_AND_RECREATIONS = "Entertainment & Recreations"
TRANSFER_IN = "transfer in"
TRANSFER_IN_HYPHEN = "transfer-in"
TRANSFER_OUT_HYPHEN = "transfer-out"


def format_transfer_category(from_account: str, to_account: str) -> str:
    """Build the per-pair category label stored on a transfer row.

    Single definition of the label so a future de-pollution pass has one place
    to change. ``normalizer_rows`` still inlines the same f-string at its two
    transfer sites (it is the lower-level module of the pair, so importing this
    would be a cycle); ``TestTransferCategoryCarriesDestination`` asserts a
    normalized row's label equals this helper's output, so the forms cannot
    drift apart silently.
    """
    return f"Transfer: {from_account} → {to_account}"


def _recase_bank_token(canonical: str) -> Callable[[re.Match[str]], str]:
    """Build a re.sub replacement that only re-cases all-lowercase matches.

    "hdfc" becomes the canonical "HDFC", but any match where the user chose
    the casing themselves is returned untouched: "AXIS" stays "AXIS" and
    "Bob" stays "Bob" (BANK_CANONICAL_NAMES maps "bob" -> "BOB" for Bank of
    Baroda, which would otherwise shout a person's name). See
    :meth:`DataNormalizer._standardize_account`.
    """

    def replace(match: re.Match[str]) -> str:
        matched = match.group(0)
        return canonical if matched.islower() else matched

    return replace


class DataNormalizer(NormalizeRowsMixin):
    """Normalizes and cleans raw Excel data into consistent format."""

    # Common category name corrections (typos, inconsistencies)
    CATEGORY_CORRECTIONS: ClassVar[dict[str, str]] = {
        "food & dinning": FOOD_AND_DINING,
        "food and dining": FOOD_AND_DINING,
        "food&dining": FOOD_AND_DINING,
        "entertianment": ENTERTAINMENT_AND_RECREATIONS,
        "entertainment": ENTERTAINMENT_AND_RECREATIONS,
        "entertainments": ENTERTAINMENT_AND_RECREATIONS,
        "transportation": "Transportation",
        "transport": "Transportation",
        "healthcare": "Healthcare",
        "health care": "Healthcare",
        "health": "Healthcare",
        "utilites": "Utilities",
        "utilities": "Utilities",
        "educaton": "Education",
        "education": "Education",
        "personal care": "Personal Care",
        "personalcare": "Personal Care",
        "charity": "Charity",
        "donation": "Charity",
        "donations": "Charity",
    }

    # Regex patterns for text cleaning
    MULTI_SPACE_PATTERN = re.compile(r"\s+")
    CONTROL_CHAR_PATTERN = re.compile(r"[\x00-\x1f\x7f-\x9f]")
    URL_PATTERN = re.compile(r"https?://\S+|www\.\S+")

    def _clean_text(self, text: str) -> str:
        """Clean text by removing problematic characters and normalizing whitespace.

        Args:
            text: Raw text string

        Returns:
            Cleaned text

        """
        if not text:
            return ""

        # Unicode normalization (NFKC - compatibility decomposition + canonical composition)
        text = unicodedata.normalize("NFKC", text)

        # Remove control characters (except newlines which we'll convert to spaces)
        text = self.CONTROL_CHAR_PATTERN.sub("", text)

        # Replace multiple whitespace (including newlines, tabs) with single space
        text = self.MULTI_SPACE_PATTERN.sub(" ", text)

        # Strip leading/trailing whitespace
        return text.strip()

    def _clean_note(self, note: str) -> str:
        """Clean note field with additional processing.

        Args:
            note: Raw note string

        Returns:
            Cleaned note

        """
        if not note:
            return ""

        # Basic text cleaning
        note = self._clean_text(note)

        # Optionally shorten very long URLs to just domain
        # (keeps the info but reduces noise)
        def shorten_url(match: re.Match[str]) -> str:
            url = match.group(0)
            # Extract domain from URL
            domain_match = re.search(r"(?:https?://)?(?:www\.)?([^/\s]+)", url)
            if domain_match:
                return str(f"[{domain_match.group(1)}]")
            return str(url)

        return self.URL_PATTERN.sub(shorten_url, note)

    def _standardize_category(self, category: str) -> str:
        """Standardize category name for consistency.

        Casing rule, in precedence order: an entry in
        :attr:`CATEGORY_CORRECTIONS` wins (matched case-insensitively);
        all-lowercase input is title-cased ("housing" -> "Housing", which reads
        as "didn't reach for shift"); anything else is preserved verbatim.
        Preserving all-caps matters because Indian finance acronyms (EPF, PPF,
        NPS, TDS) were being rewritten to "Epf" / "Ppf".

        This method sees one label at a time and cannot merge case variants.
        Collapsing "GROCERIES" and "Groceries" onto one taxonomy entry is
        ``SyncEngine._canonicalize_category_casing``'s job -- it has the user's
        existing ledger to fold onto.

        Args:
            category: Raw category name

        Returns:
            Standardized category name

        """
        if not category:
            return ""

        # Clean text first
        category = self._clean_text(category)

        # Check for known corrections (case-insensitive)
        category_lower = category.lower()
        if category_lower in self.CATEGORY_CORRECTIONS:
            return self.CATEGORY_CORRECTIONS[category_lower]

        # Lowercase-only input gets title-cased; everything else (all-caps
        # acronyms, mixed case) is the user's intent and stays verbatim.
        if category.islower():
            return category.title()

        return category

    # Canonical casing for common Indian bank names. Keys are lowercased
    # tokens as they appear in the account name; the value is the display
    # form we want. Matched as whole words (case-insensitive, ignoring
    # surrounding whitespace) so "sbi bank" becomes "SBI bank" and
    # "hdfc Credit Card" becomes "HDFC Credit Card".
    #
    # This table encodes *our* opinion about how each bank spells itself, so
    # it only ever fixes casing the user clearly did not choose: all-lowercase.
    # Any token the user shift-keyed ("AXIS", "Bob") is left alone -- see
    # _standardize_account.
    BANK_CANONICAL_NAMES: ClassVar[dict[str, str]] = {
        "sbi": "SBI",
        "hdfc": "HDFC",
        "icici": "ICICI",
        "axis": "Axis",
        "kotak": "Kotak",
        "yes": "Yes",
        "idfc": "IDFC",
        "idfc first": "IDFC First",
        "indusind": "IndusInd",
        "pnb": "PNB",
        "bob": "BOB",
        "boi": "BOI",
        "canara": "Canara",
        "union": "Union",
        "federal": "Federal",
        "rbl": "RBL",
        "idbi": "IDBI",
        "citi": "Citi",
        "citibank": "Citibank",
        "hsbc": "HSBC",
        "standard chartered": "Standard Chartered",
        "dbs": "DBS",
        "au small finance": "AU Small Finance",
    }

    def _standardize_account(self, account: str) -> str:
        """Standardize account name for consistency.

        Applies canonical casing to known bank-name tokens while preserving
        the rest of the label, so "hdfc bank" becomes "HDFC bank".

        **Only all-lowercase tokens are re-cased.** The canonical table is our
        house style, not the user's; imposing it on a label the user shift-keyed
        rewrote real account names ("CC: AXIS Google Flex" -> "CC: Axis Google
        Flex") and would shout a person's name ("Bob" -> "BOB", since "bob" is
        the Bank of Baroda key). Case variants that survive this are merged per
        user by ``SyncEngine._canonicalize_account_casing``.
        """
        if not account:
            return ""

        account = self._clean_text(account)

        # Sort keys longest-first so "idfc first" is matched before "idfc",
        # and "standard chartered" before "standard". Case-insensitive
        # whole-token match; _recase_bank_token decides whether the matched
        # spelling is actually ours to change.
        for token in sorted(self.BANK_CANONICAL_NAMES, key=len, reverse=True):
            canonical = self.BANK_CANONICAL_NAMES[token]
            pattern = re.compile(rf"\b{re.escape(token)}\b", re.IGNORECASE)
            account = pattern.sub(_recase_bank_token(canonical), account)

        return account

    def normalize_date(self, value: Any) -> datetime:
        """Normalize date value to datetime.

        Args:
            value: Raw date value

        Returns:
            Normalized datetime

        Raises:
            NormalizationError: If date cannot be parsed

        """
        if pd.isna(value):
            msg = "Date value is missing"
            raise NormalizationError(msg)

        if isinstance(value, datetime):
            return value

        try:
            result = pd.to_datetime(value)
            if isinstance(result, pd.Timestamp):
                return result.to_pydatetime()
            return datetime(result.year, result.month, result.day)
        except (ValueError, TypeError) as e:
            msg = f"Cannot parse date '{value}': {e}"
            raise NormalizationError(msg) from e

    def normalize_amount(self, value: Any) -> Decimal:
        """Normalize amount to Decimal.

        Args:
            value: Raw amount value

        Returns:
            Normalized Decimal amount

        Raises:
            NormalizationError: If amount cannot be converted

        """
        if pd.isna(value):
            msg = "Amount value is missing"
            raise NormalizationError(msg)

        try:
            # Convert via str() straight to Decimal -- never through float --
            # so binary-float representation error and float's round-half-even
            # don't corrupt the amount (e.g. 2.675 must round to 2.68, not 2.67).
            # str() of a pandas/numpy numeric yields a decimal-string Decimal
            # can parse exactly. quantize applies ROUND_HALF_UP to 2 places.
            return Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        except (ValueError, InvalidOperation) as e:
            msg = f"Cannot convert amount '{value}': {e}"
            raise NormalizationError(msg) from e

    def normalize_string(self, value: Any) -> str:
        """Normalize string value with full cleaning.

        Args:
            value: Raw string value

        Returns:
            Normalized string (cleaned, lowercased)

        """
        if pd.isna(value):
            return ""

        cleaned = self._clean_text(str(value))
        return cleaned.lower()

    def normalize_string_preserve_case(self, value: Any) -> str:
        """Normalize string value while preserving case.

        Args:
            value: Raw string value

        Returns:
            Normalized string (cleaned, case preserved)

        """
        if pd.isna(value):
            return ""

        return self._clean_text(str(value))

    def normalize_transaction_type(self, value: Any) -> TransactionType:
        """Normalize transaction type (Income/Expense/Transfer).

        Args:
            value: Raw type value

        Returns:
            TransactionType enum value

        Raises:
            NormalizationError: If type cannot be determined

        """
        if pd.isna(value):
            msg = "Transaction type is missing"
            raise NormalizationError(msg)

        value_str = str(value).strip().lower()

        # Map various representations to our enum
        type_mapping = {
            "exp.": TransactionType.EXPENSE,
            "expense": TransactionType.EXPENSE,
            "expenses": TransactionType.EXPENSE,
            "income": TransactionType.INCOME,
            "transfer": TransactionType.TRANSFER,
            TRANSFER_IN_HYPHEN: TransactionType.TRANSFER,
            TRANSFER_IN: TransactionType.TRANSFER,
            TRANSFER_OUT_HYPHEN: TransactionType.TRANSFER,
            "transfer out": TransactionType.TRANSFER,
        }

        transaction_type = type_mapping.get(value_str)
        if transaction_type is None:
            msg = f"Unknown transaction type: {value}"
            raise NormalizationError(msg)

        return transaction_type
