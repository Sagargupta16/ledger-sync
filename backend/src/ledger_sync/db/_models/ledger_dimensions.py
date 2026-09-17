"""User-owned ledger identities alongside historical transaction label snapshots.

Names are the first observed spelling. Keys use Python ``str.lower()`` (not
casefold, whitespace normalization, or fuzzy matching). These tables do not
rename transaction labels or normalize preferences, classifications, or plans.
"""

from sqlalchemy import ForeignKey, ForeignKeyConstraint, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ledger_sync.db._models._constants import USER_FK
from ledger_sync.db.base import Base


class LedgerAccount(Base):
    """Stable identity shared by an account and either leg of a transfer."""

    __tablename__ = "ledger_accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(USER_FK, ondelete="CASCADE"), nullable=False)
    key: Mapped[str] = mapped_column(String(765), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "id", name="uq_ledger_accounts_user_id"),
        UniqueConstraint("user_id", "key", name="uq_ledger_accounts_user_key"),
        {"sqlite_autoincrement": True},
    )


class LedgerAccountAlias(Base):
    """An exact lowercased source account label, scoped to its owner.

    A single key represents case variants, with its first source spelling kept
    as ``label``. Every original spelling remains on its transaction snapshot.
    There is intentionally no alias-management or account-merging API.
    """

    __tablename__ = "ledger_account_aliases"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(USER_FK, ondelete="CASCADE"), nullable=False)
    account_id: Mapped[int] = mapped_column(Integer, nullable=False)
    source_key: Mapped[str] = mapped_column(String(765), nullable=False)
    label: Mapped[str] = mapped_column(String(255), nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "source_key", name="uq_ledger_aliases_user_source"),
        ForeignKeyConstraint(
            ["user_id", "account_id"],
            ["ledger_accounts.user_id", "ledger_accounts.id"],
            name="fk_ledger_aliases_account",
        ),
        {"sqlite_autoincrement": True},
    )


class LedgerCategory(Base):
    """Stable category identity; stored display labels remain snapshots."""

    __tablename__ = "ledger_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(USER_FK, ondelete="CASCADE"), nullable=False)
    key: Mapped[str] = mapped_column(String(765), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "id", name="uq_ledger_categories_user_id"),
        UniqueConstraint("user_id", "key", name="uq_ledger_categories_user_key"),
        {"sqlite_autoincrement": True},
    )


class LedgerSubcategory(Base):
    """Subcategory identity includes its category and owner."""

    __tablename__ = "ledger_subcategories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(USER_FK, ondelete="CASCADE"), nullable=False)
    category_id: Mapped[int] = mapped_column(Integer, nullable=False)
    key: Mapped[str] = mapped_column(String(765), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "user_id", "category_id", "id", name="uq_ledger_subcategories_user_parent_id"
        ),
        UniqueConstraint(
            "user_id", "category_id", "key", name="uq_ledger_subcategories_user_parent_key"
        ),
        ForeignKeyConstraint(
            ["user_id", "category_id"],
            ["ledger_categories.user_id", "ledger_categories.id"],
            name="fk_ledger_subcategories_category",
        ),
        {"sqlite_autoincrement": True},
    )
