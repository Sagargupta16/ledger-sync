"""Add the tables behind the 2.31.0 features.

Revision ID: feature_domains_2026
Revises: money_manager_source_2026
Create Date: 2026-10-27 10:00:00.000000

Expand-only and additive: every change is a new table that no older backend
names, so the running backend and the next one both work before and after it.

- ``balance_checks``: statement balances the user enters per account and day.
- ``bank_alerts``: parsed bank SMS and email alerts (hashes, never the text).
- ``category_overrides``: Review Queue decisions per transaction.
- ``external_refs``: Money Manager repeat-rule and budget UIDs to local rows.
- ``foreign_asset_events`` and ``rsu_vest_fx``: RSU sales, dividends and the
  exchange rate each vest is valued at for an Indian return.
- ``mf_holdings``, ``mf_transactions`` and ``mf_nav_prices``: CAS mutual fund
  holdings and the shared AMFI NAV cache.
- ``push_subscriptions``: Web Push devices.
- ``saved_view_pins``: saved views pinned to the Dashboard watchlist.
- ``tax_ais_summaries``: totals kept from an Annual Information Statement.
- ``tax_deductions``: deduction amounts per tax year and section.
- ``transaction_embeddings``: semantic search vectors. PostgreSQL stores a
  pgvector ``vector(512)`` and needs the ``vector`` extension first; SQLite
  stores float32 bytes.

Each table is skipped when it already exists with the expected columns (a
``create_all`` bootstrap made it), and any other shape stops the revision
before a change. Creating a table takes no lock on an existing one beyond the
brief foreign-key reference, so the lock timeout only guards those.
"""

from collections.abc import Callable

import sqlalchemy as sa
from alembic import op
from pgvector.sqlalchemy import Vector

from ledger_sync.db.migrations.safety import irreversible

revision: str = "feature_domains_2026"
down_revision: str | None = "money_manager_source_2026"
branch_labels: str | None = None
depends_on: str | None = None

_LOCK_TIMEOUT = "10s"
_USER_FK = "users.id"
_EMBEDDING_DIMENSIONS = 512


def _user_id() -> sa.Column[int]:
    return sa.Column(
        "user_id", sa.Integer(), sa.ForeignKey(_USER_FK, ondelete="CASCADE"), nullable=False
    )


def _id() -> sa.Column[int]:
    return sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True)


def _money(name: str, *, nullable: bool = False) -> sa.Column[object]:
    return sa.Column(name, sa.Numeric(precision=15, scale=2), nullable=nullable)


def _ledger_row_fk(table: str) -> sa.ForeignKeyConstraint:
    return sa.ForeignKeyConstraint(
        ["user_id", "transaction_id"],
        ["transactions.user_id", "transactions.transaction_id"],
        name=f"fk_{table}_user_transaction",
        ondelete="CASCADE",
    )


def _balance_checks(_postgresql: bool) -> None:
    op.create_table(
        "balance_checks",
        _id(),
        _user_id(),
        sa.Column("account", sa.String(length=255), nullable=False),
        sa.Column("check_date", sa.Date(), nullable=False),
        _money("balance"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "user_id", "account", "check_date", name="uq_balance_checks_user_account_date"
        ),
    )


