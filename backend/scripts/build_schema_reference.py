"""Build a source-derived schema dictionary without connecting to any database.

Regenerates ``docs/DATABASE_SCHEMA_REFERENCE.md``, ``docs/DATABASE_SCHEMA_REFERENCE.json``
and ``docs/DATABASE_MODEL_SCHEMA.sql`` from the working-tree SQLAlchemy metadata, the
salary API schemas and the migration source. Run from the repository root with::

    uv run --directory backend python scripts/build_schema_reference.py

The outputs are written with CRLF line endings, matching the checked-out docs.
"""

import ast
import hashlib
import inspect
import json
from datetime import datetime
from enum import Enum as PythonEnum
from pathlib import Path
from zoneinfo import ZoneInfo

from sqlalchemy import CheckConstraint, Integer, UniqueConstraint, create_mock_engine
from sqlalchemy.dialects import postgresql, sqlite

from ledger_sync.db import models
from ledger_sync.db._models.compensation import CompensationDecimal
from ledger_sync.db.base import Base
from ledger_sync.schemas.salary import (
    GrowthAssumptions,
    RsuGrant,
    RsuVesting,
    SalaryComponents,
)

# backend/scripts/<this file> -> repository root.
ROOT = Path(__file__).resolve().parents[2]
DIALECT = postgresql.dialect()
SQLITE_DIALECT = sqlite.dialect()


def base_commit() -> str:
    """The checkout's HEAD commit, read from the git directory without running git."""
    git_dir = ROOT / ".git"
    if git_dir.is_file():  # a linked worktree: ".git" names its private git dir
        git_dir = (ROOT / git_dir.read_text(encoding="utf-8").partition(":")[2].strip()).resolve()
    head = (git_dir / "HEAD").read_text(encoding="utf-8").strip()
    if not head.startswith("ref: "):
        return head  # detached HEAD
    ref = head.removeprefix("ref: ")
    common = git_dir / "commondir"
    if common.exists():  # worktree refs live in the shared git dir
        git_dir = (git_dir / common.read_text(encoding="utf-8").strip()).resolve()
    if (git_dir / ref).exists():
        return (git_dir / ref).read_text(encoding="utf-8").strip()
    for line in (git_dir / "packed-refs").read_text(encoding="utf-8").splitlines():
        sha, _, name = line.partition(" ")
        if name == ref:
            return sha
    raise SystemExit(f"Cannot resolve {ref} to a commit.")


COMMIT = base_commit()
AS_OF = datetime.now(ZoneInfo("Asia/Kolkata")).date().isoformat()


def write_doc(path: Path, text: str) -> None:
    """Write *text* as UTF-8 with CRLF line endings, like the checked-out docs.

    Trailing whitespace is stripped (SQLAlchemy DDL ends column lines with a
    space) so the output is already what the trailing-whitespace hook commits.
    """
    stripped = "\n".join(line.rstrip() for line in text.split("\n"))
    path.write_text(stripped, encoding="utf-8", newline="\r\n")


# Relative links describe this working tree, including unpublished source files.
GITHUB = "../"
OUT = ROOT / "docs"

# Purpose, grain, and actual usage are editorial descriptions of the inspected source.
GROUPS = {
    "Identity, settings and diagnostics": [
        "users",
        "user_preferences",
        "user_ai_settings",
        "audit_logs",
        "ai_usage_log",
        "column_mapping_logs",
    ],
    "Ledger, imports and organization": [
        "transactions",
        "import_logs",
        "ledger_accounts",
        "ledger_account_aliases",
        "ledger_categories",
        "ledger_subcategories",
        "categorization_rules",
        "transaction_tags",
        "saved_filter_views",
    ],
    "Compensation": ["salary_plans", "rsu_grants", "rsu_vestings"],
    "Planning and review": [
        "recurring_transactions",
        "scheduled_transactions",
        "anomalies",
        "budgets",
        "financial_goals",
        "tax_records",
    ],
    "Calculated analytics": [
        "analytics_state",
        "daily_summaries",
        "monthly_summaries",
        "category_trends",
        "cohort_spending",
        "transfer_flows",
        "merchant_intelligence",
        "fy_summaries",
        "net_worth_snapshots",
        "investment_holdings",
    ],
}
INFO = {
    "users": (
        "Login identity, profile and token revocation.",
        "One application user.",
        "Authoritative identity",
        (
            "Email is unique. OAuth provider plus provider ID is unique when populated. No "
            "separate database table for each login session: token_version participates in JWT "
            "revocation."
        ),
    ),
    "user_preferences": (
        "Display, category classification, budget, tax and growth preferences.",
        "At most one preferences row per user.",
        "User configuration",
        (
            "A unique user_id enforces one-to-one ownership. The remaining flexible "
            "lists/objects are JSON encoded in TEXT. Account limits, AI configuration, salary "
            "plans and RSU grants are stored in their own domain records and aggregated into the "
            "existing preferences API."
        ),
    ),
    "user_ai_settings": (
        "AI funding mode, provider/model selection, encrypted credentials and token limits.",
        "At most one AI settings row per user.",
        "User configuration",
        (
            "user_id is both PK and owner FK. Credentials are encrypted ciphertext; no values "
            "are read by this generator. NULL token limits mean unlimited and zero blocks calls. "
            "Legacy unknown timestamps remain NULL. AI configuration is independent of analytics "
            "preferences."
        ),
    ),
    "audit_logs": (
        "Operation and change records.",
        "One recorded operation/change.",
        "Audit",
        (
            "user_id is nullable. entity_type plus entity_id is a logical reference, not a "
            "foreign key. Source writers determine what is recorded; the schema does not "
            "guarantee an immutable, complete audit trail."
        ),
    ),
    "ai_usage_log": (
        "Provider/model usage, token reservations and estimated cost.",
        "One recorded provider call or reservation.",
        "Usage accounting",
        (
            "Contains token and cost metadata, not a conversation transcript. App-funded Bedrock "
            "calls are recorded on the server; browser-direct provider usage is self-reported. "
            "Cost is approximate FLOAT USD."
        ),
    ),
    "column_mapping_logs": (
        "Original spreadsheet headers, mapped headers and validation diagnostics.",
        "One intended parser-mapping diagnostic event.",
        "Diagnostic model",
        (
            "No user_id or foreign key. A search of backend/src found no ColumnMappingLog "
            "construction outside the model. Treat this as a defined diagnostic table, not proof "
            "that current web uploads populate it."
        ),
    ),
    "transactions": (
        "Income, expense and transfer ledger, including soft-deleted history.",
        "One logical financial transaction.",
        "Ledger source of truth",
        (
            "Public transaction_id remains stable. source_fingerprint is a separate versioned "
            "import identity. Account/category text remains a historical display snapshot "
            "alongside nullable dimension IDs. Six user-leading indexes cover active rows only."
        ),
    ),
    "import_logs": (
        "Import idempotency and reconciliation results.",
        "One current record per user and file hash.",
        "Import metadata",
        (
            "A forced re-import updates the existing record and counts. This is not an "
            "append-only attempt log. file_name/source_file are metadata, not stored spreadsheet "
            "binaries or a foreign key to transactions."
        ),
    ),
    "ledger_accounts": (
        "Stable account identities, classifications, closure state and credit limits.",
        "One lowercased account key per user.",
        "Identity catalog plus user configuration",
        (
            "Keys use Python str.lower(), without fuzzy merging, whitespace normalization or "
            "Unicode casefolding. name keeps the first observed spelling. Account aliases "
            "resolve historical labels in bulk. A NULL classification/credit limit is "
            "unconfigured, distinct from an explicit value or zero. Closing preserves "
            "transaction history. The former account_classifications table is removed."
        ),
    ),
    "ledger_account_aliases": (
        "Source account labels mapped to stable account identities.",
        "One lowercased source label per user.",
        "Derived identity catalog",
        (
            "Multiple aliases can reference one account. The FK includes user_id. No "
            "alias-management or account-merging API is defined by this model."
        ),
    ),
    "ledger_categories": (
        "Stable category identities.",
        "One lowercased category key per user.",
        "Derived identity catalog",
        (
            "Transaction label snapshots remain intact. Budgets, rules and existing summaries "
            "still use text category labels rather than category foreign keys."
        ),
    ),
    "ledger_subcategories": (
        "Stable subcategory identities within a category.",
        "One lowercased subcategory key per user and parent category.",
        "Derived identity catalog",
        (
            "The parent FK includes owner and category. Transaction references include owner, "
            "parent category and subcategory, preventing mismatched parentage."
        ),
    ),
    "salary_plans": (
        "Exact salary components for each fiscal year.",
        "One user and fiscal year.",
        "User compensation configuration",
        (
            "The unique owner/fiscal-year key preserves plan identity across edits. Position "
            "retains API object order. CompensationDecimal stores unscaled NUMERIC in PostgreSQL "
            "and decimal TEXT in SQLite, with no two-decimal quantization. A NULL HRA remains "
            "unknown, distinct from zero."
        ),
    ),
    "rsu_grants": (
        "Stable public grant identities, stock-price assumptions and grant metadata.",
        "One public grant ID per user.",
        "User compensation configuration",
        (
            "The internal integer ID differs from public_id returned as API id. Public IDs are "
            "unique within their owner. Prices retain original precision without currency "
            "conversion. The API's whole-list replacement preserves unchanged rows and grant "
            "order."
        ),
    ),
    "rsu_vestings": (
        "Individually identified RSU vesting events and received-share actuals.",
        "One vesting event, including legitimate identical repeats.",
        "User compensation configuration",
        (
            "The TEXT primary key receives an application-generated UUID; it is not a sequence "
            "or timestamp. The composite (user_id, grant_id) FK enforces parent ownership. "
            "Position preserves order; there is no uniqueness on date or event content. Gross "
            "quantity is integral; net_quantity is exact and may be fractional or zero. NULL "
            "net_quantity/price_at_vest remain unknown. Optional API event IDs target "
            "edits/deletions; ID-less saves deterministically match equal occurrences without "
            "deduplication."
        ),
    ),
    "categorization_rules": (
        "Ordered rules that assign category and subcategory.",
        "One rule per user; multiple rules are allowed.",
        "User configuration",
        (
            "API validates match_field as note or account. Matching is case-insensitive "
            "contains, ordered by sort_order then id; first match wins. Import fingerprints are "
            "captured before applying rules."
        ),
    ),
    "transaction_tags": (
        "Free-string annotations attached to transactions.",
        "One exact tag per user and transaction.",
        "User annotation",
        (
            "Tags are trimmed and case-sensitive. There is no separate tags lookup table. The "
            "owner-qualified transaction FK cascades on hard deletion; soft deletion does not "
            "invoke FK cascades."
        ),
    ),
    "saved_filter_views": (
        "Saved Transactions-page filter configurations.",
        "One named view per user.",
        "User configuration",
        (
            "filters is opaque JSON text. The frontend owns its FilterValues keys; POST upserts "
            "by name. A saved view does not copy transaction rows."
        ),
    ),
    "recurring_transactions": (
        "Detected or manually maintained recurring patterns.",
        "One recurring pattern, not one occurrence.",
        "Derived patterns plus user confirmation",
        (
            "pattern_kind distinguishes commitment from habit. Only appropriate commitments "
            "should feed bills/expected payments. No FK links each source transaction to a "
            "pattern."
        ),
    ),
    "scheduled_transactions": (
        "Expected future cash flows.",
        "One planned schedule.",
        "Planning data",
        (
            "Excluded from historical transaction totals. Optional source FK includes user_id "
            "and uses NO ACTION, not cascading deletion. Application code explicitly unlinks "
            "schedules before replacing detected sources."
        ),
    ),
    "anomalies": (
        "Detected outliers, metrics and review state.",
        "One detected anomaly; a transaction link is optional.",
        "Derived findings plus user review",
        (
            "A linked transaction must belong to the same user. Hard-deleting that transaction "
            "cascades to the anomaly. A period-only anomaly may have NULL transaction_id."
        ),
    ),
    "budgets": (
        "Category/subcategory limits and computed progress.",
        "One budget scope per user, category and optional subcategory.",
        "User limits plus calculated tracking",
        (
            "Separate partial unique indexes enforce category-only and subcategory scopes, "
            "including inactive budgets. monthly_limit must be positive. Category names are text "
            "links."
        ),
    ),
    "financial_goals": (
        "Savings, investment, debt-payoff or custom goals.",
        "One user-defined goal.",
        "Planning data",
        (
            "target_amount must be positive. Progress fields are stored values, not "
            "database-generated columns. No account or transaction FK allocates contributions to "
            "a goal."
        ),
    ),
    "tax_records": (
        "Fiscal-year income, tax payments and deduction records.",
        "One stored tax record; multiple rows per user/year are allowed by this schema.",
        "Tax record model",
        (
            "The user/year index is not unique. AI tax-reporting code reads this table. No "
            "TaxRecord construction was found outside the model in backend/src, so a current "
            "upload writer is not established by this review."
        ),
    ),
    "analytics_state": (
        "Durable input versions, published versions and invalidation state.",
        "At most one state row per user.",
        "Refresh coordination",
        (
            "user_id is both PK and FK. Writers mark ledger/preferences changes; refresh "
            "compares input and published versions. Dirty-day JSON enables selective "
            "daily/monthly recomputation; other domains can rebuild."
        ),
    ),
    "daily_summaries": (
        "Daily totals and counts for charts/heatmaps.",
        "One user and YYYY-MM-DD day.",
        "Rebuildable aggregate",
        (
            "date is a string key, not PostgreSQL DATE. The unique user/date index prevents "
            "duplicate daily cells. Values are calculated in application code."
        ),
    ),
    "monthly_summaries": (
        "Monthly income, consumption, transfers, savings and comparisons.",
        "One user and YYYY-MM month.",
        "Rebuildable aggregate",
        (
            "Capital losses are separate from consumption expenses but still reduce cash "
            "savings. Amounts and percentages are stored, not computed by database triggers."
        ),
    ),
    "category_trends": (
        "Monthly category/subcategory metrics by transaction type.",
        "One user/month/category/optional-subcategory/type cell.",
        "Rebuildable aggregate",
        (
            "NULL-aware uniqueness uses two partial indexes. Category/subcategory values are "
            "text snapshots, not dimension FKs."
        ),
    ),
    "cohort_spending": (
        "Average spending by weekday, day of month or month of year.",
        "One user/dimension/bucket cell.",
        "Rebuildable aggregate",
        (
            "Occurrences count actual eligible calendar periods, including zero-spend periods. "
            "avg_amount = total_amount / max(1, occurrences). This is temporal grouping, not a "
            "user-cohort table."
        ),
    ),
    "transfer_flows": (
        "All-time transfers between account-label pairs.",
        "One user/from-account/to-account pair.",
        "Rebuildable aggregate",
        (
            "The pair is unique per user. Labels and account types support flow/Sankey views. "
            "There are no account-dimension FKs here."
        ),
    ),
    "merchant_intelligence": (
        "Merchant or description-level spending and recurrence statistics.",
        "One user/merchant_name/label_kind cell.",
        "Rebuildable aggregate",
        (
            "brand is a recognized merchant label; descriptor is a purchase description and "
            "should not be presented as a confirmed payee. Descriptor case remains significant. "
            "No merchant_id exists on transactions."
        ),
    ),
    "fy_summaries": (
        "Fiscal-year income, spending, tax, investment and savings totals.",
        "One user/fiscal_year cell.",
        "Rebuildable aggregate",
        (
            "Fiscal-year boundaries depend on preferences, with April as the default start. "
            "fiscal_year and tax_records.financial_year are text keys, not linked by an FK."
        ),
    ),
    "net_worth_snapshots": (
        "Asset, liability and net-worth totals at a point in time.",
        "One user and exact snapshot timestamp; writer convention makes these daily snapshots.",
        "Calculated snapshot",
        (
            "The unique key is (user_id, snapshot_date), not a database DATE-only expression. "
            "Net worth is a balance and must not be summed across snapshots."
        ),
    ),
    "investment_holdings": (
        "Ledger-derived invested principal and current account value.",
        "Writer currently produces one holding per detected investment account.",
        "Rebuildable estimate",
        (
            "No unique account key enforces this writer convention. Current value is based on "
            "ledger cash flows, not live market valuation. The current generator sets "
            "realized/unrealized gains to zero when it cannot infer them."
        ),
    ),
}

