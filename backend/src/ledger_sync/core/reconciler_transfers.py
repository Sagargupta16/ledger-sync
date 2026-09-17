"""Pair transfer legs by explicit source identity, retaining duplicate transfers."""

from collections import defaultdict
from datetime import datetime
from typing import Any

from ledger_sync.core.import_identity import ImportIdentity, identity_for, row_fingerprint
from ledger_sync.core.reconciler_helpers import ReconciliationStats, update_stats_for_action
from ledger_sync.db.models import Transaction
from ledger_sync.ingest.normalizer import NormalizationError


class TransferReconcilerMixin:
    """Transfer preparation delegates persistence and ownership to Reconciler."""

    def _ensure_user_id(self) -> int:
        raise NotImplementedError

    def _persist_rows(
        self,
        rows: list[dict[str, Any]],
        identities: list[ImportIdentity],
        source_file: str,
        import_time: datetime,
    ) -> list[tuple[Transaction, str]]:
        raise NotImplementedError

    def _mark_soft_deletes(self, import_time: datetime, *, transfers: bool) -> int:
        raise NotImplementedError

    def reconcile_transfer(
        self,
        normalized_row: dict[str, Any],
        source_file: str,
        import_time: datetime,
        *,
        occurrence: int = 0,
    ) -> tuple[Transaction, str]:
        identity = identity_for(normalized_row, self._ensure_user_id(), occurrence)
        return self._persist_rows([normalized_row], [identity], source_file, import_time)[0]

    def mark_soft_deletes_transfers(self, import_time: datetime) -> int:
        return self._mark_soft_deletes(import_time, transfers=True)

    def reconcile_transfers_batch(
        self, normalized_rows: list[dict[str, Any]], source_file: str, import_time: datetime
    ) -> ReconciliationStats:
        """Pair the nth In with nth Out for each exact transfer source shape."""
        user_id = self._ensure_user_id()
        occurrences: dict[tuple[str, str], int] = defaultdict(int)
        seen: set[str] = set()
        retained: list[dict[str, Any]] = []
        identities: list[ImportIdentity] = []
        stats = ReconciliationStats()
        for row in normalized_rows:
            try:
                key = (row_fingerprint(row, user_id), row.get("transfer_leg", "out"))
                occurrence = occurrences[key]
                occurrences[key] += 1
                identity = identity_for(row, user_id, occurrence)
            except (ValueError, TypeError, KeyError) as error:
                raise NormalizationError(f"Invalid transfer in snapshot: {error}") from error
            stats.processed += 1
            if identity.fingerprint in seen:
                stats.skipped += 1
                continue
            seen.add(identity.fingerprint)
            retained.append(row)
            identities.append(identity)
        for _, action in self._persist_rows(retained, identities, source_file, import_time):
            update_stats_for_action(stats, action)
        stats.deleted = self.mark_soft_deletes_transfers(import_time)
        return stats