def _bank_alerts(_postgresql: bool) -> None:
    op.create_table(
        "bank_alerts",
        _id(),
        _user_id(),
        sa.Column("text_hash", sa.String(length=64), nullable=False),
        sa.Column("ref_hash", sa.String(length=64), nullable=True),
        sa.Column("direction", sa.String(length=6), nullable=False),
        _money("amount"),
        sa.Column("account_tail", sa.String(length=4), nullable=True),
        sa.Column("merchant", sa.String(length=60), nullable=True),
        sa.Column("bank", sa.String(length=16), nullable=True),
        sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.Column("received_at", sa.DateTime(), nullable=False),
        sa.Column("ignored_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("direction IN ('debit', 'credit')", name="ck_bank_alerts_direction"),
        sa.CheckConstraint(
            "amount > 0 AND amount <= 9999999999999.99", name="ck_bank_alerts_amount_bounds"
        ),
        sa.UniqueConstraint("user_id", "text_hash", name="uq_bank_alerts_user_text_hash"),
        sa.UniqueConstraint("user_id", "direction", "ref_hash", name="uq_bank_alerts_user_ref"),
    )
    op.create_index("ix_bank_alerts_user_occurred_on", "bank_alerts", ["user_id", "occurred_on"])


def _category_overrides(_postgresql: bool) -> None:
    op.create_table(
        "category_overrides",
        _id(),
        _user_id(),
        sa.Column("transaction_id", sa.String(length=64), nullable=False),
        sa.Column("decision", sa.String(length=10), nullable=False),
        sa.Column("category", sa.String(length=255), nullable=False),
        sa.Column("subcategory", sa.String(length=255), nullable=True),
        sa.Column("imported_category", sa.String(length=255), nullable=False),
        sa.Column("imported_subcategory", sa.String(length=255), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=False),
        _ledger_row_fk("category_overrides"),
        sa.UniqueConstraint(
            "user_id", "transaction_id", name="uq_category_overrides_user_transaction"
        ),
        sa.CheckConstraint("decision IN ('keep', 'change')", name="ck_category_overrides_decision"),
    )


def _external_refs(_postgresql: bool) -> None:
    op.create_table(
        "external_refs",
        _id(),
        _user_id(),
        sa.Column("source_system", sa.String(length=32), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("source_uid", sa.String(length=128), nullable=False),
        sa.Column("local_id", sa.Integer(), nullable=False),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "user_id",
            "source_system",
            "kind",
            "source_uid",
            name="uq_external_refs_user_source_kind_uid",
        ),
    )


def _rsu_vest_fx(postgresql: bool) -> None:
    # Unscaled NUMERIC on PostgreSQL and decimal text on SQLite, as in
    # compensation_records_2026 (CompensationDecimal).
    numeric = sa.Numeric() if postgresql else sa.Text()
    checks = [
        sa.CheckConstraint(
            "fx_source IN ('ecb', 'sbi_ttbr', 'employer')", name="ck_rsu_vest_fx_source"
        ),
        sa.CheckConstraint(
            "fx_source <> 'employer' OR employer_perquisite_inr IS NOT NULL",
            name="ck_rsu_vest_fx_employer",
        ),
        sa.CheckConstraint(
            "fx_source <> 'sbi_ttbr' OR "
            "(fx_rate IS NOT NULL AND fx_date IS NOT NULL AND quote_price IS NOT NULL)",
            name="ck_rsu_vest_fx_ttbr",
        ),
    ]
    if postgresql:
        checks.append(
            sa.CheckConstraint(
                "(fx_rate IS NULL OR fx_rate > 0) AND (quote_price IS NULL OR quote_price > 0) "
                "AND (employer_perquisite_inr IS NULL OR employer_perquisite_inr > 0)",
                name="ck_rsu_vest_fx_positive",
            )
        )
    op.create_table(
        "rsu_vest_fx",
        _id(),
        _user_id(),
        sa.Column(
            "vesting_id",
            sa.Text(),
            sa.ForeignKey("rsu_vestings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("fx_source", sa.String(length=16), nullable=False),
        sa.Column("fx_rate", numeric, nullable=True),
        sa.Column("fx_date", sa.Date(), nullable=True),
        sa.Column("quote_price", numeric, nullable=True),
        sa.Column("quote_currency", sa.String(length=3), nullable=False),
        sa.Column("employer_perquisite_inr", numeric, nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("vesting_id", name="uq_rsu_vest_fx_vesting"),
        *checks,
    )
    op.create_index("ix_rsu_vest_fx_user", "rsu_vest_fx", ["user_id"])


def _foreign_asset_events(postgresql: bool) -> None:
    numeric = sa.Numeric() if postgresql else sa.Text()
    checks = [
        sa.CheckConstraint("kind IN ('sale', 'dividend')", name="ck_foreign_asset_events_kind"),
        sa.CheckConstraint(
            "kind <> 'sale' OR quantity IS NOT NULL",
            name="ck_foreign_asset_events_sale_quantity",
        ),
    ]
    if postgresql:
        checks.append(
            sa.CheckConstraint(
                "gross_amount > 0 AND (quantity IS NULL OR quantity > 0) "
                "AND (tax_withheld IS NULL OR tax_withheld >= 0) "
                "AND (fx_rate IS NULL OR fx_rate > 0)",
                name="ck_foreign_asset_events_positive",
            )
        )
    op.create_table(
        "foreign_asset_events",
        _id(),
        _user_id(),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column(
            "vesting_id",
            sa.Text(),
            sa.ForeignKey("rsu_vestings.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("symbol", sa.Text(), nullable=False),
        sa.Column("event_date", sa.Date(), nullable=False),
        sa.Column("quantity", numeric, nullable=True),
        sa.Column("gross_amount", numeric, nullable=False),
        sa.Column("tax_withheld", numeric, nullable=True),
        sa.Column("fx_rate", numeric, nullable=True),
        sa.Column("fx_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        *checks,
    )
    op.create_index(
        "ix_foreign_asset_events_user_date", "foreign_asset_events", ["user_id", "event_date"]
    )
    op.create_index("ix_foreign_asset_events_vesting", "foreign_asset_events", ["vesting_id"])


def _mf_holdings(_postgresql: bool) -> None:
    op.create_table(
        "mf_holdings",
        _id(),
        _user_id(),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.Column("cas_type", sa.String(length=16), nullable=True),
        sa.Column("folio", sa.String(length=64), nullable=True),
        sa.Column("amc", sa.String(length=255), nullable=True),
        sa.Column("scheme_name", sa.String(length=500), nullable=False),
        sa.Column("isin", sa.String(length=12), nullable=True),
        sa.Column("amfi_code", sa.String(length=16), nullable=True),
        sa.Column("scheme_type", sa.String(length=32), nullable=True),
        sa.Column("open_units", sa.Numeric(precision=20, scale=6), nullable=True),
        sa.Column("units", sa.Numeric(precision=20, scale=6), nullable=False),
        _money("cost", nullable=True),
        sa.Column("statement_nav", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("statement_nav_date", sa.Date(), nullable=True),
        sa.Column("statement_from", sa.Date(), nullable=True),
        sa.Column("statement_to", sa.Date(), nullable=True),
        sa.Column("imported_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_mf_holdings_user_source", "mf_holdings", ["user_id", "source"])


def _mf_transactions(_postgresql: bool) -> None:
    op.create_table(
        "mf_transactions",
        _id(),
        sa.Column(
            "holding_id",
            sa.Integer(),
            sa.ForeignKey("mf_holdings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        _user_id(),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("txn_date", sa.Date(), nullable=False),
        sa.Column("txn_type", sa.String(length=32), nullable=False),
        _money("amount", nullable=True),
        sa.Column("units", sa.Numeric(precision=20, scale=6), nullable=True),
        sa.Column("nav", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("balance", sa.Numeric(precision=20, scale=6), nullable=True),
        sa.UniqueConstraint("holding_id", "sequence", name="uq_mf_transactions_holding_sequence"),
    )
    op.create_index("ix_mf_transactions_user", "mf_transactions", ["user_id"])


def _mf_nav_prices(_postgresql: bool) -> None:
    # Public AMFI data shared by every user, so no user_id.
    op.create_table(
        "mf_nav_prices",
        _id(),
        sa.Column("lookup_key", sa.String(length=40), nullable=False),
        sa.Column("scheme_code", sa.String(length=16), nullable=True),
        sa.Column("scheme_name", sa.String(length=500), nullable=True),
        sa.Column("nav", sa.Numeric(precision=18, scale=6), nullable=True),
        sa.Column("nav_date", sa.Date(), nullable=True),
        sa.Column("checked_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("lookup_key", name="uq_mf_nav_prices_lookup_key"),
    )


def _push_subscriptions(_postgresql: bool) -> None:
    op.create_table(
        "push_subscriptions",
        _id(),
        _user_id(),
        sa.Column("endpoint", sa.String(length=2048), nullable=False),
        sa.Column("p256dh_key", sa.String(length=128), nullable=False),
        sa.Column("auth_key", sa.String(length=64), nullable=False),
        sa.Column("label", sa.String(length=80), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_success_at", sa.DateTime(), nullable=True),
        sa.Column("alert_keys", sa.Text(), nullable=False),
        sa.UniqueConstraint("endpoint", name="uq_push_subscriptions_endpoint"),
    )
    op.create_index("ix_push_subscriptions_user_id", "push_subscriptions", ["user_id"])


def _saved_view_pins(_postgresql: bool) -> None:
    op.create_table(
        "saved_view_pins",
        _id(),
        _user_id(),
        sa.Column(
            "view_id",
            sa.Integer(),
            sa.ForeignKey("saved_filter_views.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", "view_id", name="uq_saved_view_pins_user_view"),
    )


def _tax_ais_summaries(_postgresql: bool) -> None:
    op.create_table(
        "tax_ais_summaries",
        _id(),
        _user_id(),
        sa.Column("tax_year", sa.String(length=7), nullable=False),
        _money("tds_salary"),
        _money("tds_other"),
        _money("interest"),
        _money("dividends"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("user_id", "tax_year", name="uq_tax_ais_summaries_user_year"),
        sa.CheckConstraint(
            "tds_salary >= 0 AND tds_other >= 0 AND interest >= 0 AND dividends >= 0",
            name="ck_tax_ais_summaries_amounts_non_negative",
        ),
    )


def _tax_deductions(_postgresql: bool) -> None:
    op.create_table(
        "tax_deductions",
        _id(),
        _user_id(),
        sa.Column("tax_year", sa.String(length=7), nullable=False),
        sa.Column("section_key", sa.String(length=16), nullable=False),
        _money("amount"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "user_id", "tax_year", "section_key", name="uq_tax_deductions_user_year_section"
        ),
        sa.CheckConstraint("amount > 0", name="ck_tax_deductions_amount_positive"),
    )


def _transaction_embeddings(postgresql: bool) -> None:
    op.create_table(
        "transaction_embeddings",
        _id(),
        _user_id(),
        sa.Column("transaction_id", sa.String(length=64), nullable=False),
        sa.Column("model", sa.String(length=64), nullable=False),
        sa.Column("text_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "embedding",
            Vector(_EMBEDDING_DIMENSIONS) if postgresql else sa.LargeBinary(),
            nullable=False,
        ),
        sa.Column("embedded_at", sa.DateTime(), nullable=False),
        _ledger_row_fk("transaction_embeddings"),
        sa.UniqueConstraint(
            "user_id", "transaction_id", name="uq_transaction_embeddings_user_transaction"
        ),
    )


#: Table -> (expected columns, builder). Parents precede their children.
_TABLES: dict[str, tuple[frozenset[str], Callable[[bool], None]]] = {
    "balance_checks": (
        frozenset(
            {"id", "user_id", "account", "check_date", "balance", "created_at", "updated_at"}
        ),
        _balance_checks,
    ),
    "bank_alerts": (
        frozenset(
            {
                "id",
                "user_id",
                "text_hash",
                "ref_hash",
                "direction",
                "amount",
                "account_tail",
                "merchant",
                "bank",
                "occurred_on",
                "received_at",
                "ignored_at",
            }
        ),
        _bank_alerts,
    ),
    "category_overrides": (
        frozenset(
            {
                "id",
                "user_id",
                "transaction_id",
                "decision",
                "category",
                "subcategory",
                "imported_category",
                "imported_subcategory",
                "reviewed_at",
            }
        ),
        _category_overrides,
    ),
    "external_refs": (
        frozenset(
            {
                "id",
                "user_id",
                "source_system",
                "kind",
                "source_uid",
                "local_id",
                "fingerprint",
                "created_at",
                "updated_at",
            }
        ),
        _external_refs,
    ),
    "rsu_vest_fx": (
        frozenset(
            {
                "id",
                "user_id",
                "vesting_id",
                "fx_source",
                "fx_rate",
                "fx_date",
                "quote_price",
                "quote_currency",
                "employer_perquisite_inr",
                "created_at",
                "updated_at",
            }
        ),
        _rsu_vest_fx,
    ),
    "foreign_asset_events": (
        frozenset(
            {
                "id",
                "user_id",
                "kind",
                "vesting_id",
                "symbol",
                "event_date",
                "quantity",
                "gross_amount",
                "tax_withheld",
                "fx_rate",
                "fx_date",
                "notes",
                "created_at",
            }
        ),
        _foreign_asset_events,
    ),
    "mf_holdings": (
        frozenset(
            {
                "id",
                "user_id",
                "source",
                "cas_type",
                "folio",
                "amc",
                "scheme_name",
                "isin",
                "amfi_code",
                "scheme_type",
                "open_units",
                "units",
                "cost",
                "statement_nav",
                "statement_nav_date",
                "statement_from",
                "statement_to",
                "imported_at",
            }
        ),
        _mf_holdings,
    ),
    "mf_transactions": (
        frozenset(
            {
                "id",
                "holding_id",
                "user_id",
                "sequence",
                "txn_date",
                "txn_type",
                "amount",
                "units",
                "nav",
                "balance",
            }
        ),
        _mf_transactions,
    ),
    "mf_nav_prices": (
        frozenset(
            {"id", "lookup_key", "scheme_code", "scheme_name", "nav", "nav_date", "checked_at"}
        ),
        _mf_nav_prices,
    ),
    "push_subscriptions": (
        frozenset(
            {
                "id",
                "user_id",
                "endpoint",
                "p256dh_key",
                "auth_key",
                "label",
                "created_at",
                "last_success_at",
                "alert_keys",
            }
        ),
        _push_subscriptions,
    ),
    "saved_view_pins": (
        frozenset({"id", "user_id", "view_id", "position", "created_at"}),
        _saved_view_pins,
    ),
    "tax_ais_summaries": (
        frozenset(
            {
                "id",
                "user_id",
                "tax_year",
                "tds_salary",
                "tds_other",
                "interest",
                "dividends",
                "created_at",
                "updated_at",
            }
        ),
        _tax_ais_summaries,
    ),
    "tax_deductions": (
        frozenset(
            {"id", "user_id", "tax_year", "section_key", "amount", "created_at", "updated_at"}
        ),
        _tax_deductions,
    ),
    "transaction_embeddings": (
        frozenset(
            {"id", "user_id", "transaction_id", "model", "text_hash", "embedding", "embedded_at"}
        ),
        _transaction_embeddings,
    ),
}


def _check_existing(inspector: sa.Inspector) -> list[str]:
    """Names of the tables still to create; stop on any existing table of another shape."""
    missing = []
    for table, (expected, _build) in _TABLES.items():
        if not inspector.has_table(table):
            missing.append(table)
            continue
        columns = {column["name"] for column in inspector.get_columns(table)}
        if columns != expected:
            raise RuntimeError(
                f"{table} exists with unexpected columns. No rows or schema were changed; "
                "resolve the table explicitly and rerun."
            )
    return missing


def upgrade() -> None:
    if op.get_context().as_sql:
        raise RuntimeError("The feature domains revision requires an online schema check.")
    bind = op.get_bind()
    postgresql = bind.dialect.name == "postgresql"
    # Every shape check runs before the first change.
    missing = _check_existing(sa.inspect(bind))
    if postgresql:
        bind.exec_driver_sql(f"SET LOCAL lock_timeout = '{_LOCK_TIMEOUT}'")
        if "transaction_embeddings" in missing:
            # Neon ships pgvector on every plan; IF NOT EXISTS keeps reruns safe.
            bind.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS vector")
    for table in missing:
        _TABLES[table][1](postgresql)


@irreversible
def downgrade() -> None:
    """Dropping these would discard balance checks, review decisions, deductions,
    RSU records, pins, push devices and imported holdings the user entered."""