COMMON = {
    "id": "Internal integer row identifier.",
    "user_id": "Owning application user; see the foreign-key section.",
    "created_at": "Row creation timestamp supplied by the application.",
    "updated_at": (
        "Last ORM update timestamp; onupdate is application behavior, not a database trigger."
    ),
    "last_updated": "Last application update/calculation timestamp.",
    "last_calculated": "Timestamp of the calculation that stored this result.",
    "is_active": "Whether this record is currently active.",
    "name": "User-facing name.",
    "description": "Descriptive text.",
    "note": "Optional free-text description.",
    "notes": "Optional free-text notes.",
    "category": "Category label; a text value, not itself a foreign key.",
    "subcategory": "Optional subcategory label; a text value, not itself a foreign key.",
    "account": "Account label; see dimension IDs on transactions.",
    "account_id": "Stable ledger account ID; qualified by user_id in its FK.",
    "category_id": "Stable ledger category ID; qualified by user_id in its FK.",
    "subcategory_id": "Stable subcategory ID; qualified by user_id and category_id.",
    "from_account": "Source account label for a transfer.",
    "to_account": "Destination account label for a transfer.",
    "type": "Transaction kind; database enum names and API values are listed below.",
    "transaction_type": "Transaction kind for this pattern/aggregate.",
    "amount": "Transaction/planned amount in INR.",
    "period_key": "Calendar month key, YYYY-MM.",
    "source_file": "Source filename/entry marker, not the file contents.",
    "file_name": "Original/import filename metadata.",
    "file_hash": "SHA-256 file hash used to recognize imports.",
    "total_income": "Income total for this row's time scope.",
    "salary_income": "Salary-classified income for this scope.",
    "investment_income": "Investment-classified income for this scope.",
    "other_income": "Other income for this scope.",
    "total_expenses": "Consumption expense total under the app's classification rules.",
    "capital_losses": (
        "User-classified realized investment losses, separate from consumption expenses."
    ),
    "net_savings": "Stored cash savings after relevant expenses and capital losses.",
    "savings_rate": "Stored savings percentage under the calculation contract.",
    "income_count": "Number of income transactions.",
    "expense_count": "Number of expense transactions.",
    "transfer_count": "Number of transfer transactions.",
    "total_transactions": "Number of transactions across the counted types.",
    "total_amount": "Sum of amounts for this row's grouping scope.",
    "transaction_count": "Number of transactions in this grouping.",
    "avg_transaction": "Mean transaction amount in this grouping.",
    "max_transaction": "Largest transaction amount in this grouping.",
    "min_transaction": "Smallest transaction amount in this grouping.",
    "expected_day": "Expected calendar day, interpreted with the recurrence frequency.",
    "frequency": "Recurrence frequency enum.",
    "key": "Python-lowercased identity key, scoped by the table's unique key.",
}
MEANINGS = {
    "users": {
        "email": "Unique account email.",
        "hashed_password": (
            "Password hash, never a plaintext password; may be empty for OAuth users."
        ),
        "full_name": "Optional profile name.",
        "is_verified": "Account/email verification state.",
        "auth_provider": "OAuth provider name; NULL for an identity without an OAuth provider.",
        "auth_provider_id": "User identifier issued by that OAuth provider.",
        "token_version": "JWT revocation counter; existing tokens carry its version.",
        "last_login": "Most recent recorded login timestamp.",
    },
    "user_preferences": {
        "fiscal_year_start_month": "First month of the fiscal year; default 4 (April).",
        "essential_categories": "JSON array of category labels treated as essential.",
        "investment_account_mappings": "JSON object mapping account patterns to investment types.",
        "taxable_income_categories": "JSON array of taxable income Category::Subcategory keys.",
        "investment_returns_categories": "JSON array of investment-return income keys.",
        "non_taxable_income_categories": "JSON array of non-taxable income keys.",
        "other_income_categories": "JSON array of other-income keys.",
        "capital_loss_categories": (
            "JSON array of expense keys explicitly classified as realized investment losses."
        ),
        "default_budget_alert_threshold": "Default budget usage percentage that triggers an alert.",
        "auto_create_budgets": "Preference controlling automatic budget creation.",
        "budget_rollover_enabled": "Preference enabling budget rollover behavior.",
        "number_format": "Number grouping style, such as indian or international.",
        "currency_symbol": "Display symbol; does not change accounting currency.",
        "currency_symbol_position": "Display placement before/after the number.",
        "default_time_range": "Preferred initial reporting range.",
        "display_currency": "Display conversion currency; stored transactions remain INR.",
        "anomaly_expense_threshold": "Expense-to-baseline multiplier used by anomaly settings.",
        "anomaly_types_enabled": "JSON array of enabled anomaly API values.",
        "auto_dismiss_recurring_anomalies": (
            "Preference for suppressing recognized recurring anomalies."
        ),
        "recurring_min_confidence": "Minimum displayed recurring-pattern confidence, percent.",
        "recurring_auto_confirm_occurrences": (
            "Configured occurrence threshold for recurring confirmation."
        ),
        "needs_target_percent": "Target needs share, percent.",
        "wants_target_percent": "Target wants share, percent.",
        "savings_target_percent": "Target savings share, percent.",
        "earning_start_date": "Optional YYYY-MM-DD date string.",
        "use_earning_start_date": "Whether reports apply the earning-start boundary.",
        "fixed_expense_categories": "JSON array of fixed-expense Category::Subcategory keys.",
        "savings_goal_percent": "Savings target percentage.",
        "monthly_investment_target": (
            "Monthly investment target amount; currently FLOAT, not NUMERIC."
        ),
        "payday": "Configured payday in the month.",
        "preferred_tax_regime": "Preferred tax regime, default new.",
        "excluded_accounts": "JSON array of account names excluded from analytics.",
        "notify_budget_alerts": "Budget-alert preference.",
        "notify_anomalies": "Anomaly-notification preference.",
        "notify_upcoming_bills": "Upcoming-bill notification preference.",
        "notify_days_ahead": "Advance notice window in days.",
        "show_tds_schedule": "Opt-in display of the projected monthly TDS schedule.",
        "epf_withdrawal_taxable": "User choice to treat EPF withdrawal inflows as taxable.",
        "epf_taxable_percent": "Taxable share when EPF taxation is enabled, percent.",
        "salary_is_net_of_tds": (
            "Whether recorded salary is net of TDS and reporting should infer gross pay."
        ),
        "growth_assumptions": "JSON object of salary/bonus/stock projection assumptions.",
    },
    "user_ai_settings": {
        "ai_mode": "app_bedrock or byok provider-funding mode.",
        "ai_provider": "Optional BYOK provider selection.",
        "ai_model": "Optional BYOK model selection.",
        "ai_api_key_encrypted": (
            "Encrypted BYOK API key ciphertext; value must not be exposed in reports."
        ),
        "ai_daily_token_limit": (
            "Optional personal daily token budget; NULL means unlimited, zero blocks calls."
        ),
        "ai_monthly_token_limit": (
            "Optional personal monthly token budget; NULL means unlimited, zero blocks calls."
        ),
        "created_at": (
            "Creation timestamp; historical unknown values may be NULL. New rows receive a default."
        ),
        "updated_at": (
            "Last update timestamp; historical unknown values may be NULL. Updates use an ORM "
            "callable."
        ),
    },
    "salary_plans": {
        "fiscal_year": "Fiscal-year API key, YYYY-YY for consecutive years.",
        "position": "Zero-based order in the salary_structure API object.",
        "base_salary_annual": "Annual base salary, retained as an exact decimal.",
        "hra_annual": "Optional annual HRA; NULL is unknown and zero is explicitly configured.",
        "bonus_annual": "Annual bonus amount.",
        "epf_monthly": (
            "Employee monthly EPF cash deduction, not a new-regime income-tax deduction."
        ),
        "nps_monthly": "Monthly NPS contribution.",
        "special_allowance_annual": "Annual special allowance.",
        "other_taxable_annual": "Other annual taxable compensation.",
    },
    "rsu_grants": {
        "public_id": "Existing public grant ID, unique per user; serialized as id in the API.",
        "position": "Zero-based grant order in the rsu_grants API list.",
        "stock_name": "Stock/company label supplied for this grant.",
        "stock_price": (
            "Exact stock-price assumption in the API's display-currency convention; not "
            "converted or rounded by storage."
        ),
        "grant_date": "Optional actual grant calendar date.",
    },
    "rsu_vestings": {
        "id": "Stable application-generated UUID string identifying this individual event.",
        "grant_id": "Internal parent grant ID; qualified by user_id in its FK.",
        "position": "Zero-based event order within the grant; equal events remain separate.",
        "date": "Vesting calendar date; duplicate dates are permitted.",
        "quantity": "Positive integral gross shares before tax withholding.",
        "price_at_vest": "Optional exact stock price locked at vesting; NULL means unknown.",
        "net_quantity": (
            "Exact received shares after withholding, including fractional shares; NULL is "
            "unknown and zero is full withholding."
        ),
    },
    "transactions": {
        "transaction_id": "Stable public SHA-256-shaped primary key; legacy IDs are retained.",
        "source_fingerprint": (
            "Nullable v2 canonical-source hash including occurrence; independent of mutable "
            "category rules."
        ),
        "fingerprint_version": "1 for legacy identity; 2 for current fingerprint format.",
        "date": "Transaction timestamp/calendar date; SQL type has no timezone.",
        "currency": "Accounting currency; database CHECK allows INR only.",
        "from_account_id": "Source transfer account dimension ID, qualified by owner.",
        "to_account_id": "Destination transfer account dimension ID, qualified by owner.",
        "last_seen_at": "Most recent reconciliation sighting.",
        "is_deleted": "Soft-delete flag; active ledger reads exclude true rows.",
    },
    "import_logs": {
        "imported_at": "Latest import time for this user/file-hash record.",
        "rows_processed": "Count processed in the recorded import.",
        "rows_inserted": "Count inserted as new ledger rows.",
        "rows_updated": "Count updated during reconciliation.",
        "rows_deleted": "Count marked deleted by snapshot reconciliation.",
        "rows_skipped": "Count skipped by import processing.",
    },
    "ledger_accounts": {
        "name": "First observed account spelling.",
        "account_type": (
            "Optional AccountType selection; NULL is unconfigured, not an inferred Other Wallets "
            "value."
        ),
        "is_closed": "Closed flag; historical ledger rows remain.",
        "closed_date": "Optional informational closure timestamp.",
        "credit_limit": (
            "Optional nonnegative exact NUMERIC(15,2) limit; NULL is unconfigured and zero is "
            "explicit."
        ),
        "created_at": (
            "Creation timestamp; legacy identities without classification history may be NULL."
        ),
        "updated_at": "Last configuration update; may be NULL until an update is recorded.",
    },
    "ledger_categories": {"name": "First observed category spelling."},
    "ledger_subcategories": {"name": "First observed subcategory spelling."},
    "ledger_account_aliases": {
        "source_key": "Exact Python-lowercased source account label.",
        "label": "First observed spelling of that source label.",
    },
    "audit_logs": {
        "user_id": "Optional actor/owner; nullable for records without an attached user.",
        "operation": "Operation label such as upload or reconcile.",
        "entity_type": "Logical entity kind, such as transaction.",
        "entity_id": "Optional logical identifier; not enforced as an FK.",
        "action": "Action label such as create, update, delete or soft_delete.",
        "old_value": "Optional JSON-encoded prior state.",
        "new_value": "Optional JSON-encoded new state.",
        "changes_summary": "Human-readable description of changes.",
        "user_agent": "Optional client user-agent context.",
    },
    "column_mapping_logs": {
        "original_columns": "JSON array of original spreadsheet header names.",
        "mapped_columns": "JSON object mapping original headers to normalized field names.",
        "unmapped_columns": "Optional JSON array of ignored/unmapped headers.",
        "is_valid": "Whether mapping validation succeeded.",
        "validation_errors": "Optional JSON array of validation errors.",
        "validation_warnings": "Optional JSON array of validation warnings.",
    },
    "ai_usage_log": {
        "timestamp": "UTC usage/reservation budget-window timestamp, stored without timezone.",
        "provider": "Provider name associated with this call.",
        "model": "Provider model identifier.",
        "funding_source": "app, personal or legacy credential-funding attribution.",
        "status": "reserved, completed or failed.",
        "reserved_tokens": "Nonnegative reserved token budget.",
        "input_tokens": "Recorded input token count.",
        "output_tokens": "Recorded output token count.",
        "tool_rounds": "Recorded round count; one user message can trigger several calls.",
        "cost_usd": "Precomputed approximate USD cost, stored as FLOAT.",
    },
    "categorization_rules": {
        "match_field": "Field to search: note or account, enforced by API validation.",
        "pattern": "Case-insensitive substring to match.",
        "sort_order": "Ascending rule priority; id breaks ties.",
    },
    "transaction_tags": {
        "transaction_id": "Required owner-qualified link to the tagged transaction.",
        "tag": "Trimmed, case-sensitive tag string.",
    },
    "saved_filter_views": {"filters": "Opaque JSON-encoded frontend filter object."},
    "analytics_state": {
        "user_id": "Owner, primary key and users FK; at most one state row per user.",
        "ledger_version": "Current ledger input generation.",
        "preferences_version": "Current analytics-affecting settings generation.",
        "algorithm_version": "Current analytics algorithm generation.",
        "published_ledger_version": "Ledger generation represented by published summaries.",
        "published_preferences_version": "Settings generation represented by published summaries.",
        "published_algorithm_version": "Algorithm generation represented by published summaries.",
        "full_rebuild_required": "Whether refresh must rebuild all relevant periods.",
        "dirty_dates": "JSON array of dirty YYYY-MM-DD dates; bounded by refresh logic.",
        "published_at": "Last successful summary publication timestamp.",
    },
    "daily_summaries": {
        "date": "YYYY-MM-DD day key, stored as VARCHAR(10).",
        "net": "Daily income minus consumption expenses minus classified capital losses.",
        "top_category": "Highest expense category for that day.",
    },
    "monthly_summaries": {
        "year": "Calendar year.",
        "month": "Calendar month number.",
        "essential_expenses": "Expenses classified as essential.",
        "discretionary_expenses": "Expenses classified as discretionary.",
        "total_transfers_out": "Aggregated outgoing transfer amount.",
        "total_transfers_in": "Aggregated incoming transfer amount.",
        "net_investment_flow": "Net transfer flow into classified investment accounts.",
        "expense_ratio": "Stored expense ratio under the calculation contract.",
        "income_change_pct": "Income change relative to previous month, percent.",
        "expense_change_pct": "Expense change relative to previous month, percent.",
    },
    "category_trends": {
        "pct_of_monthly_total": "Share of the relevant monthly total, percent.",
        "mom_change": "Absolute month-over-month change in amount.",
        "mom_change_pct": "Month-over-month change, percent.",
    },
    "cohort_spending": {
        "dimension": "day_of_week, day_of_month or month_of_year.",
        "bucket": "0..6 Sunday..Saturday; 1..31 day-of-month; 1..12 month-of-year.",
        "occurrences": "Eligible calendar occurrences used as the average divisor.",
        "avg_amount": "total_amount divided by max(1, occurrences).",
    },
    "transfer_flows": {
        "avg_transfer": "Mean transfer amount for this account pair.",
        "last_transfer_date": "Most recent matching transfer timestamp.",
        "last_transfer_amount": "Amount of the most recent matching transfer.",
        "from_account_type": "Source account classification label.",
        "to_account_type": "Destination account classification label.",
    },
    "merchant_intelligence": {
        "merchant_name": "Extracted brand or description label.",
        "merchant_aliases": "Optional JSON array of label variations.",
        "label_kind": "brand or descriptor; descriptor is not a confirmed merchant identity.",
        "primary_category": "Dominant category label.",
        "primary_subcategory": "Optional dominant subcategory label.",
        "total_spent": "Spending total for this label and kind.",
        "first_transaction": "First matching transaction timestamp.",
        "last_transaction": "Last matching transaction timestamp.",
        "months_active": "Number of active calendar months.",
        "avg_days_between": "Average gap between occurrences, in days.",
        "is_recurring": "Calculated recurrence signal.",
    },
    "fy_summaries": {
        "fiscal_year": "Fiscal-year label, for example FY2024-25.",
        "start_date": "Fiscal-year start boundary.",
        "end_date": "Fiscal-year end boundary.",
        "bonus_income": "Bonus-classified income.",
        "tax_paid": "Tax payments classified from the ledger.",
        "investments_made": "Calculated investment amount for the year.",
        "yoy_income_change": "Year-over-year income change.",
        "yoy_expense_change": "Year-over-year expense change.",
        "yoy_savings_change": "Year-over-year savings change.",
        "is_complete": "Whether the fiscal-year reporting period is complete.",
    },
    "net_worth_snapshots": {
        "snapshot_date": "Point-in-time timestamp; unique together with user_id.",
        "cash_and_bank": "Cash and bank balances.",
        "investments": "Investment total; do not blindly add it again to its component breakdown.",
        "mutual_funds": "Mutual-fund component.",
        "stocks": "Stock component.",
        "fixed_deposits": "Fixed-deposit component.",
        "ppf_epf": "PPF/EPF component.",
        "other_assets": "Other asset balances.",
        "credit_card_outstanding": "Outstanding credit-card liability.",
        "loans_payable": "Loans payable liability.",
        "other_liabilities": "Other liabilities.",
        "total_assets": "Calculated total assets.",
        "total_liabilities": "Calculated total liabilities.",
        "net_worth": "Total assets minus total liabilities.",
        "net_worth_change": "Absolute change from prior snapshot.",
        "net_worth_change_pct": "Percentage change from prior snapshot.",
        "source": "Origin marker such as upload, manual or api.",
    },
    "investment_holdings": {
        "investment_type": "Investment category, such as stocks or mutual funds.",
        "instrument_name": "Optional instrument label.",
        "invested_amount": "Estimated principal deployed from ledger flows.",
        "current_value": "Ledger-flow value estimate, not live quoted market value.",
        "realized_gains": (
            "Stored realized-gain field; current generator uses zero when not inferable."
        ),
        "unrealized_gains": (
            "Stored unrealized-gain field; current generator uses zero without market data."
        ),
    },
    "recurring_transactions": {
        "pattern_name": "Recurring-pattern display name.",
        "expected_amount": "Expected amount per occurrence.",
        "amount_variance": "Allowed amount variation around the expected value.",
        "confidence_score": "Detection confidence, conventionally 0..100.",
        "occurrences_detected": "Number of observed occurrences.",
        "pattern_kind": "commitment or habit.",
        "last_occurrence": "Last observed occurrence.",
        "next_expected": "Next predicted occurrence.",
        "times_missed": "Stored missed-occurrence count.",
        "is_user_confirmed": "Whether the pattern has user confirmation.",
        "first_detected": "Timestamp when pattern was first detected.",
    },
    "scheduled_transactions": {
        "next_due_date": "Next planned payment/receipt timestamp.",
        "end_date": "Optional schedule end; NULL means no configured end.",
        "recurring_transaction_id": "Optional owner-qualified source pattern ID.",
    },
    "anomalies": {
        "anomaly_type": "AnomalyType enum.",
        "severity": "Severity label: low, medium, high or critical by convention.",
        "transaction_id": "Optional owner-qualified link to a ledger transaction.",
        "expected_value": "Baseline/expected amount used by the detector.",
        "actual_value": "Observed amount used by the detector.",
        "deviation_pct": "Deviation from expected value, percent.",
        "is_reviewed": "Whether the finding has been reviewed.",
        "is_dismissed": "Whether the finding has been dismissed.",
        "review_notes": "User's review annotation.",
        "detected_at": "Detection timestamp.",
        "reviewed_at": "Optional review timestamp.",
    },
    "budgets": {
        "monthly_limit": "Positive monthly limit for the category scope.",
        "alert_threshold_pct": "Usage percentage at which to alert.",
        "current_month_spent": "Calculated current-month spending.",
        "current_month_remaining": "Calculated remaining amount.",
        "current_month_pct": "Calculated budget usage percentage.",
        "avg_monthly_actual": "Historical mean monthly spending.",
        "months_over_budget": "Stored count of months exceeding the limit.",
        "months_under_budget": "Stored count of months below the limit.",
    },
    "financial_goals": {
        "goal_type": "savings, investment, debt_payoff or custom by API convention.",
        "target_amount": "Positive goal target amount.",
        "current_amount": "Stored accumulated progress amount.",
        "target_date": "Optional target completion date.",
        "progress_pct": "Stored completion percentage.",
        "monthly_target": "Stored monthly contribution target.",
        "on_track": "Stored progress assessment.",
        "status": "GoalStatus enum.",
        "completed_at": "Optional completion timestamp.",
    },
    "tax_records": {
        "financial_year": "Financial-year label, for example 2024-25; not unique per user.",
        "gross_salary": "Gross salary component in INR.",
        "bonus": "Bonus component in INR.",
        "stipend": "Stipend component in INR.",
        "rsu": "RSU income component in INR.",
        "total_gross_income": "Total gross income.",
        "tds_deducted": "Tax deducted at source.",
        "advance_tax": "Advance tax paid.",
        "self_assessment_tax": "Self-assessment tax paid.",
        "total_tax_paid": "Total recorded tax paid.",
        "standard_deduction": "Standard deduction amount.",
        "section_80c": "Section 80C deduction.",
        "section_80d": "Section 80D deduction.",
        "other_deductions": "Other deduction amounts.",
        "total_deductions": "Total recorded deductions.",
        "taxable_income": "Net taxable income.",
        "uploaded_at": "Recorded upload/entry timestamp.",
    },
}


