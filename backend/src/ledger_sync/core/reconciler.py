"""User-scoped snapshot reconciliation with stable public transaction IDs."""

from collections import defaultdict
from datetime import date, datetime
from typing import Any

from sqlalchemy import update
from sqlalchemy.orm import Session

from ledger_sync.core.import_identity import (
    ImportIdentity,
    identity_for,
    load_identity_matches,
    row_fingerprint,
)
from ledger_sync.core.reconciler_helpers import (
    ReconciliationStats,
    are_enum_values_equal,
    are_string_values_equal,
    update_stats_for_action,
)
from ledger_sync.core.reconciler_transfers import TransferReconcilerMixin
from ledger_sync.db.models import Transaction, TransactionType
from ledger_sync.ingest.hash_id import TransactionHasher
from ledger_sync.ingest.normalizer import NormalizationError
from ledger_sync.services.ledger_dimensions import attach_ledger_dimensions

USER_ID_REQUIRED_MSG = "user_id is required for reconciliation"
_DIMENSION_FIELDS = (
    "account_id",
    "from_account_id",
    "to_account_id",
    "category_id",
    "subcategory_id",
)
_VALUE_FIELDS = ("category", "subcategory", "note", "type", "currency")
__all__ = ["Reconciler", "ReconciliationStats"]


class Reconciler(TransferReconcilerMixin):
    """Persist normalized rows; the caller owns commit, rollback and snapshot scope."""

    def __init__(self, session: Session, user_id: int | None = None) -> None:
        self.session = session
        self.user_id = user_id
        self.hasher = TransactionHasher()
        self.affected_dates: set[date] = set()

    def _ensure_user_id(self) -> int:
        if self.user_id is None:
            raise ValueError(USER_ID_REQUIRED_MSG)
        return self.user_id

    def _apply_existing_update(
        self,
        existing: Transaction,
        row: dict[str, Any],
        identity: ImportIdentity,
        import_time: datetime,
    ) -> str:
        changed = bool(existing.is_deleted)
        for field in (*_VALUE_FIELDS, "from_account", "to_account"):
            if field not in row:
                continue
            compare = are_enum_values_equal if field == "type" else are_string_values_equal
            if not compare(row[field], getattr(existing, field)):
                setattr(existing, field, row[field])
                changed = True
        for field in _DIMENSION_FIELDS:
            setattr(existing, field, row.get(field))
        existing.source_fingerprint = identity.fingerprint
        existing.fingerprint_version = 2
        existing.last_seen_at = import_time
        existing.is_deleted = False
        if changed:
            self.affected_dates.add(existing.date.date())
        return "updated" if changed else "skipped"

    def _persist_rows(
        self,
        rows: list[dict[str, Any]],
        identities: list[ImportIdentity],
        source_file: str,
        import_time: datetime,
    ) -> list[tuple[Transaction, str]]:
        """Resolve rows in bounded queries, then flush the complete batch."""
        user_id = self._ensure_user_id()
        if rows and any("account_id" not in row for row in rows):
            attach_ledger_dimensions(self.session, user_id, rows)
        matches = load_identity_matches(self.session, user_id, rows, identities)
        results: list[tuple[Transaction, str]] = []
        for row, identity in zip(rows, identities, strict=True):
            existing = matches.get(identity.fingerprint)
            if existing is not None:
                action = self._apply_existing_update(existing, row, identity, import_time)
                results.append((existing, action))
                continue
            transaction = Transaction(
                transaction_id=identity.fingerprint,
                source_fingerprint=identity.fingerprint,
                fingerprint_version=2,
                user_id=user_id,
                date=row["date"],
                amount=row["amount"],
                currency=row["currency"],
                type=row["type"],
                account=row["account"],
                category=row["category"],
                subcategory=row.get("subcategory"),
                note=row.get("note"),
                from_account=row.get("from_account"),
                to_account=row.get("to_account"),
                source_file=source_file,
                last_seen_at=import_time,
                is_deleted=False,
                **{field: row.get(field) for field in _DIMENSION_FIELDS},
            )
            self.session.add(transaction)
            self.affected_dates.add(transaction.date.date())
            results.append((transaction, "inserted"))
        self.session.flush()
        return results

    def reconcile_transaction(
        self,
        normalized_row: dict[str, Any],
        source_file: str,
        import_time: datetime,
        *,
        occurrence: int = 0,
    ) -> tuple[Transaction, str]:
        """Reconcile one row without sweeping other transactions."""
        identity = identity_for(normalized_row, self._ensure_user_id(), occurrence)
        return self._persist_rows([normalized_row], [identity], source_file, import_time)[0]

    def _mark_soft_deletes(self, import_time: datetime, *, transfers: bool) -> int:
        user_id = self._ensure_user_id()
        type_filter = (
            Transaction.type == TransactionType.TRANSFER
            if transfers
            else Transaction.type != TransactionType.TRANSFER
        )
        statement = (
            update(Transaction)
            .where(
                Transaction.user_id == user_id,
                Transaction.last_seen_at < import_time,
                Transaction.is_deleted.is_(False),
                type_filter,
            )
            .values(is_deleted=True)
            .returning(Transaction.date)
            .execution_options(synchronize_session="fetch")
        )
        dates = list(self.session.scalars(statement))
        self.affected_dates.update(value.date() for value in dates)
        return len(dates)

    def mark_soft_deletes(self, import_time: datetime) -> int:
        return self._mark_soft_deletes(import_time, transfers=False)

    def reconcile_batch(
        self, normalized_rows: list[dict[str, Any]], source_file: str, import_time: datetime
    ) -> ReconciliationStats:
        """Reconcile a complete income/expense snapshot, preserving multiplicity."""
        user_id = self._ensure_user_id()
        occurrences: dict[str, int] = defaultdict(int)
        identities: list[ImportIdentity] = []
        for row in normalized_rows:
            try:
                base = row_fingerprint(row, user_id)
                occurrence = occurrences[base]
                occurrences[base] += 1
                identities.append(identity_for(row, user_id, occurrence))
            except (ValueError, TypeError, KeyError) as error:
                raise NormalizationError(f"Invalid transaction in snapshot: {error}") from error
        stats = ReconciliationStats()
        for _, action in self._persist_rows(normalized_rows, identities, source_file, import_time):
            stats.processed += 1
            update_stats_for_action(stats, action)
        stats.deleted = self.mark_soft_deletes(import_time)
        return stats