def source_link(path, line=None):
    relative = Path(path).resolve().relative_to(ROOT).as_posix()
    return GITHUB + relative + (f"#L{line}" if line else "")


def sql(value):
    return str(value.compile(dialect=DIALECT, compile_kwargs={"literal_binds": True}))


def default_value(value, expression=None):
    if value is None:
        return None
    arg = value.arg
    if callable(arg):
        return "application callable: " + (
            expression or getattr(arg, "__qualname__", type(arg).__name__)
        )
    if isinstance(arg, PythonEnum):
        return f"{arg.__class__.__name__}.{arg.name} (DB: {arg.name})"
    if hasattr(arg, "compile"):
        return sql(arg)
    return repr(arg)


def cell(value):
    return str(value if value is not None else "-").replace("|", "\\|").replace("\n", " ")


def constraint_dialects(constraint):
    condition = getattr(constraint, "_ddl_if", None)
    if condition is None or condition.dialect is None:
        return ["postgresql", "sqlite"]
    return [condition.dialect] if isinstance(condition.dialect, str) else list(condition.dialect)


def migration_revisions():
    revisions = {}
    for path in sorted((ROOT / "backend/src/ledger_sync/db/migrations/versions").glob("20*.py")):
        values = {}
        for node in ast.parse(path.read_text(encoding="utf-8")).body:
            if isinstance(node, ast.Assign):
                targets = [target.id for target in node.targets if isinstance(target, ast.Name)]
            elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
                targets = [node.target.id]
            else:
                continue
            for target in targets:
                if target in {"revision", "down_revision"}:
                    values[target] = ast.literal_eval(node.value)
        if "revision" in values:
            if values["revision"] in revisions:
                raise SystemExit(f"Duplicate revision id: {values['revision']}")
            revisions[values["revision"]] = {**values, "path": path}
    return revisions


REVISIONS = migration_revisions()
PARENTS = {
    parent
    for revision in REVISIONS.values()
    for parent in (
        revision["down_revision"]
        if isinstance(revision["down_revision"], (tuple, list))
        else [revision["down_revision"]]
    )
    if parent is not None
}
HEADS = sorted(set(REVISIONS) - PARENTS)
if len(HEADS) != 1:
    raise SystemExit(f"Expected one migration head, found {HEADS}")
HEAD = HEADS[0]

tables = []
missing = []
classes = {
    c.__tablename__: c
    for c in (getattr(models, n) for n in models.__all__)
    if inspect.isclass(c) and hasattr(c, "__tablename__")
}
references = {name: [] for name in classes}
class_tables = {cls.__name__: name for name, cls in classes.items()}
for path in sorted((ROOT / "backend/src/ledger_sync").rglob("*.py")):
    if "db" in path.relative_to(ROOT / "backend/src/ledger_sync").parts:
        continue
    tree = ast.parse(path.read_text(encoding="utf-8"))
    mentions = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Name) and node.id in class_tables:
            table_name = class_tables[node.id]
            mentions[table_name] = min(mentions.get(table_name, node.lineno), node.lineno)
    for table_name, line in mentions.items():
        references[table_name].append(
            {
                "path": path.relative_to(ROOT).as_posix(),
                "line": line,
                "url": source_link(path, line),
            }
        )

enum_types = {}
for group, names in GROUPS.items():
    for name in names:
        table = Base.metadata.tables[name]
        cls = classes[name]
        path = Path(inspect.getfile(cls))
        line = inspect.getsourcelines(cls)[1]
        ast_class = next(
            n
            for n in ast.parse(path.read_text(encoding="utf-8")).body
            if isinstance(n, ast.ClassDef) and n.name == cls.__name__
        )
        column_nodes = {
            n.target.id: n
            for n in ast_class.body
            if isinstance(n, ast.AnnAssign) and isinstance(n.target, ast.Name)
        }
        columns = []
        for column in table.columns:
            meaning = MEANINGS.get(name, {}).get(column.name, COMMON.get(column.name))
            if meaning is None:
                missing.append(f"{name}.{column.name}")
                meaning = column.name.replace("_", " ").capitalize() + "."
            enum_class = getattr(column.type, "enum_class", None)
            if enum_class:
                enum_types[column.type.name] = {
                    "python_class": enum_class.__name__,
                    "database_labels": column.type.enums,
                    "api_values": [v.value for v in enum_class],
                    "mapping": {v.name: v.value for v in enum_class},
                    "used_by": sorted(
                        {
                            *enum_types.get(column.type.name, {}).get("used_by", []),
                            f"{name}.{column.name}",
                        }
                    ),
                }
            declaration = column_nodes[column.name]
            expressions = (
                {keyword.arg: ast.unparse(keyword.value) for keyword in declaration.value.keywords}
                if isinstance(declaration.value, ast.Call)
                else {}
            )
            columns.append(
                {
                    "name": column.name,
                    "type": str(column.type.compile(dialect=DIALECT)),
                    "types": {
                        "postgresql": str(column.type.compile(dialect=DIALECT)),
                        "sqlite": str(column.type.compile(dialect=SQLITE_DIALECT)),
                    },
                    "storage_adapter": type(column.type).__name__,
                    "storage_note": (
                        "Exact Decimal: unscaled PostgreSQL NUMERIC; SQLite TEXT avoids "
                        "binary-float "
                        "conversion. API decimals serialize as strings. No fixed two-decimal scale."
                        if isinstance(column.type, CompensationDecimal)
                        else None
                    ),
                    "nullable": column.nullable,
                    "primary_key": column.primary_key,
                    "application_default": default_value(
                        column.default, expressions.get("default")
                    ),
                    "model_server_default": default_value(
                        column.server_default, expressions.get("server_default")
                    ),
                    "application_on_update": default_value(
                        column.onupdate, expressions.get("onupdate")
                    ),
                    "auto_integer_primary_key": bool(
                        column.primary_key
                        and column.autoincrement in ("auto", True)
                        and isinstance(column.type, Integer)
                        and column.name == "id"
                    ),
                    "meaning": meaning,
                    "source": source_link(path, declaration.lineno),
                }
            )
        fks = []
        for fk in sorted(
            table.foreign_key_constraints,
            key=lambda k: (k.name or "", tuple(c.name for c in k.columns)),
        ):
            fks.append(
                {
                    "name": fk.name,
                    "columns": [e.parent.name for e in fk.elements],
                    "target_table": fk.referred_table.name,
                    "target_columns": [e.column.name for e in fk.elements],
                    "on_delete": fk.ondelete or "NO ACTION",
                    "on_update": fk.onupdate or "NO ACTION",
                    "match": fk.match or "SIMPLE",
                    "deferrable": bool(fk.deferrable),
                }
            )
        unique = [
            {"name": c.name, "columns": [col.name for col in c.columns]}
            for c in table.constraints
            if isinstance(c, UniqueConstraint)
        ]
        checks = [
            {
                "name": c.name,
                "expression": sql(c.sqltext),
                "dialects": constraint_dialects(c),
            }
            for c in table.constraints
            if isinstance(c, CheckConstraint)
        ]
        indexes = []
        for idx in sorted(table.indexes, key=lambda i: i.name):
            where = idx.dialect_options["postgresql"].get("where")
            indexes.append(
                {
                    "name": idx.name,
                    "unique": idx.unique,
                    "expressions": [sql(e) for e in idx.expressions],
                    "predicate": sql(where) if where is not None else None,
                    "method": idx.dialect_options["postgresql"].get("using") or "btree",
                }
            )
        purpose, grain, kind, notes = INFO[name]
        tables.append(
            {
                "schema": "public",
                "name": name,
                "group": group,
                "purpose": purpose,
                "grain": grain,
                "data_kind": kind,
                "notes": notes,
                "model": cls.__name__,
                "model_source": source_link(path, line),
                "columns": columns,
                "primary_key": [c.name for c in table.primary_key],
                "foreign_keys": fks,
                "unique_constraints": sorted(unique, key=lambda c: c["name"] or ""),
                "checks": sorted(checks, key=lambda c: c["name"] or ""),
                "indexes": indexes,
                "code_references": references[name],
            }
        )

if {t["name"] for t in tables} != set(Base.metadata.tables):
    raise SystemExit("GROUPS must list every model table exactly once.")
if missing:
    raise SystemExit(f"Columns without a MEANINGS or COMMON entry: {missing}")
OWNER_FKS = sum(fk["target_table"] == "users" for table in tables for fk in table["foreign_keys"])
SOURCE_FILES = sorted(
    {Path(inspect.getfile(cls)).resolve() for cls in classes.values()}
    | {ROOT / "backend/src/ledger_sync/schemas/salary.py"}
    | {item["path"] for item in REVISIONS.values()}
    | {ROOT / reference["path"] for items in references.values() for reference in items}
)
data = {
    "as_of": AS_OF,
    "basis": (
        "Offline current working-tree SQLAlchemy metadata, API schemas and migration source; no "
        "database connection or remote inspection."
    ),
    "source_commit": COMMIT,
    "source_state": (
        "Working tree including uncommitted changes; source_commit is the base checkout only."
    ),
    # A list of {path, sha256}, never a path-keyed map: as a map, a digest keyed
    # by a path containing "auth" or "token" reads as a hard-coded secret to
    # SonarCloud (json:S6418). See the matching paragraph in the Markdown.
    "source_files_sha256": [
        {
            "path": path.relative_to(ROOT).as_posix(),
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        }
        for path in SOURCE_FILES
    ],
    "source_hash_scope": (
        "Model definitions, salary API schemas, migration revisions and every code-reference "
        "file linked by the dictionary."
    ),
    "source_migration_head": HEAD,
    "production": {
        "project": "neon-cinereous-compass",
        "project_id": "gentle-sunset-94386320",
        "branch": "main",
        "branch_id": "br-soft-moon-a1omep39",
        "database": "neondb",
        "role": "neondb_owner",
        "console_url": "https://console.neon.tech/app/projects/gentle-sunset-94386320",
        "provenance": "Historical context retained from the 2026-09-17 reference; not reverified.",
    },
    "live_verification": (
        "No live database or remote lookup in this refresh. The prior reference reported a Neon "
        "export header of PostgreSQL 17.11, but full export processing was blocked by approval "
        "review. Live parity and historical infrastructure identifiers remain unverified here."
    ),
    "counts": {
        "application_tables": len(tables),
        "columns": sum(len(t["columns"]) for t in tables),
        "foreign_keys": sum(len(t["foreign_keys"]) for t in tables),
        "explicit_indexes": sum(len(t["indexes"]) for t in tables),
        "unique_constraints": sum(len(t["unique_constraints"]) for t in tables),
        "check_constraints": sum(len(t["checks"]) for t in tables),
        "enum_types": len(enum_types),
    },
    "enum_types": enum_types,
    "tables": tables,
    "operational_tables": [
        {
            "name": "alembic_version",
            "basis": "Alembic implementation/configuration, not a current row read",
            "columns": [
                {
                    "name": "version_num",
                    "type": "VARCHAR(32)",
                    "nullable": False,
                    "primary_key": True,
                }
            ],
            "expected_head": HEAD,
        },
        {
            "name": "import_logs_duplicate_archive_20260917",
            "basis": (
                "Earlier user-reported execution of the archival repair; not confirmed by a "
                "parsed live catalog"
            ),
            "columns": [
                dict(
                    c,
                    nullable=True,
                    primary_key=False,
                    application_default=None,
                    model_server_default=None,
                    application_on_update=None,
                    auto_integer_primary_key=False,
                )
                for c in next(t for t in tables if t["name"] == "import_logs")["columns"]
            ],
            "note": (
                "CREATE TABLE AS copy: original constraints, indexes, defaults and ownership FK "
                "are not copied."
            ),
        },
    ],
}
data["counts_by_dialect"] = {
    dialect: {
        "check_constraints": sum(
            dialect in check["dialects"] for table in tables for check in table["checks"]
        ),
        "native_enum_types": len(enum_types) if dialect == "postgresql" else 0,
    }
    for dialect in ("postgresql", "sqlite")
}

ddl = []
engine = None


def dump(statement, *args, **kwargs):
    ddl.append(str(statement.compile(dialect=engine.dialect)).strip() + ";")


engine = create_mock_engine("postgresql+psycopg://", dump)
Base.metadata.create_all(engine, checkfirst=False)
# SQLAlchemy visits each table's index set in process-dependent order. All
# indexes can follow the dependency-ordered table DDL, sorted for stable output.
index_prefixes = ("CREATE INDEX ", "CREATE UNIQUE INDEX ")
ddl = [statement for statement in ddl if not statement.startswith(index_prefixes)] + sorted(
    statement for statement in ddl if statement.startswith(index_prefixes)
)
write_doc(
    OUT / "DATABASE_MODEL_SCHEMA.sql",
    "-- REFERENCE ONLY: generated offline from working-tree SQLAlchemy metadata on " + AS_OF + "\n"
    "-- Base checkout: " + COMMIT + "; includes uncommitted changes.\n"
    "-- Source migration head: " + HEAD + "\n"
    "-- Not a Neon dump, not a migration, and not a production restore script.\n"
    f"-- Includes {len(tables)} model tables and {data['counts']['columns']} columns. "
    "Excludes Alembic and the reported manual archive.\n"
    "-- Models do not capture every server default/name retained by historical migrations.\n"
    "-- Unqualified object names use the database search_path; public is the application "
    "convention.\n\n" + "\n\n".join(ddl) + "\n",
)

md = [
    "# Ledger Sync complete database schema reference",
    "",
    (
        f"Prepared {AS_OF}. This reference covers **all {len(tables)} application tables, "
        f"all {data['counts']['columns']} columns, all {data['counts']['foreign_keys']} "
        "declared foreign keys, "
        f"all {data['counts']['explicit_indexes']} explicit indexes, and every model "
        "unique/check constraint and enum**. "
        "It also documents Alembic's version table and the reported import-log archive separately."
    ),
    "",
    "## Navigation",
    "",
    "- [Database and evidence](#database-and-evidence)",
    "- [Table directory](#table-directory)",
    "- [How the tables connect](#how-the-tables-connect)",
    "- [Upload, fetch, edit and delete flow](#upload-fetch-edit-and-delete-flow)",
    "- [Types, defaults and enum values](#types-defaults-and-enum-values)",
    "- [Full table dictionary](#full-table-dictionary)",
    "- [All foreign keys](#all-foreign-keys)",
    "- [Nested JSON contracts](#nested-json-contracts)",
    "- [Operational tables](#operational-tables)",
    "- [Migration and model differences](#migration-and-model-differences)",
    "- [Scope and verification](#scope-and-verification)",
    "",
    (
        "Companion files: [structured JSON](DATABASE_SCHEMA_REFERENCE.json), "
        "[model-derived PostgreSQL DDL](DATABASE_MODEL_SCHEMA.sql), [existing database "
        "guide](DATABASE.md)."
    ),
    "",
    "In the JSON, `source_files_sha256` is a **list of `{path, sha256}` objects**, not a",
    "path-keyed map. Keep it that way when regenerating. As a map, any digest whose path",
    "contained `auth` or `token` (for example `services/auth_service.py` or",
    "`20260704_1000_add_token_version_to_users.py`) paired a credential-looking key with a",
    "high-entropy value, so SonarCloud's `json:S6418` reported seven BLOCKER hard-coded-secret",
    "findings and dropped the security rating to E. The values are file-content digests, never",
    "secrets; putting the path in a value and the digest under `sha256` keeps the provenance",
    "record without tripping the rule.",
    "",
    "## Database and evidence",
    "",
    "| Item | Value |",
    "| --- | --- |",
    (
        "| Neon project | "
        "[neon-cinereous-compass](https://console.neon.tech/app/projects/gentle-sunset-94386320) "
        "|"
    ),
    "| Project ID | `gentle-sunset-94386320` |",
    "| Production branch | `main` (`br-soft-moon-a1omep39`) |",
    "| Database / role | `neondb` / `neondb_owner` |",
    "| Application namespace | `public` |",
    (
        "| Engine | PostgreSQL model target; SQLite storage differences documented below. Prior "
        "reference reported PostgreSQL 17.11. |"
    ),
    (
        "| Source snapshot | Current working tree, including uncommitted changes; links resolve "
        "relative to this checkout. |"
    ),
    f"| Base checkout commit | `{COMMIT}`; does not identify the uncommitted model definitions. |",
    f"| Matching source migration head | `{HEAD}` |",
    (
        "| Infrastructure context | Project/branch/role identifiers above are retained from the "
        "prior reference and were not refreshed. |"
    ),
    "",
    (
        "**Evidence boundary:** this refresh uses only current local model metadata, API "
        "schemas and migration "
        "source. No live database, remote service, financial rows, credentials or connection "
        "strings were read. "
        "The prior 2026-09-17 reference reported a successful Neon export, but full "
        "processing was blocked by "
        "automatic approval review with “encrypted summary was created for a different "
        "account or model.” "
        "That historical note is retained as provenance, not fresh verification. This is an "
        "**application-model dictionary**; live objects/defaults are not confirmed. The JSON "
        "companion records "
        "source-file SHA-256 hashes so the working-tree evidence can be checked independently."
    ),
    "",
    (
        "A PostgreSQL **database** contains **schemas** (namespaces), which contain **tables**. "
        "For example: `neondb` → `public` → `transactions`. The source models do not create "
        "separate schemas "
        "for accounts, users or analytics. PostgreSQL also has system namespaces such as "
        "`pg_catalog` and "
        "`information_schema`; additional Neon-managed or extension namespaces are not "
        "inventoried here."
    ),
    "",
    "## Table directory",
    "",
]
for group, names in GROUPS.items():
    md += [
        f"### {group}",
        "",
        "| Table | What it stores | One row represents | Columns |",
        "| --- | --- | --- | ---: |",
    ]
    for name in names:
        t = next(t for t in tables if t["name"] == name)
        md.append(
            f"| [`{name}`](#{name}) | {cell(t['purpose'])} | {cell(t['grain'])} | "
            f"{len(t['columns'])} |"
        )
    md.append("")

md += [
    "## How the tables connect",
    "",
    (
        f"`users.id` is the ownership root. There are {OWNER_FKS} declared owner FKs from "
        "application child tables. "
        "`column_mapping_logs` has no owner column; `audit_logs.user_id` is optional. "
        "`user_preferences.user_id` is unique; `analytics_state.user_id` and "
        "`user_ai_settings.user_id` are "
        "primary keys, giving at most one row of each per user. Salary plans are unique per "
        "user/fiscal year, "
        "RSU grants per user/public ID, and vestings have independent event IDs."
    ),
    "",
    (
        "The diagrams summarize selected actual foreign keys. The complete "
        f"{data['counts']['foreign_keys']}-link register follows the dictionary."
    ),
    "",
    "```mermaid",
    "flowchart LR",
    '  U["users"] -->|owner| T["transactions"]',
    '  U -->|one per user| P["user_preferences"]',
    '  U -->|one per user| AI["user_ai_settings"]',
    '  U -->|one per user| S["analytics_state"]',
    '  A["ledger_accounts"] -->|user_id + account_id/from_account_id/to_account_id| T',
    '  A -->|user_id + account_id| AA["ledger_account_aliases"]',
    '  C["ledger_categories"] -->|user_id + category_id| T',
    '  C -->|user_id + category_id| SC["ledger_subcategories"]',
    "  SC -->|user_id + category_id + subcategory_id| T",
    '  T -->|user_id + transaction_id; hard-delete CASCADE| TT["transaction_tags"]',
    '  T -->|optional transaction link; hard-delete CASCADE| AN["anomalies"]',
    "```",
    "",
    "```mermaid",
    "flowchart LR",
    '  U["users"] -->|owner| R["recurring_transactions"]',
    '  U -->|owner| S["scheduled_transactions"]',
    "  R -->|user_id + recurring_transaction_id; optional; NO ACTION| S",
    "```",
    "",
    "```mermaid",
    "flowchart LR",
    '  U["users"] -->|owner; unique fiscal year| SP["salary_plans"]',
    '  U -->|owner; unique public grant ID| G["rsu_grants"]',
    '  U -->|owner| V["rsu_vestings"]',
    "  G -->|user_id + grant_id; CASCADE| V",
    "```",
    "",
    (
        "**Logical links are different from foreign keys.** Account and category labels in "
        "budgets, rules, "
        "recurring plans and summaries are plain strings; account "
        "classification/closure/limit settings now "
        "belong to the stable ledger account record. Analytics rows are derived from transactions "
        "through application calculations, but generally have no transaction-level FK. "
        "`source_file` does not "
        "link to `import_logs.id`; audit `entity_id` has no generic FK. There is no separate "
        "merchant master table, "
        "transaction-to-goal allocation table, uploaded-file binary table, or AI "
        "conversation table in these models."
    ),
    "",
    "## Upload, fetch, edit and delete flow",
    "",
    (
        "1. **Upload:** the browser parses a spreadsheet and sends validated JSON rows to "
        "the authenticated upload API. "
        "The request is a complete user ledger snapshot, not an append-only batch: entries "
        "absent from the snapshot "
        "can be soft-deleted. The API allows at most 100,000 rows and INR accounting amounts."
    ),
    (
        "2. **Identify:** the import records the file hash, locks the user, fingerprints "
        "source rows before "
        "categorization, and accounts for repeated identical source rows. Legacy public IDs "
        "are preserved when "
        "an exact, unambiguous match can adopt a v2 fingerprint."
    ),
    (
        "3. **Store:** rules assign categories, dimension identities are resolved in "
        "batches, and transactions "
        "are inserted/updated/restored or marked deleted. The import log and analytics "
        "invalidation versions "
        "are committed with the ledger changes."
    ),
    (
        "4. **Calculate:** application analytics refresh daily/monthly cells for affected "
        "dates where supported, "
        "and rebuild other affected domains. `analytics_state` records which versions were "
        "published. These are "
        "ordinary tables maintained by Python, not PostgreSQL materialized views or "
        "generated columns."
    ),
    (
        "5. **Fetch:** transaction reads filter by authenticated user and `is_deleted IS "
        "false`. Date/ID cursor "
        "pagination is used for sequential pages; offset remains available for arbitrary "
        "jumps. Summary APIs "
        "read aggregates where appropriate; some reports still calculate directly from the ledger."
    ),
    (
        "6. **Edit/delete:** writes must locate rows using owner plus identifier and "
        "invalidate affected analytics. "
        "Soft deletion keeps transaction identity and annotations. Hard deletion invokes "
        "transaction-child cascades. "
        "Deleting a recurring source requires unlinking dependent schedules first; deleting "
        "the user invokes owner cascades."
    ),
    (
        "7. **Domain settings:** preferences responses aggregate remaining "
        "`user_preferences`, account limits "
        "from `ledger_accounts`, configuration from `user_ai_settings`, and salary/RSU "
        "records. Caller-owned "
        "transactions and user locks coordinate writes. Compensation services compare/upsert "
        "existing records, "
        "preserve unchanged IDs and list order, and resolve bulk reads without one lookup "
        "per grant. The AI "
        "preferences summary reads normalized salary components by fiscal year."
    ),
    "",
    "Relevant implementation: "
    + ", ".join(
        f"[{label}]({GITHUB}{path})"
        for label, path in [
            ("upload contract", "backend/src/ledger_sync/schemas/upload.py"),
            ("sync engine", "backend/src/ledger_sync/core/sync_engine.py"),
            ("fingerprints", "backend/src/ledger_sync/ingest/hash_id.py"),
            (
                "dimension resolution",
                "backend/src/ledger_sync/services/ledger_dimensions.py",
            ),
            (
                "refresh/version logic",
                "backend/src/ledger_sync/core/analytics/refresh.py",
            ),
            ("transaction endpoints", "backend/src/ledger_sync/api/transactions.py"),
            ("pagination", "backend/src/ledger_sync/api/transaction_pagination.py"),
        ]
    )
    + ".",
    "",
    "## Types, defaults and enum values",
    "",
    (
        "- **PK** uniquely identifies a row. **FK** constrains a reference. A composite FK "
        "includes several columns "
        "and enforces ownership along with identity."
    ),
    (
        "- **NULL allowed** means the database permits a missing value. It is separate from "
        "whether an API field is "
        "required. Plain strings do not acquire database validation just because code "
        "comments describe allowed values."
    ),
    (
        "- **App default** is supplied by SQLAlchemy/Python. **DB default (model)** is "
        "explicitly declared in the model. "
        "A dash means no default declared there, not zero. Auto integer primary keys use "
        "PostgreSQL sequence/serial "
        "behavior in the generated DDL. Exact deployed sequence names need live catalog inspection."
    ),
    (
        "- **Date/time:** model `DateTime` compiles to `TIMESTAMP WITHOUT TIME ZONE`. Audit "
        "defaults call "
        "`datetime.now(UTC)`, but the column itself does not store timezone information. "
        "Ledger calendar dates must "
        "follow the app's date convention. Daily and monthly aggregate keys are VARCHAR strings."
    ),
    (
        "- **Money:** ledger and most planning/aggregate amounts use exact `NUMERIC(15,2)`. "
        "Ratios/confidence use "
        "FLOAT. `ledger_accounts.credit_limit` is `NUMERIC(15,2)`; its service rejects "
        "excess precision instead "
        "of silently rounding. `user_preferences.monthly_investment_target` remains FLOAT. "
        "SQLite's NUMERIC "
        "affinity is not equivalent to PostgreSQL's exact NUMERIC storage."
    ),
    (
        "- **CompensationDecimal:** salary components, grant prices, vest prices and net "
        "shares use "
        "**unscaled PostgreSQL NUMERIC** and **SQLite TEXT**, returning Python Decimal. TEXT "
        "prevents SQLite "
        "from converting precise decimal strings to binary floats. No two-decimal "
        "share/price assumption or "
        "currency conversion is applied. JSON API decimal values are strings. Three "
        "price/share CHECKs are "
        "PostgreSQL-only; service/schema validation applies in both dialects. NULL actuals "
        "stay unknown and "
        "zero net shares records full withholding."
    ),
    (
        "- **Vesting IDs:** `rsu_vestings.id` is TEXT with an application `lambda: "
        "str(uuid4())` default. "
        "It is neither an auto-incrementing integer nor a datetime default. Callable "
        "defaults below are "
        "extracted from their source expressions without executing them."
    ),
    (
        "- **JSON:** flexible objects/arrays use TEXT here, not native JSONB. JSON shape and "
        "meaning are enforced by "
        "application readers/validators, not PostgreSQL JSON types or GIN indexes."
    ),
    (
        "- **Enums:** SQLAlchemy Enum stores Python member **names** by default. The model "
        "and transaction CHECK "
        "use uppercase database labels, while API serialization uses the mapped values "
        "below. The introductory "
        "comment in enums.py saying values are stored directly should not override the "
        "actual column definition."
    ),
    (
        f"- **Indexes:** the {data['counts']['explicit_indexes']} count includes explicit "
        "model indexes, including unique indexes. It excludes indexes "
        "automatically backing PK and UNIQUE constraints. Default index method is B-tree. "
        "More indexes add write cost; "
        "their presence is not a measured guarantee of production latency."
    ),
    "",
    "| PostgreSQL enum type | Python enum | Database label → API value |",
    "| --- | --- | --- |",
]
for name, e in sorted(enum_types.items()):
    md.append(
        f"| `{name}` | `{e['python_class']}` | "
        + "; ".join(f"`{k}` → `{v}`" for k, v in e["mapping"].items())
        + " |"
    )
md += ["", "## Full table dictionary", ""]

for t in tables:
    name = t["name"]
    md += [
        f'<a id="{name}"></a>',
        f"### `{name}`",
        "",
        f"**Purpose:** {t['purpose']} **Grain:** {t['grain']} **Kind:** {t['data_kind']}.",
        "",
        f"**Model:** [`{t['model']}`]({t['model_source']}). **Primary key:** "
        + ", ".join(f"`{c}`" for c in t["primary_key"])
        + ".",
        "",
        t["notes"],
        "",
        (
            "| Column | PostgreSQL type | SQLite type | NULL allowed | App default | DB default "
            "(model) | Meaning |"
        ),
        "| --- | --- | --- | --- | --- | --- | --- |",
    ]
    for c in t["columns"]:
        default = c["application_default"]
        if c["auto_integer_primary_key"]:
            default = "Auto integer PK"
        md.append(
            f"| [`{c['name']}`]({c['source']}){' PK' if c['primary_key'] else ''} | "
            f"`{cell(c['type'])}` | `{cell(c['types']['sqlite'])}` | "
            f"{'Yes' if c['nullable'] else 'No'} | {cell(default)} | "
            f"{cell(c['model_server_default'])} | {cell(c['meaning'])} |"
        )
    md += ["", "**Foreign keys**", ""]
    if not t["foreign_keys"]:
        md += ["None declared.", ""]
    for f in t["foreign_keys"]:
        md.append(
            "- " + f"`({', '.join(f['columns'])})` → "
            f"[`{f['target_table']}`](#{f['target_table']}) `({', '.join(f['target_columns'])})`; "
            f"ON DELETE {f['on_delete']}, ON UPDATE {f['on_update']}; "
            f"name: `{f['name'] or '(database assigned)'}`."
        )
    if t["foreign_keys"]:
        md.append("")
    incoming = [
        (other["name"], f)
        for other in tables
        for f in other["foreign_keys"]
        if f["target_table"] == name
    ]
    if incoming:
        md += [
            "**Referenced by:** "
            + "; ".join(
                f"[`{child}`](#{child}) `({', '.join(f['columns'])})`" for child, f in incoming
            )
            + ".",
            "",
        ]
    md += ["**Additional UNIQUE constraints**", ""]
    md += [
        f"- `{u['name'] or '(database assigned)'}`: `({', '.join(u['columns'])})`."
        for u in t["unique_constraints"]
    ] or ["None beyond the primary key. Unique indexes are listed below."]
    md += ["", "**CHECK constraints**", ""]
    md += [
        f"- `{c['name']}`: `{c['expression']}`. Dialects: {', '.join(c['dialects'])}."
        for c in t["checks"]
    ] or ["None declared in the model."]
    md += ["", "**Explicit indexes**", ""]
    if not t["indexes"]:
        md += [
            "None declared; PK/UNIQUE constraints still create supporting indexes.",
            "",
        ]
    else:
        md += [
            "| Name | Keys in order | Unique | PostgreSQL predicate |",
            "| --- | --- | --- | --- |",
        ]
        for idx in t["indexes"]:
            keys = ", ".join(e.removeprefix(name + ".") for e in idx["expressions"])
            md.append(
                f"| `{idx['name']}` | `{keys}` | {'Yes' if idx['unique'] else 'No'} | "
                f"{'`' + idx['predicate'] + '`' if idx['predicate'] else 'All rows'} |"
            )
        md.append("")
    if t["code_references"]:
        md += [
            "**Code using this model** (references, not a promise of complete CRUD coverage):",
            "",
        ]
        md.extend(f"- [`{r['path']}`]({r['url']})" for r in t["code_references"])
    else:
        md += [
            (
                "**Code references:** no direct class use found outside the database package in "
                "backend/src."
            )
        ]
    md += ["", "[Back to table directory](#table-directory)", ""]

md += [
    "## All foreign keys",
    "",
    (
        "All model FKs use MATCH SIMPLE and are not declared DEFERRABLE. With an optional "
        "composite FK, "
        "a NULL component can leave that optional relationship unset. The separate owner FK "
        "still applies. "
        "Constraint names shown as database-assigned are not guessed."
    ),
    "",
    "| Child columns | Parent columns | Delete action |",
    "| --- | --- | --- |",
]
for t in tables:
    for f in t["foreign_keys"]:
        md.append(
            f"| [`{t['name']}`](#{t['name']}) `({', '.join(f['columns'])})` | "
            f"[`{f['target_table']}`](#{f['target_table']}) "
            f"`({', '.join(f['target_columns'])})` | {f['on_delete']} |"
        )

md += [
    "",
    "## Nested JSON contracts",
    "",
    (
        "API shape is separate from storage. The compensation and credit-limit shapes below "
        "are reconstructed "
        "from normalized domain records; remaining flexible settings are JSON **text**. "
        "Empty arrays/objects can mean unconfigured; readers must "
        "interpret the parsed value rather than treating a nonempty string such as "
        '`"[]"` as configured.'
    ),
    "",
    "| Fields | JSON shape | Storage |",
    "| --- | --- | --- |",
    (
        "| Preference category lists, excluded_accounts, anomaly_types_enabled | Array of "
        "strings; income/fixed-expense/loss classification commonly uses `Category::Subcategory` "
        "keys. | user_preferences TEXT columns |"
    ),
    (
        "| investment_account_mappings | Object: account pattern → investment-type string. | "
        "user_preferences TEXT column |"
    ),
    (
        "| credit_card_limits | Object: card label → numeric limit. | "
        "ledger_accounts.credit_limit; no preferences JSON column |"
    ),
    (
        "| salary_structure | Object: fiscal-year string → SalaryComponents object. | "
        "salary_plans rows |"
    ),
    (
        "| rsu_grants | Array of RsuGrant objects, each with ordered vestings. | rsu_grants and "
        "rsu_vestings rows |"
    ),
    "| growth_assumptions | GrowthAssumptions object. | user_preferences TEXT column |",
    "| analytics_state.dirty_dates | Array of YYYY-MM-DD strings. | TEXT |",
    (
        "| saved_filter_views.filters | Opaque frontend filter object; backend does not "
        "normalize its keys. | TEXT |"
    ),
    "| merchant_aliases | Array of alternate labels, when populated. | TEXT |",
    "| audit_logs.old_value / new_value | Operation-specific prior/new object. | TEXT |",
    (
        "| column mapping diagnostics | Header arrays, header mapping object, error/warning "
        "arrays. | TEXT |"
    ),
    "",
]

data["nested_json_contracts"] = {}
for cls in (SalaryComponents, RsuGrant, RsuVesting, GrowthAssumptions):
    schema = cls.model_json_schema()
    data["nested_json_contracts"][cls.__name__] = schema
    md += [
        f"### `{cls.__name__}` JSON object",
        "",
        "| Key | Contract | Required | Default | Description |",
        "| --- | --- | --- | --- | --- |",
    ]
    for name, prop in schema["properties"].items():
        contract = json.dumps(
            {k: v for k, v in prop.items() if k not in ("title", "description", "default")},
            ensure_ascii=False,
        )
        shown_default = (
            json.dumps(prop["default"], ensure_ascii=False) if "default" in prop else "-"
        )
        md.append(
            f"| `{name}` | `{cell(contract)}` | "
            f"{'Yes' if name in schema.get('required', []) else 'No'} | "
            f"`{cell(shown_default)}` | {cell(prop.get('description', ''))} |"
        )
    md.append("")
md += [
    (
        "Additional RSU validation: `net_quantity` cannot exceed gross `quantity`. "
        "The salary and RSU contracts are mapped to the normalized SQL tables documented above. "
        "RsuVesting.id is an optional API extension: returned IDs preserve a specific "
        "repeated event "
        "through whole-list saves; ID-less clients deterministically consume equal occurrences. "
        f"[Salary schema source]({GITHUB}backend/src/ledger_sync/schemas/salary.py)."
    ),
    "",
    "## Operational tables",
    "",
    "### `alembic_version`",
    "",
    (
        "Alembic maintains `version_num VARCHAR(32) NOT NULL PRIMARY KEY`. It records the "
        "applied migration revision; "
        "there is no user FK or application CRUD API. This repository has a linear migration "
        "chain, so one current "
        f"head row is expected. Source head is `{HEAD}`; this document did not query a live "
        "version row."
    ),
    "",
    "### `import_logs_duplicate_archive_20260917`",
    "",
    (
        "The prior 2026-09-17 reference reported this table as created by a user-executed "
        "archival repair. It holds the older duplicate "
        "import-log rows removed from the active idempotency table. Its existence and "
        "current row count were not independently "
        "confirmed by this offline refresh."
    ),
    "",
    "Expected structure from `CREATE TABLE ... AS SELECT * FROM import_logs WITH NO DATA`:",
    "",
    "| Column | Expected type | Expected NULL/default/key behavior |",
    "| --- | --- | --- |",
]
for c in next(t for t in tables if t["name"] == "import_logs")["columns"]:
    md.append(f"| `{c['name']}` | `{c['type']}` | Nullable; no copied default, PK, UNIQUE or FK. |")
md += [
    "",
    (
        "CREATE TABLE AS does not copy the original indexes, sequences/defaults, "
        "PK/UNIQUE/FK constraints or NOT NULL "
        "constraints. Therefore the archive's `id` is historical data, not an auto-generated "
        "PK, and `user_id` is only a "
        "stored identifier. It is outside the ORM and regular import history. User deletion "
        "does **not** automatically "
        "cascade to it under the described repair. Archive retention/cleanup requires an "
        "explicit operational decision."
    ),
    "",
    (
        f"The expected total is **{len(tables) + 2} tables only if** this archive exists and "
        "there are no other out-of-model tables: "
        f"{len(tables)} application tables + Alembic + the archive. This is not a "
        "live-verified database-wide count."
    ),
    "",
    "## Migration and model differences",
    "",
    "| Detail | What the source establishes |",
    "| --- | --- |",
    (
        "| Account settings | account_classifications is removed. Its classification/closure "
        "fields and exact credit limits belong to ledger_accounts. Legacy data is validated "
        "before consolidation; labels/aliases retain stable ownership. |"
    ),
    (
        "| AI settings | AI mode/provider/model, encrypted credentials and token limits belong "
        "to user_ai_settings. Historical NULL timestamps are retained. |"
    ),
    (
        "| Compensation records | Frozen migration validation precedes copying salary_plans, "
        "rsu_grants and ordered rsu_vestings. Invalid/ambiguous data fails without rounding, "
        "inferred ownership or deduplication. Only the ownerless literal empty compensation "
        "defaults are skipped. |"
    ),
    (
        "| Final domain cutover | `domain_storage_cutover_2026` verifies normalized business "
        "values before removing legacy source columns/tables. Current user_preferences has "
        f"{len(Base.metadata.tables['user_preferences'].columns)} mapped columns. The API still "
        "aggregates the prior response shapes. |"
    ),
    (
        "| ORM schema alignment | `orm_schema_alignment_2026` counts NULLs first and stops "
        "before any change if one exists, then sets NOT NULL on the 118 columns migrations left "
        "nullable, adds 10 ORM indexes and drops duplicate indexes. Nothing is backfilled; the "
        "revision is irreversible. `user_preferences.user_id` stays nullable for the preserved "
        "ownerless defaults row. |"
    ),
    (
        "| transactions.fingerprint_version | Current ORM insert default is 2; the migration "
        "adds a DB default of 1 for legacy/raw writers. A model-only schema creation and "
        "migrated database can therefore have different defaults. |"
    ),
    (
        "| uq_import_logs_user_file_hash | ORM declares a UNIQUE constraint; the "
        "schema-integrity migration creates a unique index. Both enforce the user/hash business "
        "key, but catalog object kinds differ. |"
    ),
    (
        "| uq_transactions_user_id | ORM declares a UNIQUE constraint; the schema-integrity "
        "migration creates a unique index supporting owner-qualified child FKs. |"
    ),
    (
        "| uq_users_auth_provider_identity | ORM declares a UNIQUE constraint; the "
        "identity-constraints migration creates a unique index without rebuilding users. |"
    ),
    (
        "| Other retained DB defaults | Earlier migrations may retain defaults not declared in "
        "current metadata. A dash in the dictionary's model-default column is not proof of no "
        "live default. |"
    ),
    "| funding_source | ORM default personal differs intentionally from DB default legacy. |",
    (
        "| updated_at | Most values and update behavior come from Python. financial_goals and "
        "tax_records declare a constant model DB default of 2026-01-01; this is not a "
        "current-time database trigger. |"
    ),
    (
        "| Active transaction indexes | Final PostgreSQL migration rebuilds six partial indexes "
        "with `is_deleted IS false`. The query predicate must match to obtain the intended plan. "
        "|"
    ),
    (
        "| Scheduled-source FK | Uses NO ACTION. Application unlinking preserves schedules when "
        "detected recurring rows are replaced. |"
    ),
    "",
    "September migration chain:",
    "",
]
for revision, details in sorted(REVISIONS.items(), key=lambda item: item[1]["path"]):
    if details["path"].name.startswith("202609"):
        md.append(f"- [`{revision}`]({source_link(details['path'])})")
md += [
    "",
    "## Scope and verification",
    "",
    (
        f"- Metadata extraction covered exactly {len(tables)} tables and "
        f"{data['counts']['columns']} columns, "
        f"{data['counts']['foreign_keys']} FKs, {data['counts']['explicit_indexes']} explicit "
        "indexes, "
        f"{data['counts']['unique_constraints']} additional UNIQUE constraints, "
        f"{data['counts']['check_constraints']} CHECK constraints and {len(enum_types)} enum types."
    ),
    (
        "- CHECK applicability: PostgreSQL "
        f"{data['counts_by_dialect']['postgresql']['check_constraints']}; "
        f"SQLite {data['counts_by_dialect']['sqlite']['check_constraints']}. SQLite uses "
        "enum-compatible strings, not native enum types."
    ),
    (
        "- Every model column has a description, nullability, PostgreSQL and SQLite types, "
        "default declaration and source link. "
        "Every FK, check, unique constraint and explicit index is listed; incoming "
        "references are listed on parent tables."
    ),
    (
        "- The generated SQL is an offline model representation. It was not executed and is "
        "not a substitute for Alembic "
        "migrations or a production schema dump."
    ),
    (
        "- This dictionary was generated offline. The current checkout includes unapplied domain "
        "migration source; generating this reference did not execute DDL or change production."
    ),
    (
        "- Live catalog parity, all database namespaces, out-of-model "
        "views/functions/triggers/policies, role grants, "
        "actual row counts, storage sizes, index usage and production query timings remain "
        "unverified. "
        "Application ownership filtering is not evidence that PostgreSQL row-level-security "
        "policies exist."
    ),
    (
        "- Read-path source references show where a model is used; they do not claim that "
        "every table has public "
        "create/read/update/delete endpoints."
    ),
    "",
    (
        "For formulas and API details, see [Calculations](CALCULATIONS.md), [API](API.md), "
        "[Database](DATABASE.md), and [Deployment](DEPLOYMENT.md)."
    ),
    "",
]
write_doc(OUT / "DATABASE_SCHEMA_REFERENCE.md", "\n".join(md))
write_doc(
    OUT / "DATABASE_SCHEMA_REFERENCE.json", json.dumps(data, indent=2, ensure_ascii=False) + "\n"
)
print(json.dumps(data["counts"], indent=2))
print(
    "Written:",
    *(
        p.name
        for p in [
            OUT / "DATABASE_SCHEMA_REFERENCE.md",
            OUT / "DATABASE_SCHEMA_REFERENCE.json",
            OUT / "DATABASE_MODEL_SCHEMA.sql",
        ]
    ),
)
